import { getDb } from '../../db/client'
import type {
  ImageRole,
  Language,
  LinkKind,
  ProjectDraftInput,
  ProjectListQuery,
  ProjectType,
  WorkStatus,
} from '../../contracts/project.contract'
import { LANGUAGES } from '../../contracts/project.contract'
import { collectMediaIds } from '../../contracts/rich-text.contract'
import type { RichTextDoc } from '../../contracts/rich-text.contract'

/**
 * Every statement Projects runs. No business rule lives here and no HTTP
 * concept reaches it — the service decides what should happen, this decides
 * how it is written down.
 *
 * The shape is the one `0001_projects.sql` installed, with the one change
 * `0004_projects_media.sql` made: `v2_project_images.asset_id` points at the
 * shared Media vault rather than at the superseded project-scoped table.
 */

export type ProjectRow = {
  id: string
  position: number
  lifecycle: 'active' | 'archived'
  draft_version_id: string | null
  published_version_id: string | null
  first_published_at: Date | null
  published_at: Date | null
  archived_at: Date | null
  draft_revision: number
  published_draft_revision: number | null
  created_at: Date
  updated_at: Date
}

export type VersionRow = {
  id: string
  project_id: string
  kind: 'draft' | 'published'
  slug: string
  type: ProjectType
  work_status: WorkStatus
  client_name: string | null
  show_client_name: boolean
}

/** A version's whole body, assembled from its four child tables. */
export type VersionContent = {
  texts: Record<Language, { name: string; categoryLabel: string; summary: string; caseStudy: RichTextDoc | null }>
  cover: StoredImage | null
  gallery: StoredImage[]
  inline: string[]
  links: Array<{ kind: LinkKind; url: string; isPublic: boolean; labels: Record<Language, string> }>
  tech: string[]
}

export type StoredImage = {
  assetId: string
  alt: Record<Language, string>
  width: number | null
  height: number | null
  byteSize: number
}

const emptyLanguageRecord = (): Record<Language, string> => ({ de: '', en: '', ar: '' })

/* --------------------------------------------------------------- one project */

export const findProject = async (id: string): Promise<ProjectRow | null> => {
  const { rows } = await getDb().query<ProjectRow>('SELECT * FROM v2_projects WHERE id = $1', [id])

  return rows[0] ?? null
}

/**
 * The same row, locked until the transaction ends.
 *
 * Publishing reads the draft, validates it and then writes a new published
 * version. Without the lock two overlapping publishes both pass validation and
 * both insert, and the unique index on `(project_id, kind)` decides the winner
 * at COMMIT — after the losing one has already deleted the previous published
 * version. `booking.service.ts` in the legacy backend takes the same lock for
 * the same reason.
 */
export const lockProject = async (id: string): Promise<ProjectRow | null> => {
  const { rows } = await getDb().query<ProjectRow>(
    'SELECT * FROM v2_projects WHERE id = $1 FOR UPDATE',
    [id],
  )

  return rows[0] ?? null
}

export const findVersion = async (id: string): Promise<VersionRow | null> => {
  const { rows } = await getDb().query<VersionRow>(
    'SELECT * FROM v2_project_versions WHERE id = $1',
    [id],
  )

  return rows[0] ?? null
}

/* ------------------------------------------------------------------ creation */

/**
 * A project and its draft, in one transaction.
 *
 * The two tables point at each other, which is why both keys were created
 * deferrable: the project row is written before the version it will name, and
 * the pair is checked once at COMMIT.
 */
export const insertProject = async (input: {
  type: ProjectType
  workStatus: WorkStatus
  name: string
  slug: string
}): Promise<{ projectId: string; versionId: string }> => {
  const db = getDb()

  await db.query('SET CONSTRAINTS ALL DEFERRED')

  const { rows: positioned } = await db.query<{ next: number }>(
    'SELECT COALESCE(MAX(position), 0) + 1 AS next FROM v2_projects',
  )
  const position = positioned[0]?.next ?? 1

  const { rows: created } = await db.query<{ id: string }>(
    'INSERT INTO v2_projects (position) VALUES ($1) RETURNING id',
    [position],
  )
  const projectId = created[0]!.id

  const { rows: version } = await db.query<{ id: string }>(
    `INSERT INTO v2_project_versions (project_id, kind, slug, type, work_status)
       VALUES ($1, 'draft', $2, $3, $4) RETURNING id`,
    [projectId, input.slug, input.type, input.workStatus],
  )
  const versionId = version[0]!.id

  // Three rows always, so the editor never meets a missing language.
  for (const language of LANGUAGES) {
    await db.query(
      'INSERT INTO v2_project_texts (version_id, language, name) VALUES ($1, $2, $3)',
      [versionId, language, input.name],
    )
  }

  await db.query('UPDATE v2_projects SET draft_version_id = $1 WHERE id = $2', [
    versionId,
    projectId,
  ])

  return { projectId, versionId }
}

/* -------------------------------------------------------------- reading one */

export const loadVersionContent = async (versionId: string): Promise<VersionContent> => {
  const db = getDb()

  const [texts, images, links, tech] = await Promise.all([
    db.query<{
      language: Language
      name: string
      category_label: string
      summary: string
      case_study: RichTextDoc | null
    }>(
      `SELECT language, name, category_label, summary, case_study
         FROM v2_project_texts WHERE version_id = $1`,
      [versionId],
    ),
    /*
     * Alt text is aggregated in SQL rather than fetched per image: a gallery
     * of twelve would otherwise be thirteen round trips, and the editor loads
     * this on every keystroke-free save.
     */
    db.query<{
      asset_id: string
      role: ImageRole
      position: number
      width: number | null
      height: number | null
      byte_size: string | number
      alt: Record<string, string> | null
    }>(
      `SELECT i.asset_id, i.role, i.position, a.width, a.height, a.byte_size,
              COALESCE(
                jsonb_object_agg(t.language, t.alt) FILTER (WHERE t.language IS NOT NULL),
                '{}'::jsonb
              ) AS alt
         FROM v2_project_images i
         JOIN v2_media_assets a ON a.id = i.asset_id
         LEFT JOIN v2_project_image_texts t ON t.project_image_id = i.id
        WHERE i.version_id = $1
        GROUP BY i.id, i.asset_id, i.role, i.position, a.width, a.height, a.byte_size
        ORDER BY i.position, i.asset_id`,
      [versionId],
    ),
    db.query<{
      kind: LinkKind
      url: string
      is_public: boolean
      position: number
      labels: Record<string, string> | null
    }>(
      `SELECT l.kind, l.url, l.is_public, l.position,
              COALESCE(
                jsonb_object_agg(t.language, t.label) FILTER (WHERE t.language IS NOT NULL),
                '{}'::jsonb
              ) AS labels
         FROM v2_project_links l
         LEFT JOIN v2_project_link_texts t ON t.project_link_id = l.id
        WHERE l.version_id = $1
        GROUP BY l.id, l.kind, l.url, l.is_public, l.position
        ORDER BY l.position, l.kind`,
      [versionId],
    ),
    db.query<{ name: string }>(
      'SELECT name FROM v2_project_tech WHERE version_id = $1 ORDER BY position, name',
      [versionId],
    ),
  ])

  const content: VersionContent = {
    texts: {
      de: { name: '', categoryLabel: '', summary: '', caseStudy: null },
      en: { name: '', categoryLabel: '', summary: '', caseStudy: null },
      ar: { name: '', categoryLabel: '', summary: '', caseStudy: null },
    },
    cover: null,
    gallery: [],
    inline: [],
    links: [],
    tech: tech.rows.map((row) => row.name),
  }

  for (const row of texts.rows) {
    content.texts[row.language] = {
      name: row.name,
      categoryLabel: row.category_label,
      summary: row.summary,
      caseStudy: row.case_study,
    }
  }

  for (const row of images.rows) {
    const image: StoredImage = {
      assetId: row.asset_id,
      alt: { ...emptyLanguageRecord(), ...(row.alt ?? {}) },
      width: row.width,
      height: row.height,
      byteSize: Number(row.byte_size),
    }

    if (row.role === 'cover') content.cover = image
    else if (row.role === 'gallery') content.gallery.push(image)
    else content.inline.push(row.asset_id)
  }

  for (const row of links.rows) {
    content.links.push({
      kind: row.kind,
      url: row.url,
      isPublic: row.is_public,
      labels: { ...emptyLanguageRecord(), ...(row.labels ?? {}) },
    })
  }

  return content
}

/* -------------------------------------------------------------- writing one */

export const updateVersionFacts = async (
  versionId: string,
  draft: ProjectDraftInput,
): Promise<void> => {
  await getDb().query(
    `UPDATE v2_project_versions
        SET slug = $2, type = $3, work_status = $4, client_name = $5, show_client_name = $6
      WHERE id = $1`,
    [
      versionId,
      draft.slug,
      draft.type,
      draft.workStatus,
      draft.clientName,
      draft.showClientName,
    ],
  )
}

/**
 * The version's whole body, replaced.
 *
 * Delete-then-insert rather than a diff: there is exactly one editor, the row
 * counts are tiny, and a full replace is the only version of this that cannot
 * leave a stale child behind. The published version is not touched — that is
 * the owner's rule expressed as code.
 */
export const replaceVersionContent = async (
  versionId: string,
  draft: ProjectDraftInput,
): Promise<void> => {
  const db = getDb()

  await db.query('DELETE FROM v2_project_images WHERE version_id = $1', [versionId])
  await db.query('DELETE FROM v2_project_links WHERE version_id = $1', [versionId])
  await db.query('DELETE FROM v2_project_tech WHERE version_id = $1', [versionId])

  for (const language of LANGUAGES) {
    const text = draft.texts[language]

    await db.query(
      `INSERT INTO v2_project_texts (version_id, language, name, category_label, summary, case_study)
            VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (version_id, language) DO UPDATE
            SET name = EXCLUDED.name,
                category_label = EXCLUDED.category_label,
                summary = EXCLUDED.summary,
                case_study = EXCLUDED.case_study`,
      [
        versionId,
        language,
        text.name,
        text.categoryLabel,
        text.summary,
        text.caseStudy === null ? null : JSON.stringify(text.caseStudy),
      ],
    )
  }

  if (draft.cover) await insertImage(versionId, draft.cover, 'cover', 0)

  for (const [index, image] of draft.gallery.entries()) {
    await insertImage(versionId, image, 'gallery', index)
  }

  /*
   * The inline rows are derived, never sent: recomputed from the case-study
   * documents on every save so the set of files a version references is
   * always exactly the set it uses (`projects-backend.md` §7.5 step 5). That
   * is what lets `replaceReferences` state the complete set afterwards, and
   * what stops a file staying undeletable because a paragraph was deleted.
   *
   * A file used both as the cover and inside the story is one row per role —
   * the unique key is `(version_id, asset_id, role)` — but the set below is
   * deduplicated across languages, because the German and the Arabic story
   * pointing at one photograph is still one use.
   */
  const inlineIds = new Set<string>()

  for (const language of LANGUAGES) {
    for (const id of collectMediaIds(draft.texts[language].caseStudy)) inlineIds.add(id)
  }

  for (const [index, assetId] of [...inlineIds].entries()) {
    await db.query(
      `INSERT INTO v2_project_images (version_id, asset_id, role, position)
            VALUES ($1, $2, 'inline', $3)
       ON CONFLICT (version_id, asset_id, role) DO NOTHING`,
      [versionId, assetId, index],
    )
  }

  for (const [index, link] of draft.links.entries()) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO v2_project_links (version_id, kind, url, is_public, position)
            VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [versionId, link.kind, link.url, link.isPublic, index],
    )

    for (const language of LANGUAGES) {
      await db.query(
        'INSERT INTO v2_project_link_texts (project_link_id, language, label) VALUES ($1, $2, $3)',
        [rows[0]!.id, language, link.labels[language]],
      )
    }
  }

  for (const [index, name] of draft.tech.entries()) {
    await db.query(
      `INSERT INTO v2_project_tech (version_id, name, position) VALUES ($1, $2, $3)
       ON CONFLICT (version_id, name) DO NOTHING`,
      [versionId, name, index],
    )
  }
}

const insertImage = async (
  versionId: string,
  image: { mediaId: string; alt: Record<Language, string> },
  role: ImageRole,
  position: number,
): Promise<void> => {
  const db = getDb()

  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO v2_project_images (version_id, asset_id, role, position)
          VALUES ($1, $2, $3, $4) RETURNING id`,
    [versionId, image.mediaId, role, position],
  )

  for (const language of LANGUAGES) {
    await db.query(
      'INSERT INTO v2_project_image_texts (project_image_id, language, alt) VALUES ($1, $2, $3)',
      [rows[0]!.id, language, image.alt[language]],
    )
  }
}

export const bumpRevision = async (projectId: string): Promise<number> => {
  const { rows } = await getDb().query<{ draft_revision: number }>(
    `UPDATE v2_projects
        SET draft_revision = draft_revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING draft_revision`,
    [projectId],
  )

  return rows[0]!.draft_revision
}

/** Which library files exist. Checked before a draft names one. */
export const findKnownAssets = async (ids: string[]): Promise<Set<string>> => {
  if (ids.length === 0) return new Set()

  const { rows } = await getDb().query<{ id: string }>(
    'SELECT id FROM v2_media_assets WHERE id = ANY($1::uuid[])',
    [ids],
  )

  return new Set(rows.map((row) => row.id))
}

/* ------------------------------------------------------------------ publish */

/**
 * The draft, copied into a new published version.
 *
 * A deep copy rather than a pointer swap, because D8 says the published
 * version is frozen: whatever the draft does afterwards, the rows a visitor
 * reads keep saying what they said when the owner pressed Publish.
 */
export const copyDraftToPublished = async (input: {
  projectId: string
  draftVersionId: string
}): Promise<string> => {
  const db = getDb()

  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO v2_project_versions
            (project_id, kind, slug, type, work_status, client_name, show_client_name)
     SELECT project_id, 'published', slug, type, work_status, client_name, show_client_name
       FROM v2_project_versions WHERE id = $1
     RETURNING id`,
    [input.draftVersionId],
  )
  const publishedId = rows[0]!.id

  await db.query(
    `INSERT INTO v2_project_texts (version_id, language, name, category_label, summary, case_study)
     SELECT $2, language, name, category_label, summary, case_study
       FROM v2_project_texts WHERE version_id = $1`,
    [input.draftVersionId, publishedId],
  )

  // The alt text travels with the image row, so both are copied in one
  // statement chain that keeps them paired.
  await db.query(
    `WITH copied AS (
       INSERT INTO v2_project_images (version_id, asset_id, role, position)
       SELECT $2, asset_id, role, position FROM v2_project_images WHERE version_id = $1
       RETURNING id, asset_id, role
     )
     INSERT INTO v2_project_image_texts (project_image_id, language, alt)
     SELECT copied.id, t.language, t.alt
       FROM copied
       JOIN v2_project_images source
         ON source.version_id = $1
        AND source.asset_id = copied.asset_id
        AND source.role = copied.role
       JOIN v2_project_image_texts t ON t.project_image_id = source.id`,
    [input.draftVersionId, publishedId],
  )

  await db.query(
    `WITH copied AS (
       INSERT INTO v2_project_links (version_id, kind, url, is_public, position)
       SELECT $2, kind, url, is_public, position FROM v2_project_links WHERE version_id = $1
       RETURNING id, position
     )
     INSERT INTO v2_project_link_texts (project_link_id, language, label)
     SELECT copied.id, t.language, t.label
       FROM copied
       JOIN v2_project_links source ON source.version_id = $1 AND source.position = copied.position
       JOIN v2_project_link_texts t ON t.project_link_id = source.id`,
    [input.draftVersionId, publishedId],
  )

  await db.query(
    `INSERT INTO v2_project_tech (version_id, name, position)
     SELECT $2, name, position FROM v2_project_tech WHERE version_id = $1`,
    [input.draftVersionId, publishedId],
  )

  return publishedId
}

/** Replaces the draft with a copy of the live version (`discard-pending`). */
export const copyPublishedToDraft = async (input: {
  publishedVersionId: string
  draftVersionId: string
}): Promise<void> => {
  const db = getDb()

  await db.query('DELETE FROM v2_project_images WHERE version_id = $1', [input.draftVersionId])
  await db.query('DELETE FROM v2_project_links WHERE version_id = $1', [input.draftVersionId])
  await db.query('DELETE FROM v2_project_tech WHERE version_id = $1', [input.draftVersionId])
  await db.query('DELETE FROM v2_project_texts WHERE version_id = $1', [input.draftVersionId])

  await db.query(
    `UPDATE v2_project_versions AS draft
        SET slug = live.slug, type = live.type, work_status = live.work_status,
            client_name = live.client_name, show_client_name = live.show_client_name
       FROM v2_project_versions AS live
      WHERE draft.id = $2 AND live.id = $1`,
    [input.publishedVersionId, input.draftVersionId],
  )

  await db.query(
    `INSERT INTO v2_project_texts (version_id, language, name, category_label, summary, case_study)
     SELECT $2, language, name, category_label, summary, case_study
       FROM v2_project_texts WHERE version_id = $1`,
    [input.publishedVersionId, input.draftVersionId],
  )

  await db.query(
    `WITH copied AS (
       INSERT INTO v2_project_images (version_id, asset_id, role, position)
       SELECT $2, asset_id, role, position FROM v2_project_images WHERE version_id = $1
       RETURNING id, asset_id, role
     )
     INSERT INTO v2_project_image_texts (project_image_id, language, alt)
     SELECT copied.id, t.language, t.alt
       FROM copied
       JOIN v2_project_images source
         ON source.version_id = $1
        AND source.asset_id = copied.asset_id
        AND source.role = copied.role
       JOIN v2_project_image_texts t ON t.project_image_id = source.id`,
    [input.publishedVersionId, input.draftVersionId],
  )

  await db.query(
    `WITH copied AS (
       INSERT INTO v2_project_links (version_id, kind, url, is_public, position)
       SELECT $2, kind, url, is_public, position FROM v2_project_links WHERE version_id = $1
       RETURNING id, position
     )
     INSERT INTO v2_project_link_texts (project_link_id, language, label)
     SELECT copied.id, t.language, t.label
       FROM copied
       JOIN v2_project_links source ON source.version_id = $1 AND source.position = copied.position
       JOIN v2_project_link_texts t ON t.project_link_id = source.id`,
    [input.publishedVersionId, input.draftVersionId],
  )

  await db.query(
    `INSERT INTO v2_project_tech (version_id, name, position)
     SELECT $2, name, position FROM v2_project_tech WHERE version_id = $1`,
    [input.publishedVersionId, input.draftVersionId],
  )
}

export const deleteVersion = async (versionId: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_project_versions WHERE id = $1', [versionId])
}

export const setPublished = async (input: {
  projectId: string
  publishedVersionId: string | null
  draftRevision?: number
  firstPublish?: boolean
}): Promise<void> => {
  await getDb().query(
    `UPDATE v2_projects
        SET published_version_id = $2,
            published_draft_revision = $3,
            published_at = CASE WHEN $2::uuid IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END,
            first_published_at = CASE
              WHEN $4::boolean THEN CURRENT_TIMESTAMP ELSE first_published_at END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [
      input.projectId,
      input.publishedVersionId,
      input.draftRevision ?? null,
      input.firstPublish ?? false,
    ],
  )
}

export const setLifecycle = async (input: {
  projectId: string
  lifecycle: 'active' | 'archived'
}): Promise<void> => {
  await getDb().query(
    `UPDATE v2_projects
        SET lifecycle = $2,
            archived_at = CASE WHEN $2 = 'archived' THEN CURRENT_TIMESTAMP ELSE NULL END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [input.projectId, input.lifecycle],
  )
}

export const deleteProject = async (projectId: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_projects WHERE id = $1', [projectId])
}

/* --------------------------------------------------------------------- slugs */

/** Who owns this public address, if anyone. */
export const findSlugOwner = async (slug: string): Promise<string | null> => {
  const { rows } = await getDb().query<{ project_id: string }>(
    'SELECT project_id FROM v2_project_slugs WHERE slug = $1',
    [slug],
  )

  return rows[0]?.project_id ?? null
}

/**
 * The slug this project is published under now; every earlier one is kept
 * with `is_current = false` so old links keep resolving (D6).
 */
export const claimSlug = async (input: { projectId: string; slug: string }): Promise<void> => {
  const db = getDb()

  await db.query(
    'UPDATE v2_project_slugs SET is_current = false WHERE project_id = $1 AND slug <> $2',
    [input.projectId, input.slug],
  )

  await db.query(
    `INSERT INTO v2_project_slugs (slug, project_id, is_current) VALUES ($1, $2, true)
     ON CONFLICT (slug) DO UPDATE SET is_current = true`,
    [input.slug, input.projectId],
  )
}

/** Unpublishing keeps the history but retires the current one. */
export const retireSlugs = async (projectId: string): Promise<void> => {
  await getDb().query('UPDATE v2_project_slugs SET is_current = false WHERE project_id = $1', [
    projectId,
  ])
}

/* ------------------------------------------------------------------- listing */

export type ListRow = ProjectRow & {
  slug: string
  type: ProjectType
  work_status: WorkStatus
  published_slug: string | null
  image_count: number
  cover_asset_id: string | null
}

/**
 * The Dashboard list.
 *
 * Filters and search change which rows are returned and never touch
 * `position`: the manual order is global, and narrowing a search must not
 * renumber the projects the owner cannot currently see.
 */
export const listProjects = async (
  query: ProjectListQuery,
): Promise<{ rows: ListRow[]; total: number }> => {
  const conditions: string[] = []
  const values: unknown[] = []
  const bind = (value: unknown): string => `$${values.push(value)}`

  // `all` means every project the owner has not archived; archived is a
  // deliberate destination, never a default.
  if (query.state === 'all') conditions.push(`p.lifecycle = 'active'`)
  else if (query.state === 'archived') conditions.push(`p.lifecycle = 'archived'`)
  else {
    conditions.push(`p.lifecycle = 'active'`)

    if (query.state === 'draft') {
      conditions.push('p.published_version_id IS NULL AND p.first_published_at IS NULL')
    } else if (query.state === 'unpublished') {
      conditions.push('p.published_version_id IS NULL AND p.first_published_at IS NOT NULL')
    } else if (query.state === 'published') {
      conditions.push(
        'p.published_version_id IS NOT NULL AND p.draft_revision IS NOT DISTINCT FROM p.published_draft_revision',
      )
    } else if (query.state === 'pending' || query.state === 'published_with_pending_changes') {
      conditions.push(
        'p.published_version_id IS NOT NULL AND p.draft_revision IS DISTINCT FROM p.published_draft_revision',
      )
    }
  }

  if (query.type !== 'all') conditions.push(`d.type = ${bind(query.type)}`)
  if (query.workStatus !== 'all') conditions.push(`d.work_status = ${bind(query.workStatus)}`)

  if (query.search !== '') {
    /*
     * Across the slug and every language's name, not only the one the row is
     * displayed in: the owner searching for an Arabic name should find the
     * project whose list row happens to be showing English.
     */
    const term = bind(`%${query.search.toLowerCase()}%`)

    conditions.push(`(
      LOWER(d.slug) LIKE ${term}
      OR EXISTS (
        SELECT 1 FROM v2_project_texts t
         WHERE t.version_id = d.id AND (LOWER(t.name) LIKE ${term} OR LOWER(t.summary) LIKE ${term})
      )
    )`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const from = `
    FROM v2_projects p
    JOIN v2_project_versions d ON d.id = p.draft_version_id
    ${where}
  `

  const { rows: counted } = await getDb().query<{ total: string }>(
    `SELECT count(*)::text AS total ${from}`,
    values,
  )
  const total = Number(counted[0]?.total ?? 0)

  const limit = bind(query.pageSize)
  const offset = bind((query.page - 1) * query.pageSize)

  const { rows } = await getDb().query<ListRow>(
    `SELECT p.*, d.slug, d.type, d.work_status,
            (SELECT s.slug FROM v2_project_slugs s
              WHERE s.project_id = p.id AND s.is_current LIMIT 1) AS published_slug,
            (SELECT count(*)::int FROM v2_project_images i
              WHERE i.version_id = d.id AND i.role <> 'inline') AS image_count,
            (SELECT i.asset_id FROM v2_project_images i
              WHERE i.version_id = d.id AND i.role = 'cover' LIMIT 1) AS cover_asset_id
     ${from}
     ORDER BY p.position
     LIMIT ${limit} OFFSET ${offset}`,
    values,
  )

  return { rows, total }
}

/** The names shown in the list, for the whole page in one query. */
export const loadListTexts = async (
  versionIds: string[],
): Promise<Map<string, Record<Language, { name: string; summary: string }>>> => {
  const result = new Map<string, Record<Language, { name: string; summary: string }>>()

  if (versionIds.length === 0) return result

  const { rows } = await getDb().query<{
    version_id: string
    language: Language
    name: string
    summary: string
  }>(
    `SELECT version_id, language, name, summary FROM v2_project_texts
      WHERE version_id = ANY($1::uuid[])`,
    [versionIds],
  )

  for (const row of rows) {
    const entry =
      result.get(row.version_id) ??
      ({ de: { name: '', summary: '' }, en: { name: '', summary: '' }, ar: { name: '', summary: '' } } as Record<
        Language,
        { name: string; summary: string }
      >)

    entry[row.language] = { name: row.name, summary: row.summary }
    result.set(row.version_id, entry)
  }

  return result
}

/* -------------------------------------------------------------------- public */

/**
 * One batch of published projects, in the owner's manual order.
 *
 * `LIMIT`/`OFFSET` against an indexed `position` rather than a full read the
 * caller slices: `/work` asks for six at a time and must never be able to ask
 * for everything.
 */
export const listPublished = async (input: {
  offset: number
  limit: number
}): Promise<{ rows: Array<VersionRow & { published_at: Date | null }>; total: number }> => {
  const db = getDb()

  const { rows: counted } = await db.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM v2_projects
      WHERE lifecycle = 'active' AND published_version_id IS NOT NULL`,
  )

  const { rows } = await db.query<VersionRow & { published_at: Date | null }>(
    `SELECT pv.*, p.published_at
       FROM v2_projects p
       JOIN v2_project_versions pv ON pv.id = p.published_version_id
      WHERE p.lifecycle = 'active' AND p.published_version_id IS NOT NULL
      ORDER BY p.position
      LIMIT $1 OFFSET $2`,
    [input.limit, input.offset],
  )

  return { rows, total: Number(counted[0]?.total ?? 0) }
}

/**
 * One published project by any slug it has ever used.
 *
 * The join runs through `v2_project_slugs`, so a retired address still finds
 * the project — and the caller answers with the canonical one rather than a
 * redirect (D12). An unpublished or archived project matches nothing here,
 * which is the same answer as a slug that never existed.
 */
export const findPublishedBySlug = async (
  slug: string,
): Promise<(VersionRow & { published_at: Date | null; canonical_slug: string }) | null> => {
  const { rows } = await getDb().query<
    VersionRow & { published_at: Date | null; canonical_slug: string }
  >(
    `SELECT pv.*, p.published_at,
            (SELECT c.slug FROM v2_project_slugs c
              WHERE c.project_id = p.id AND c.is_current LIMIT 1) AS canonical_slug
       FROM v2_project_slugs s
       JOIN v2_projects p ON p.id = s.project_id
       JOIN v2_project_versions pv ON pv.id = p.published_version_id
      WHERE s.slug = $1 AND p.lifecycle = 'active' AND p.published_version_id IS NOT NULL`,
    [slug],
  )

  return rows[0] ?? null
}

/** Dimensions for the images a public response is about to describe. */
export const loadAssetSizes = async (
  ids: string[],
): Promise<Map<string, { width: number | null; height: number | null }>> => {
  const sizes = new Map<string, { width: number | null; height: number | null }>()

  if (ids.length === 0) return sizes

  const { rows } = await getDb().query<{ id: string; width: number | null; height: number | null }>(
    'SELECT id, width, height FROM v2_media_assets WHERE id = ANY($1::uuid[])',
    [ids],
  )

  for (const row of rows) sizes.set(row.id, { width: row.width, height: row.height })

  return sizes
}
