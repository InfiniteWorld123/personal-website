import * as v from 'valibot'

/**
 * "Copy from the old site" — the shapes the Dashboard and the server share.
 *
 * A one-time, owner-triggered copy of the legacy website's public content into
 * V2 (owner decision, 24 Sep 2026; `docs/v2/public-cutover.md`). Pure, like
 * every contract: the settings screen imports it.
 */

export const IMPORT_KINDS = ['service', 'project', 'post', 'booking_type', 'availability'] as const
export type ImportKind = (typeof IMPORT_KINDS)[number]

/**
 * What would happen to one legacy thing.
 *
 * - `create` — it will be copied on the next run;
 * - `skip`   — it will not, and `reason` says why (usually: V2 already has
 *              something at that web address, which is never overwritten);
 * - `done`   — an earlier run already copied it;
 * - `failed` — an earlier run could not copy it; `reason` says why.
 */
export type ImportAction = 'create' | 'skip' | 'done' | 'failed'

export type ImportPlanItem = {
  kind: ImportKind
  /** The legacy identity: a slug, or a fixed word for the booking hours. */
  key: string
  /** What the owner recognises it by, in English where there is English. */
  label: string
  action: ImportAction
  reason: string | null
  /**
   * Where it lands in V2: `published`/`draft` for content, `on`/`off` for a
   * booking type, `set` for the booking hours. Null when nothing is created.
   */
  lands: 'published' | 'draft' | 'on' | 'off' | 'set' | null
  /** What the owner has to finish by hand afterwards. Plain sentences. */
  needsYou: string[]
  images: { total: number; copied: number; failed: number }
}

export type ImportPlan = {
  items: ImportPlanItem[]
  counts: { create: number; skip: number; done: number; failed: number }
  /** Files still to copy, and their size where the old site told us. */
  images: { toCopy: number; bytes: number; unknownSizes: number }
  /** General sentences that apply to the whole copy. */
  notes: string[]
}

/** One step of the copy. The Dashboard repeats it until `remaining` is 0. */
export type ImportStepResult = {
  did: string | null
  remaining: number
}

export const ImportConfirmSchema = v.object({
  confirm: v.literal(true, 'Confirm the copy first'),
})

export const IMPORT_KIND_WORDS: Record<ImportKind, string> = {
  service: 'Service',
  project: 'Project',
  post: 'Article',
  booking_type: 'Booking type',
  availability: 'Booking hours',
}
