import * as v from 'valibot'

/**
 * Niches: the kind of business a Client or Lead is in — a salon, plumbers,
 * roofers. One owner-managed list, shared by Clients and Leads, so a niche
 * means the same thing on both sides.
 *
 * Added by the owner on 23 Sep 2026 (`docs/v2/clients.md`). The owner creates,
 * renames and hides niches. A niche in use is never deleted, so an old file
 * never loses what it said; hiding only takes it out of new choices.
 */

export const NICHE_LIMITS = { name: 60, search: 60 } as const

/** A reference list, paged like every other one, with room for a real list. */
export const NICHE_PAGE_SIZE = { min: 1, default: 50, max: 100 } as const

const Name = v.pipe(
  v.string('Enter a name for the niche'),
  v.trim(),
  v.nonEmpty('Enter a name for the niche'),
  v.maxLength(NICHE_LIMITS.name, `Keep it under ${NICHE_LIMITS.name} characters`),
)

export const CreateNicheSchema = v.object({ name: Name })

export const NichePatchSchema = v.object({
  name: v.optional(Name),
  hidden: v.optional(v.boolean()),
})

export type NichePatch = v.InferOutput<typeof NichePatchSchema>

const IntFromQuery = (fallback: number, min: number, max: number) =>
  v.pipe(
    v.optional(v.union([v.string(), v.number()]), fallback),
    v.transform((value) => (typeof value === 'number' ? value : Number(value.trim()))),
    v.number('That is not a number'),
    v.integer('That is not a whole number'),
    v.minValue(min, 'That is below the smallest allowed value'),
    v.maxValue(max, 'That is above the largest allowed value'),
  )

export const NicheListQuerySchema = v.object({
  page: IntFromQuery(1, 1, 100_000),
  pageSize: IntFromQuery(NICHE_PAGE_SIZE.default, NICHE_PAGE_SIZE.min, NICHE_PAGE_SIZE.max),
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(NICHE_LIMITS.search)), ''),
  /** The picker asks without hidden niches; the manager asks with them. */
  hidden: v.optional(v.picklist(['include', 'exclude'] as const), 'include'),
})

export type NicheListQuery = v.InferOutput<typeof NicheListQuerySchema>

export type OwnerNiche = {
  id: string
  name: string
  hidden: boolean
  /** How many Clients (in or out of Trash) carry it. */
  clientCount: number
  /** How many Leads (in or out of Trash) carry it. */
  leadCount: number
  createdAt: string
}
