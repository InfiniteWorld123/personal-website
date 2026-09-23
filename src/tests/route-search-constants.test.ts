import { describe, expect, it } from 'vitest'
import { CONTENT_LANGUAGES } from '#/backend2/contracts/content.contract'
import { CONTENT_SEARCH_LANGUAGES } from '#/frontend/features/content-v2/content-search'
import { APPOINTMENT_STATUSES, BOOKING_METHODS } from '#/backend2/contracts/booking.contract'
import { BOOKING_RANGE_FILTERS, BOOKING_STATUS_FILTERS } from '#/shared/validation/booking.validation'
import { LETTER_KINDS } from '#/shared/validation/invoice.validation'
import { POST_PUBLISHED_FILTERS } from '#/shared/validation/post.validation'
import * as bookingFilters from '#/frontend/features/booking/booking-filters'
import * as postFilters from '#/frontend/features/blog/post-filters'
import { Route as calendarRoute } from '#/frontend/routes/dashboard.calendar'
import { Route as letterRoute } from '#/frontend/routes/admin.inbox.$personId'

/**
 * Route search parsers spell their allowed values out, so the public bundle
 * does not carry the validation modules. These tests are what keeps each copy
 * equal to its source.
 */
describe('search constants copied into route parsers', () => {
  it('match the legacy validation lists', () => {
    expect(bookingFilters.BOOKING_STATUS_FILTERS).toEqual(BOOKING_STATUS_FILTERS)
    expect(bookingFilters.BOOKING_RANGE_FILTERS).toEqual(BOOKING_RANGE_FILTERS)
    expect(postFilters.POST_PUBLISHED_FILTERS).toEqual(POST_PUBLISHED_FILTERS)
    expect(CONTENT_SEARCH_LANGUAGES).toEqual(CONTENT_LANGUAGES)
  })

  it('accept every calendar status and method the contract has', () => {
    const validate = calendarRoute.options.validateSearch as (s: Record<string, unknown>) => Record<string, unknown>

    for (const status of APPOINTMENT_STATUSES) expect(validate({ status }).status).toBe(status)
    for (const method of BOOKING_METHODS) expect(validate({ method }).method).toBe(method)
    expect(validate({ status: 'nope', method: 'nope' })).toMatchObject({ status: undefined, method: undefined })
  })

  it('accept every letter kind the invoice validation has', () => {
    const validate = letterRoute.options.validateSearch as (s: Record<string, unknown>) => Record<string, unknown>

    for (const kind of LETTER_KINDS) {
      const result = validate({ letter: kind, invoice: '00000000-0000-4000-8000-000000000000' })
      expect(JSON.stringify(result)).toContain(kind)
    }
  })
})
