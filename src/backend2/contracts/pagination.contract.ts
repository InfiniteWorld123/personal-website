import * as v from 'valibot'

/**
 * Bounded pagination, shared by the server and the Dashboard.
 *
 * `AGENTS.md`: "Every independently browsable V2 list needs bounded
 * server-side pagination and a matching frontend control, even when the
 * collection is currently small." The ceiling lives here so a caller cannot
 * ask for the whole vault by sending `pageSize=100000`.
 */

export const PAGE_SIZE = {
  min: 1,
  default: 24,
  max: 100,
} as const

/** A query string arrives as text; a missing page is page 1. */
const CountFromQuery = (fallback: number, max: number) =>
  v.pipe(
    v.optional(v.union([v.string(), v.number()]), fallback),
    v.transform((value) => (typeof value === 'number' ? value : Number(value.trim()))),
    v.number('That is not a number'),
    v.integer('That is not a whole number'),
    v.minValue(1, 'That is below the smallest allowed value'),
    v.maxValue(max, 'That is above the largest allowed value'),
  )

export const PageQuerySchema = v.object({
  page: CountFromQuery(1, 100_000),
  pageSize: CountFromQuery(PAGE_SIZE.default, PAGE_SIZE.max),
})

export type PageQuery = v.InferOutput<typeof PageQuerySchema>

export type Page<T> = {
  items: T[]
  page: number
  pageSize: number
  /** The whole count, so the UI can offer a last page rather than only "next". */
  total: number
  pageCount: number
  hasMore: boolean
}

/** Builds the envelope from a counted query, so every list reports it the same way. */
export const toPage = <T>(input: {
  items: T[]
  page: number
  pageSize: number
  total: number
}): Page<T> => {
  const pageCount = Math.max(1, Math.ceil(input.total / input.pageSize))

  return {
    items: input.items,
    page: input.page,
    pageSize: input.pageSize,
    total: input.total,
    pageCount,
    hasMore: input.page < pageCount,
  }
}
