import { describe, expect, it } from 'vitest'

import { chaseDaysFor, followUpForStage } from '#/backend/modules/leads/lead.automation'
import { eventSource } from '#/backend/modules/leads/lead.events'
import {
  AUTOMATION_RULES,
  CARD_KEYS,
  DEFAULT_LEAD_PREFERENCES,
  DEFAULT_TIMINGS,
  LOCKED_RULES,
  OPEN_STAGES,
  STAGE_WEIGHT,
  isOpenStage,
  readLeadPreferences,
  type LeadPreferences,
} from '#/shared/validation/pipeline.validation'
import { LEAD_STATUSES } from '#/shared/validation/lead.validation'

describe('the stages', () => {
  it('carries the seven the database allows, in board order', () => {
    expect(LEAD_STATUSES).toEqual(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'HOLD', 'WON', 'LOST'])
  })

  it('weighs every stage, so no lead falls out of the pipeline figure', () => {
    for (const status of LEAD_STATUSES) expect(typeof STAGE_WEIGHT[status]).toBe('number')
  })

  /**
   * The odds rise towards the sale and a lost lead is worth nothing. A weight
   * out of order would quietly make a worse pipeline look better.
   */
  it('rises towards the sale', () => {
    expect(STAGE_WEIGHT.NEW).toBeLessThan(STAGE_WEIGHT.CONTACTED)
    expect(STAGE_WEIGHT.CONTACTED).toBeLessThan(STAGE_WEIGHT.QUALIFIED)
    expect(STAGE_WEIGHT.QUALIFIED).toBeLessThan(STAGE_WEIGHT.PROPOSAL)
    expect(STAGE_WEIGHT.PROPOSAL).toBeLessThan(STAGE_WEIGHT.WON)
    expect(STAGE_WEIGHT.LOST).toBe(0)
  })

  /** A deal parked until January must not make a quiet quarter look busy. */
  it('counts a parked lead low', () => {
    expect(STAGE_WEIGHT.HOLD).toBeLessThan(STAGE_WEIGHT.QUALIFIED)
  })

  it('treats only WON and LOST as ends', () => {
    for (const status of OPEN_STAGES) expect(isOpenStage(status)).toBe(true)
    expect(isOpenStage('WON')).toBe(false)
    expect(isOpenStage('LOST')).toBe(false)
  })
})

describe('follow-up dates', () => {
  const prefs = DEFAULT_LEAD_PREFERENCES

  it('chases a proposal sooner than anything else', () => {
    expect(chaseDaysFor('PROPOSAL', prefs)).toBe(prefs.timing.proposalChaseDays)
    expect(chaseDaysFor('QUALIFIED', prefs)).toBe(prefs.timing.chaseDays)
    expect(chaseDaysFor('PROPOSAL', prefs)).toBeGreaterThan(chaseDaysFor('QUALIFIED', prefs))
  })

  it('clears the date when a lead closes', () => {
    expect(followUpForStage('WON', prefs)).toBeNull()
    expect(followUpForStage('LOST', prefs)).toBeNull()
  })

  it('schedules one when a lead moves forward', () => {
    const date = followUpForStage('PROPOSAL', prefs)

    expect(date).toBeInstanceOf(Date)
    expect((date as Date).getTime()).toBeGreaterThan(Date.now())
  })

  /**
   * `undefined` means "leave the date alone" and `null` means "clear it".
   * Collapsing the two would wipe a date the owner set by hand every time he
   * moved a card with the suggestion switched off.
   */
  it('leaves the date alone when the suggestion is switched off', () => {
    const off: LeadPreferences = {
      ...prefs,
      followUp: { ...prefs.followUp, autoFollowUp: false },
    }

    expect(followUpForStage('QUALIFIED', off)).toBeUndefined()
    expect(followUpForStage('WON', off)).toBeNull()
  })
})

describe('where an event came from', () => {
  it('reads the screen off the kind, so nothing has to store it', () => {
    expect(eventSource('ARRIVED')).toBe('inbox')
    expect(eventSource('REPLIED')).toBe('inbox')
    expect(eventSource('BOOKED')).toBe('calls')
    expect(eventSource('CANCELLED')).toBe('calls')
    expect(eventSource('CALL_HELD')).toBe('calls')
    expect(eventSource('WON')).toBe('pipeline')
    expect(eventSource('AUTO_CLOSED')).toBe('pipeline')
  })
})

describe('preferences', () => {
  it('ships with everything on and every rule automatic', () => {
    for (const key of CARD_KEYS) expect(DEFAULT_LEAD_PREFERENCES.card[key]).toBe(true)
    for (const rule of AUTOMATION_RULES) expect(DEFAULT_LEAD_PREFERENCES.rules[rule]).toBe('auto')
    expect(DEFAULT_LEAD_PREFERENCES.timing).toEqual(DEFAULT_TIMINGS)
  })

  it('fills in a switch a stored row predates', () => {
    const stored = readLeadPreferences({ card: { value: false } })

    expect(stored.card.value).toBe(false)
    expect(stored.card.nextStep).toBe(true)
    expect(stored.timing.snoozeDays).toBe(DEFAULT_TIMINGS.snoozeDays)
  })

  it('ignores a key the page does not know', () => {
    const stored = readLeadPreferences({ card: { invented: true }, nonsense: 1 })

    expect('invented' in stored.card).toBe(false)
    expect(stored.card.value).toBe(true)
  })

  it('refuses to read a locked rule as anything but automatic', () => {
    const stored = readLeadPreferences({ rules: { arrive: 'off', silence: 'suggest' } })

    for (const rule of LOCKED_RULES) expect(stored.rules[rule]).toBe('auto')
    expect(stored.rules.silence).toBe('suggest')
  })

  it('falls back on a timing that is not a whole number', () => {
    const stored = readLeadPreferences({ timing: { snoozeDays: 'soon', staleDays: 4.5, chaseDays: 2 } })

    expect(stored.timing.snoozeDays).toBe(DEFAULT_TIMINGS.snoozeDays)
    expect(stored.timing.staleDays).toBe(DEFAULT_TIMINGS.staleDays)
    expect(stored.timing.chaseDays).toBe(2)
  })

  it('survives a row that is not an object at all', () => {
    expect(readLeadPreferences(null)).toEqual(DEFAULT_LEAD_PREFERENCES)
    expect(readLeadPreferences('nonsense')).toEqual(DEFAULT_LEAD_PREFERENCES)
  })
})
