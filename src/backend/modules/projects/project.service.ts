import { getDb, withTransaction } from '#/backend/db/client'
import { conflictError, notFoundError, validationError } from '#/backend/shared/error'
import type {
  AdminProjectDetail,
  AdminProjectList,
  AdminProjectListItem,
  PublicProject,
} from '#/shared/types/project.types'
import {
  PROJECT_LANGUAGES,
  PROJECT_PAGE_SIZE,
  type ProjectFilterInput,
  type ProjectLanguage,
  type ProjectStatus,
  type ProjectWriteInput,
  missingPublishRequirements,
} from '#/shared/validation/project.validation'

/** Postgres' unique-violation code. A taken slug is a conflict, not a 500. */
const UNIQUE_VIOLATION = '23505'

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION

/**
 * Prefer English, then German, then Arabic when picking the one title the
 * admin table shows. Any order would do; a fixed one keeps the list stable.
 */
const TITLE_LANGUAGE_ORDER = `CASE pt.language WHEN 'en' THEN 1 WHEN 'de' THEN 2 ELSE 3 END`

type AdminListRow = {
  id: string
  slug: string
  status: ProjectStatus
  is_published: boolean
  sort_order: number
  display_name: string | null
  languages: ProjectLanguage[] | null
  tech: string[] | null
  image_count: string | number
  updated_at: Date
}

/**
 * Builds the shared WHERE clause for the list and its count. Both have to see
 * exactly the same rows, so the fragment is written once.
 */
const buildListFilter = (filter: ProjectFilterInput) => {
  const conditions: string[] = []
  const values: unknown[] = []

  if (filter.search) {
    values.push(`%${filter.search}%`)
    const placeholder = `$${values.length}`

    conditions.push(`(
      p.slug ILIKE ${placeholder}
      OR EXISTS (
        SELECT 1 FROM project_translations pt
         WHERE pt.project_id = p.id AND (pt.name ILIKE ${placeholder} OR pt.summary ILIKE ${placeholder})
      )
    )`)
  }

  if (filter.status !== 'all') {
    values.push(filter.status)
    conditions.push(`p.status = $${values.length}`)
  }

  if (filter.published !== 'all') {
    values.push(filter.published === 'published')
    conditions.push(`p.is_published = $${values.length}`)
  }

  if (filter.tech) {
    values.push(filter.tech)
    conditions.push(`EXISTS (
      SELECT 1 FROM project_tech ptech
       WHERE ptech.project_id = p.id AND ptech.name ILIKE $${values.length}
    )`)
  }

  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values }
}

export const listProjectsForAdmin = async (filter: ProjectFilterInput): Promise<AdminProjectList> => {
  const db = getDb()
  const { where, values } = buildListFilter(filter)

  const totalResult = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM projects p ${where};`,
    values,
  )

  const total = Number(totalResult.rows[0]?.count ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / PROJECT_PAGE_SIZE))
  // A filter that shrinks the list must not leave the user stranded on a page
  // that no longer exists, so the requested page is clamped rather than empty.
  const page = Math.min(filter.page, pageCount)

  const rows = await db.query<AdminListRow>(
    `SELECT
        p.id,
        p.slug,
        p.status,
        p.is_published,
        p.sort_order,
        p.updated_at,
        title.name AS display_name,
        (
          SELECT array_agg(pt.language ORDER BY pt.language)
            FROM project_translations pt WHERE pt.project_id = p.id
        ) AS languages,
        (
          SELECT array_agg(ptech.name ORDER BY ptech.sort_order, ptech.name)
            FROM project_tech ptech WHERE ptech.project_id = p.id
        ) AS tech,
        (SELECT count(*) FROM project_images pi WHERE pi.project_id = p.id) AS image_count
       FROM projects p
       LEFT JOIN LATERAL (
         SELECT pt.name FROM project_translations pt
          WHERE pt.project_id = p.id
          ORDER BY ${TITLE_LANGUAGE_ORDER}
          LIMIT 1
       ) title ON true
       ${where}
      ORDER BY p.sort_order, p.created_at
      LIMIT $${values.length + 1} OFFSET $${values.length + 2};`,
    [...values, PROJECT_PAGE_SIZE, (page - 1) * PROJECT_PAGE_SIZE],
  )

  const items: AdminProjectListItem[] = rows.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    status: row.status,
    isPublished: row.is_published,
    sortOrder: row.sort_order,
    // A project with no translation at all still has to be identifiable.
    displayName: row.display_name ?? row.slug,
    languages: row.languages ?? [],
    tech: row.tech ?? [],
    imageCount: Number(row.image_count),
    updatedAt: row.updated_at.toISOString(),
  }))

  return { items, total, page, pageCount }
}

type DetailRow = {
  id: string
  slug: string
  status: ProjectStatus
  website_url: string | null
  source_url: string | null
  is_published: boolean
  sort_order: number
  created_at: Date
  updated_at: Date
}

const loadProjectChildren = async (projectId: string) => {
  const db = getDb()

  const [tech, images, translations] = await Promise.all([
    db.query<{ name: string }>(
      `SELECT name FROM project_tech WHERE project_id = $1 ORDER BY sort_order, name;`,
      [projectId],
    ),
    db.query<{
      id: string
      src: string
      width: number
      height: number
      is_cover: boolean
      alt: Array<{ language: ProjectLanguage; alt: string }> | null
    }>(
      `SELECT
          pi.id,
          pi.src,
          pi.width,
          pi.height,
          pi.is_cover,
          (
            SELECT json_agg(json_build_object('language', pit.language, 'alt', pit.alt))
              FROM project_image_translations pit WHERE pit.project_image_id = pi.id
          ) AS alt
         FROM project_images pi
        WHERE pi.project_id = $1
        ORDER BY pi.is_cover DESC, pi.sort_order, pi.created_at;`,
      [projectId],
    ),
    db.query<{
      language: ProjectLanguage
      name: string
      kind: string
      summary: string
      problem: string
      approach: string
      shows: string
      features: string[]
    }>(
      `SELECT language, name, kind, summary, problem, approach, shows, features
         FROM project_translations WHERE project_id = $1;`,
      [projectId],
    ),
  ])

  return {
    tech: tech.rows.map((row) => row.name),
    images: images.rows.map((row) => ({
      src: row.src,
      width: row.width,
      height: row.height,
      isCover: row.is_cover,
      alt: Object.fromEntries((row.alt ?? []).map((entry) => [entry.language, entry.alt])) as Partial<
        Record<ProjectLanguage, string>
      >,
    })),
    translations: Object.fromEntries(
      translations.rows.map(({ language, ...copy }) => [language, copy]),
    ) as AdminProjectDetail['translations'],
  }
}

export const getProjectForAdmin = async (id: string): Promise<AdminProjectDetail> => {
  const result = await getDb().query<DetailRow>(
    `SELECT id, slug, status, website_url, source_url, is_published, sort_order, created_at, updated_at
       FROM projects WHERE id = $1;`,
    [id],
  )

  const project = result.rows[0]
  if (!project) throw notFoundError('That project does not exist')

  const children = await loadProjectChildren(project.id)

  return {
    id: project.id,
    slug: project.slug,
    status: project.status,
    websiteUrl: project.website_url,
    sourceUrl: project.source_url,
    isPublished: project.is_published,
    sortOrder: project.sort_order,
    createdAt: project.created_at.toISOString(),
    updatedAt: project.updated_at.toISOString(),
    ...children,
  }
}

/**
 * A published project is one a visitor can read in any of the three
 * languages. Refusing here rather than in the form is what keeps that true
 * for anything written straight to the API.
 */
const assertPublishable = (input: ProjectWriteInput) => {
  if (!input.isPublished) return

  const missing = missingPublishRequirements(input)

  if (missing.length > 0) {
    throw validationError('This project cannot be published yet', { missing })
  }
}

/** Children are replaced wholesale on every save; see `ProjectWriteSchema`. */
const writeProjectChildren = async (projectId: string, input: ProjectWriteInput) => {
  const db = getDb()

  await db.query('DELETE FROM project_tech WHERE project_id = $1;', [projectId])
  await db.query('DELETE FROM project_images WHERE project_id = $1;', [projectId])
  await db.query('DELETE FROM project_translations WHERE project_id = $1;', [projectId])

  for (const [index, name] of input.tech.entries()) {
    await db.query(
      'INSERT INTO project_tech (project_id, name, sort_order) VALUES ($1, $2, $3);',
      [projectId, name, index],
    )
  }

  // Only the first image flagged as cover keeps the flag: the database allows
  // one per project, and a form that sent two should not fail with a raw
  // constraint error.
  let coverTaken = false

  for (const [index, image] of input.images.entries()) {
    const isCover = image.isCover && !coverTaken
    if (isCover) coverTaken = true

    const inserted = await db.query<{ id: string }>(
      `INSERT INTO project_images (project_id, src, width, height, is_cover, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;`,
      [projectId, image.src, image.width, image.height, isCover, index],
    )

    const imageId = inserted.rows[0]?.id
    if (!imageId) continue

    for (const language of PROJECT_LANGUAGES) {
      const alt = image.alt[language]
      if (!alt) continue

      await db.query(
        'INSERT INTO project_image_translations (project_image_id, language, alt) VALUES ($1, $2, $3);',
        [imageId, language, alt],
      )
    }
  }

  for (const language of PROJECT_LANGUAGES) {
    const copy = input.translations[language]
    if (!copy) continue

    await db.query(
      `INSERT INTO project_translations
         (project_id, language, name, kind, summary, problem, approach, shows, features)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
      [
        projectId,
        language,
        copy.name,
        copy.kind,
        copy.summary,
        copy.problem,
        copy.approach,
        copy.shows,
        copy.features,
      ],
    )
  }
}

export const createProject = async (input: ProjectWriteInput): Promise<AdminProjectDetail> => {
  assertPublishable(input)

  const id = await withTransaction(async (db) => {
    // New projects go to the end of the owner's order.
    const next = await db.query<{ next: number }>(
      'SELECT COALESCE(max(sort_order), -1) + 1 AS next FROM projects;',
    )

    const created = await db
      .query<{ id: string }>(
        `INSERT INTO projects (slug, status, website_url, source_url, is_published, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;`,
        [
          input.slug,
          input.status,
          input.websiteUrl,
          input.sourceUrl,
          input.isPublished,
          next.rows[0]?.next ?? 0,
        ],
      )
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw conflictError('A project with that slug already exists')
        throw error
      })

    const projectId = created.rows[0]?.id
    if (!projectId) throw notFoundError('The project could not be created')

    await writeProjectChildren(projectId, input)

    return projectId
  })

  return getProjectForAdmin(id)
}

export const updateProject = async (
  id: string,
  input: ProjectWriteInput,
): Promise<AdminProjectDetail> => {
  assertPublishable(input)

  await withTransaction(async (db) => {
    const updated = await db
      .query<{ id: string }>(
        `UPDATE projects
            SET slug = $2,
                status = $3,
                website_url = $4,
                source_url = $5,
                is_published = $6,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        RETURNING id;`,
        [id, input.slug, input.status, input.websiteUrl, input.sourceUrl, input.isPublished],
      )
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw conflictError('A project with that slug already exists')
        throw error
      })

    if (!updated.rows[0]) throw notFoundError('That project does not exist')

    await writeProjectChildren(id, input)
  })

  return getProjectForAdmin(id)
}

export const deleteProject = async (id: string): Promise<void> => {
  const result = await getDb().query('DELETE FROM projects WHERE id = $1;', [id])

  if (result.rowCount === 0) throw notFoundError('That project does not exist')
}

/** Takes the full ordered list of ids and rewrites `sort_order` to match it. */
export const reorderProjects = async (ids: string[]): Promise<void> => {
  await withTransaction(async (db) => {
    for (const [index, id] of ids.entries()) {
      await db.query('UPDATE projects SET sort_order = $2 WHERE id = $1;', [id, index])
    }
  })
}

type PublicRow = {
  slug: string
  status: ProjectStatus
  website_url: string | null
  source_url: string | null
  name: string
  kind: string
  summary: string
  problem: string
  approach: string
  shows: string
  features: string[]
  tech: string[] | null
  images: Array<{ src: string; width: number; height: number; alt: string | null }> | null
}

const toPublicProject = (row: PublicRow): PublicProject => ({
  slug: row.slug,
  status: row.status,
  website: row.website_url,
  source: row.source_url,
  tech: row.tech ?? [],
  images: (row.images ?? []).map((image) => ({
    src: image.src,
    width: image.width,
    height: image.height,
    alt: image.alt ?? '',
  })),
  name: row.name,
  kind: row.kind,
  summary: row.summary,
  problem: row.problem,
  approach: row.approach,
  shows: row.shows,
  features: row.features,
})

/**
 * The public projection. `language` picks the copy and the alt text; nothing
 * unpublished, and no column the visitor has no business seeing, is selected.
 */
const publicSelect = `
  SELECT
    p.slug,
    p.status,
    p.website_url,
    p.source_url,
    t.name,
    t.kind,
    t.summary,
    t.problem,
    t.approach,
    t.shows,
    t.features,
    (
      SELECT array_agg(ptech.name ORDER BY ptech.sort_order, ptech.name)
        FROM project_tech ptech WHERE ptech.project_id = p.id
    ) AS tech,
    (
      SELECT json_agg(image ORDER BY image.is_cover DESC, image.sort_order, image.created_at)
        FROM (
          SELECT pi.src, pi.width, pi.height, pi.is_cover, pi.sort_order, pi.created_at, pit.alt
            FROM project_images pi
            LEFT JOIN project_image_translations pit
              ON pit.project_image_id = pi.id AND pit.language = $1
           WHERE pi.project_id = p.id
        ) AS image
    ) AS images
   FROM projects p
   JOIN project_translations t ON t.project_id = p.id AND t.language = $1
`

export const listPublishedProjects = async (language: ProjectLanguage): Promise<PublicProject[]> => {
  const result = await getDb().query<PublicRow>(
    `${publicSelect} WHERE p.is_published ORDER BY p.sort_order, p.created_at;`,
    [language],
  )

  return result.rows.map(toPublicProject)
}

export const getPublishedProject = async (
  language: ProjectLanguage,
  slug: string,
): Promise<PublicProject | null> => {
  const result = await getDb().query<PublicRow>(
    `${publicSelect} WHERE p.is_published AND p.slug = $2 LIMIT 1;`,
    [language, slug],
  )

  const row = result.rows[0]

  return row ? toPublicProject(row) : null
}
