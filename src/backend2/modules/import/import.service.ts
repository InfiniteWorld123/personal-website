import { BlogDraftSchema, publishBlockers as blogBlockers } from '../../contracts/blog.contract'
import { AvailabilitySchema, TypeInputSchema } from '../../contracts/booking.contract'
import {
  IMPORT_KIND_WORDS,
  type ImportPlan,
  type ImportPlanItem,
  type ImportStepResult,
} from '../../contracts/import.contract'
import { ProjectDraftSchema, publishBlockers as projectBlockers } from '../../contracts/project.contract'
import { ServiceDraftSchema, publishBlockers as serviceBlockers } from '../../contracts/service.contract'
import { withTransaction } from '../../db/client'
import { conflict, isApiError } from '../../http/error'
import { parseInput } from '../../http/validate'
import { requireMediaStore, type MediaStore } from '../../media/store'
import { createPost, savePost } from '../blog/post.service'
import { findProjectRef } from '../blog/post.repo'
import { findTagIdBySlug } from '../blog/tag.repo'
import { createTag } from '../blog/tag.service'
import {
  createType,
  enableBlockers,
  getAvailability,
  getSettings,
  putAvailability,
} from '../booking/booking.config.service'
import { createFolder } from '../media/folder.service'
import { deleteAsset, uploadAsset } from '../media/media.service'
import { publish as publishProject } from '../projects/project.publish'
import { createProject, saveDraft } from '../projects/project.service'
import { publishService } from '../services/service.publish'
import { createService, patchService } from '../services/service.service'
import {
  type AssetFor,
  availabilityOf,
  bookingTypeInput,
  postDraft,
  postImages,
  projectDraft,
  projectImages,
  serviceDraft,
} from './import.map'
import * as repo from './import.repo'
import { legacyImageSource, readLegacySnapshot } from './legacy.source'

/**
 * "Copy from the old site" (`docs/v2/public-cutover.md`).
 *
 * One plan, computed fresh every time from three things: what the old site
 * shows (`legacy.source.ts`, read-only), what V2 already holds, and the import
 * log. The dry run returns it; a run executes it **one small step per
 * request** — one image, or one record — so a Cloudflare Worker's per-request
 * limits are never in play, and a step that fails leaves everything before it
 * in place. The Dashboard repeats the step until nothing remains.
 *
 * Every record is created through its module's own service, so V2's
 * validation, addresses, translations and media references apply exactly as
 * if the owner had typed it in. A record and its log entry are written in one
 * transaction: either both exist or neither does, which is what makes a
 * second run create nothing twice.
 */

const FOLDER = 'Imported from old site'
const PLACEHOLDER = '00000000-0000-4000-8000-000000000000'

type Unit = {
  item: ImportPlanItem
  logKind: repo.LogKind
  logKey: string
  images: string[]
  /** Runs inside the step's transaction. Returns the V2 id. */
  create: (assetFor: AssetFor) => Promise<string>
}

const live = (blockers: string[]) => blockers.map((blocker) => `Before it can go live: ${blocker}`)

const fileName = (src: string) => src.split(/[?#]/)[0]!.split('/').filter(Boolean).pop() ?? src

const plan = async (input: { origin: string; measure: boolean }) => {
  const snapshot = await readLegacySnapshot()
  const log = await repo.readLog()
  const entry = (kind: repo.LogKind, key: string) => log.get(`${kind}:${key}`)

  const imageRows = [...log.values()].filter((row) => row.kind === 'image')
  const alive = await repo.existingAssets(
    imageRows.flatMap((row) => (row.outcome === 'created' && row.v2_id ? [row.v2_id] : [])),
  )
  const assets = new Map<string, string>()
  const failedImages = new Set<string>()

  for (const row of imageRows) {
    if (row.outcome === 'created' && row.v2_id && alive.has(row.v2_id)) assets.set(row.legacy_key, row.v2_id)
    if (row.outcome === 'failed') failedImages.add(row.legacy_key)
  }

  /** For the dry run: an image still to copy counts as copied, a failed one does not. */
  const preview: AssetFor = (src) => (failedImages.has(src) ? null : (assets.get(src) ?? PLACEHOLDER))

  const units: Unit[] = []
  const items: ImportPlanItem[] = []

  const add = async (unit: Omit<Unit, 'item'> & {
    item: Omit<ImportPlanItem, 'action' | 'reason' | 'images'>
    taken: () => Promise<boolean>
    takenReason: string
  }) => {
    const done = entry(unit.logKind, unit.logKey)
    const images = {
      total: unit.images.length,
      copied: unit.images.filter((src) => assets.has(src)).length,
      failed: unit.images.filter((src) => failedImages.has(src)).length,
    }
    let item: ImportPlanItem

    if (done?.outcome === 'created') {
      item = { ...unit.item, action: 'done', reason: 'Copied on an earlier run.', lands: null, needsYou: [], images }
    } else if (done) {
      item = {
        ...unit.item,
        action: 'failed',
        reason: `An earlier run could not copy it: ${done.note}`,
        lands: null,
        needsYou: ['Add it by hand in the Dashboard.'],
        images,
      }
    } else if (await unit.taken()) {
      item = { ...unit.item, action: 'skip', reason: unit.takenReason, lands: null, needsYou: [], images }
    } else {
      item = { ...unit.item, action: 'create', reason: null, images }
    }

    items.push(item)
    units.push({ ...unit, item })
  }

  /* services — from the public /services page */
  for (const service of snapshot.services) {
    const draft = serviceDraft(service)
    const blockers = serviceBlockers(draft)

    await add({
      logKind: 'service',
      logKey: service.slug,
      images: [],
      item: {
        kind: 'service',
        key: service.slug,
        label: service.texts.en.name,
        lands: blockers.length === 0 ? 'published' : 'draft',
        needsYou: live(blockers),
      },
      taken: () => repo.serviceSlugTaken(service.slug),
      takenReason: `V2 already has a service with the address “${service.slug}”. It is kept as it is.`,
      create: async () => {
        const created = await createService({ name: service.texts.en.name, language: 'en' })
        const valid = parseInput(ServiceDraftSchema, draft)
        const saved = await patchService({ serviceId: created.id, draftRevision: created.draftRevision, patch: valid })

        if (serviceBlockers(valid).length === 0) {
          await publishService({ serviceId: created.id, draftRevision: saved.draftRevision })
        }

        return created.id
      },
    })
  }

  /*
   * Projects — published ones, in the old site's order. One whose picture
   * could not be copied stays private: going live without it would change
   * what visitors see today.
   */
  for (const project of snapshot.projects) {
    const { draft, notes } = projectDraft(project, snapshot.headings, preview)
    const images = projectImages(project)
    const incomplete = images.some((src) => failedImages.has(src))
    const blockers = projectBlockers(draft)

    await add({
      logKind: 'project',
      logKey: project.id,
      images,
      item: {
        kind: 'project',
        key: project.slug,
        label: project.texts.en?.name || project.texts.de?.name || project.slug,
        lands: blockers.length === 0 && !incomplete ? 'published' : 'draft',
        needsYou: [
          ...notes,
          ...(incomplete ? ['It stays private until you add the missing picture and publish it.'] : []),
          ...live(blockers),
        ],
      },
      taken: () => repo.projectSlugTaken(project.slug),
      takenReason: `V2 already has a project with the address “${project.slug}”. It is kept as it is.`,
      create: async (assetFor) => {
        const valid = parseInput(ProjectDraftSchema, projectDraft(project, snapshot.headings, assetFor).draft)
        const created = await createProject({
          type: valid.type,
          workStatus: valid.workStatus,
          name: valid.texts.en.name || valid.texts.de.name,
        })
        const saved = await saveDraft({ projectId: created.id, draftRevision: created.draftRevision, draft: valid })
        const allImages = images.every((src) => assetFor(src) !== null)

        if (allImages && projectBlockers(valid).length === 0) {
          await publishProject({ projectId: created.id, draftRevision: saved.draftRevision })
        }

        return created.id
      },
    })
  }

  /* the article(s) — copied as private drafts */
  const tagsById = new Map(snapshot.tags.map((tag) => [tag.id, tag]))

  for (const post of snapshot.posts) {
    const tagNotes = post.tagIds.flatMap((id) => {
      const tag = tagsById.get(id)

      return tag && !(tag.names.de && tag.names.en && tag.names.ar)
        ? [`The tag “${tag.slug}” lacks a name in one language, so it is only added if V2 already has it.`]
        : []
    })
    const linked = post.projectId ? snapshot.projects.some((project) => project.id === post.projectId) : true
    const { draft, notes } = postDraft({ post, tagIds: [], projectId: null, assetFor: preview })
    const blockers = blogBlockers(draft)

    await add({
      logKind: 'post',
      logKey: post.id,
      images: postImages(post),
      item: {
        kind: 'post',
        key: post.slug,
        label: post.texts.en?.title || post.texts.de?.title || post.slug,
        lands: 'draft',
        needsYou: [
          'It stays private: docs/v2/blog.md recorded this article as test content. Publish it yourself if you want it live.',
          ...notes,
          ...tagNotes,
          ...(linked ? [] : ['Its linked project is not on the old site any more, so no project is linked.']),
          ...blockers.map((blocker) => `Before it can go live: ${blocker}`),
        ],
      },
      taken: () => repo.postSlugTaken(post.slug),
      takenReason: `V2 already has an article with the address “${post.slug}”. It is kept as it is.`,
      create: async (assetFor) => {
        const tagIds: string[] = []

        for (const id of post.tagIds) {
          const tag = tagsById.get(id)

          if (!tag) continue

          const existing = await findTagIdBySlug(tag.slug)

          if (existing) {
            tagIds.push(existing)
            continue
          }

          if (!(tag.names.de && tag.names.en && tag.names.ar)) continue

          try {
            tagIds.push(
              (await createTag({ slug: tag.slug, names: { de: tag.names.de, en: tag.names.en, ar: tag.names.ar } })).id,
            )
          } catch (error) {
            // A name another tag already uses: the article is copied without it.
            if (!isApiError(error)) throw error
          }
        }

        const projectEntry = post.projectId ? entry('project', post.projectId) : undefined
        const projectId =
          projectEntry?.outcome === 'created' && projectEntry.v2_id && (await findProjectRef(projectEntry.v2_id))
            ? projectEntry.v2_id
            : null
        const valid = parseInput(BlogDraftSchema, postDraft({ post, tagIds, projectId, assetFor }).draft)
        const title = valid.texts.en.title || valid.texts.de.title
        const created = await createPost({ title, language: 'en' })

        await savePost({ postId: created.id, draftRevision: created.draftRevision, patch: valid })

        return created.id
      },
    })
  }

  /* booking types and hours */
  const settings = await getSettings()

  for (const type of snapshot.bookingTypes) {
    const { input: mapped, notes } = bookingTypeInput(type, settings)
    const blockers = enableBlockers(mapped.texts, mapped.methods)

    await add({
      logKind: 'booking_type',
      logKey: type.id,
      images: [],
      item: {
        kind: 'booking_type',
        key: type.slug,
        label: mapped.texts.en.name || mapped.texts.de.name || type.slug,
        lands: blockers.length === 0 ? 'on' : 'off',
        needsYou: [...notes, ...blockers.map((blocker) => `Before visitors can book it: ${blocker}`)],
      },
      taken: () => repo.bookingTypeSlugTaken(type.slug),
      takenReason: `V2 already has a booking type with the address “${type.slug}”. It is kept as it is.`,
      create: async () =>
        (await createType(parseInput(TypeInputSchema, { ...mapped, enabled: blockers.length === 0 }))).id,
    })
  }

  if (snapshot.rules.length > 0 || snapshot.exceptions.length > 0) {
    const hours = availabilityOf(snapshot, new Set(snapshot.bookingTypes.map((type) => type.id)))

    await add({
      logKind: 'availability',
      logKey: 'hours',
      images: [],
      item: {
        kind: 'availability',
        key: 'hours',
        label: `Weekly hours (${hours.weekly.length} ranges) and ${hours.exceptions.length} upcoming day${hours.exceptions.length === 1 ? '' : 's'} with other hours`,
        lands: 'set',
        needsYou: hours.notes,
      },
      taken: async () => (await repo.weeklyHoursCount()) > 0,
      takenReason: 'You have already set weekly hours in V2. They are kept as they are.',
      create: async () => {
        const current = await getAvailability()
        const dates = new Set(current.exceptions.map((exception) => exception.date))

        await putAvailability(
          parseInput(AvailabilitySchema, {
            weekly: hours.weekly,
            exceptions: [...current.exceptions, ...hours.exceptions.filter((exception) => !dates.has(exception.date))],
          }),
        )

        return 'hours'
      },
    })
  }

  /* the summary */
  const pendingImages = new Set(
    units
      .filter((unit) => unit.item.action === 'create')
      .flatMap((unit) => unit.images.filter((src) => !assets.has(src) && !failedImages.has(src))),
  )
  const sizes = input.measure
    ? await Promise.all([...pendingImages].map((src) => legacyImageSource(input.origin).measure(src)))
    : []

  const count = (action: ImportPlanItem['action']) => items.filter((item) => item.action === action).length
  const hidden = snapshot.hidden
  const summary: ImportPlan = {
    items,
    counts: { create: count('create'), skip: count('skip'), done: count('done'), failed: count('failed') },
    images: {
      toCopy: pendingImages.size,
      bytes: sizes.reduce<number>((total, size) => total + (size ?? 0), 0),
      unknownSizes: input.measure ? sizes.filter((size) => size === null).length : pendingImages.size,
    },
    notes: [
      'Only what visitors can see on the old site is copied. Leads, clients, invoices, chats, bookings people made and accounts stay where they are.',
      'Nothing on the old site changes, and nothing already in V2 is changed or deleted.',
      'Services come from the /services page as visitors see it today, with the “from” price as a one-time price; all three are starred for the homepage.',
      'Each project gets the type Personal — the old site had none. Its Starting point, What I built, What the project shows and Features become its case study.',
      `Copied images go to the Media folder “${FOLDER}”.`,
      ...(hidden.projects > 0 ? [`${hidden.projects} unpublished project${hidden.projects === 1 ? ' is' : 's are'} not copied.`] : []),
      ...(hidden.posts > 0 ? [`${hidden.posts} unpublished article${hidden.posts === 1 ? ' is' : 's are'} not copied.`] : []),
      ...(hidden.bookingTypes > 0
        ? [`${hidden.bookingTypes} switched-off booking type${hidden.bookingTypes === 1 ? ' is' : 's are'} not copied.`]
        : []),
    ],
  }

  return { plan: summary, units, assets, failedImages, pendingImages }
}

/** The dry run. Reads only; writes nothing anywhere. */
export const planImport = async (origin: string): Promise<ImportPlan> =>
  (await plan({ origin, measure: true })).plan

/* ------------------------------------------------------------------ running */

class LostRace extends Error {}

/** Codes that mean "this item cannot be copied as it is", not "try again later". */
const PERMANENT = new Set(['VALIDATION_ERROR', 'BAD_REQUEST', 'CONFLICT', 'NAME_TAKEN'])
const FILE_PROBLEMS = new Set(['UNSUPPORTED_FILE_TYPE', 'FILE_TOO_LARGE', 'UPLOAD_FAILED', 'BAD_REQUEST'])

const importFolder = async (): Promise<string> => {
  const existing = await repo.rootFolderId(FOLDER)

  if (existing) return existing

  try {
    return (await createFolder({ name: FOLDER, parentId: null })).id
  } catch (error) {
    const again = await repo.rootFolderId(FOLDER)

    if (again) return again

    throw error
  }
}

const copyImage = async (input: { src: string; prefix: string; origin: string; store: MediaStore }) => {
  const name = fileName(input.src)
  const folderId = await importFolder()
  let assetId: string

  const fail = async (reason: string) => {
    await repo.forgetImage(input.src)
    await repo.record({ kind: 'image', key: input.src, outcome: 'failed', note: reason })

    return `Could not copy the image “${name}”: ${reason}`
  }

  let opened: Awaited<ReturnType<ReturnType<typeof legacyImageSource>['open']>>

  try {
    opened = await legacyImageSource(input.origin).open(input.src)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'the old site did not send it')
  }

  try {
    const { asset } = await uploadAsset({
      body: opened.body,
      declaredSize: opened.size,
      fileName: `${input.prefix}-${name}`,
      folderId,
      store: input.store,
    })

    assetId = asset.id
  } catch (error) {
    // The file itself is the problem — not a picture V2 takes, too large, cut
    // off. Anything else (storage or database unavailable) is worth a retry.
    if (isApiError(error) && FILE_PROBLEMS.has(error.code)) return fail(error.message)

    throw error
  }

  // An entry whose file the owner has since deleted from Media is replaced.
  await repo.forgetImage(input.src)

  if (!(await repo.record({ kind: 'image', key: input.src, outcome: 'created', v2Id: assetId }))) {
    // Another run copied it at the same moment; keep theirs, drop this one.
    await deleteAsset({ id: assetId, store: input.store }).catch(() => {})
  }

  return `Copied the image “${name}”`
}

/**
 * One step: the next image, or the next record. Returns what it did and how
 * many steps remain; the Dashboard calls again until none do.
 */
export const runImportStep = async (origin: string): Promise<ImportStepResult> => {
  const { units, assets, pendingImages } = await plan({ origin, measure: false })
  const todo = units.filter((unit) => unit.item.action === 'create')
  const remaining = pendingImages.size + todo.length
  const next = todo[0]

  if (!next) return { did: null, remaining: 0 }

  const src = next.images.find((image) => pendingImages.has(image))

  if (src) {
    const did = await copyImage({ src, prefix: next.item.key, origin, store: await requireMediaStore() })

    return { did, remaining: remaining - 1 }
  }

  const what = `${IMPORT_KIND_WORDS[next.item.kind].toLowerCase()} “${next.item.label}”`

  try {
    await withTransaction(async () => {
      const v2Id = await next.create((image) => assets.get(image) ?? null)

      if (!(await repo.record({ kind: next.logKind, key: next.logKey, outcome: 'created', v2Id }))) {
        throw new LostRace()
      }
    })
  } catch (error) {
    if (error instanceof LostRace) {
      throw conflict('Another copy is running at the same time. Wait a moment and reload.')
    }

    if (!isApiError(error) || !PERMANENT.has(error.code)) throw error

    await repo.record({ kind: next.logKind, key: next.logKey, outcome: 'failed', note: error.message })

    return { did: `Could not copy the ${what}: ${error.message}`, remaining: remaining - 1 }
  }

  return { did: `Copied the ${what}`, remaining: remaining - 1 }
}
