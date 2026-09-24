import { describe, expect, it } from 'vitest'
import { CONTENT_LANGUAGES } from '#/backend2/contracts/content.contract'
import { CONTENT_SEARCH_LANGUAGES } from '#/frontend/features/content-v2/content-search'
import { APPOINTMENT_STATUSES, BOOKING_METHODS } from '#/backend2/contracts/booking.contract'
import { Route as calendarRoute } from '#/frontend/routes/dashboard.calendar'

/**
 * Route search parsers spell their allowed values out, so the public bundle
 * does not carry the validation modules. These tests are what keeps each copy
 * equal to its source.
 */
describe('search constants copied into route parsers', () => {
  it('match the contract lists', () => {
    expect(CONTENT_SEARCH_LANGUAGES).toEqual(CONTENT_LANGUAGES)
  })

  it('accept every calendar status and method the contract has', () => {
    const validate = calendarRoute.options.validateSearch as (s: Record<string, unknown>) => Record<string, unknown>

    for (const status of APPOINTMENT_STATUSES) expect(validate({ status }).status).toBe(status)
    for (const method of BOOKING_METHODS) expect(validate({ method }).method).toBe(method)
    expect(validate({ status: 'nope', method: 'nope' })).toMatchObject({ status: undefined, method: undefined })
  })
})
