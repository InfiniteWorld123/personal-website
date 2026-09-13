import { describe, expect, it } from 'vitest'
import {
  dayInZone,
  generateSlots,
  instantForWallTime,
  windowsForDay,
  type ScheduleException,
  type ScheduleRule,
  type SlotGenerationInput,
} from '#/backend/modules/bookings/availability.service'

const BERLIN = 'Europe/Berlin'

/**
 * Germany moves its clocks on the last Sunday of March and of October. These
 * are those two days in 2026, and they are the only dates in this file that
 * are not arbitrary.
 */
const SPRING_FORWARD = '2026-03-29'
const FALL_BACK = '2026-10-25'

/** A Monday and a Sunday well away from any clock change. */
const WINTER_MONDAY = '2026-01-12'
const SUMMER_MONDAY = '2026-07-13'

const at = (iso: string) => Date.parse(iso)

const officeHours = (weekday: number): ScheduleRule => ({
  weekday,
  startsAtMinute: 9 * 60,
  endsAtMinute: 17 * 60,
})

const input = (overrides: Partial<SlotGenerationInput> = {}): SlotGenerationInput => ({
  rules: [officeHours(1)],
  exceptions: [],
  existing: [],
  durationMinutes: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  slotIntervalMinutes: 30,
  minimumNoticeMinutes: 0,
  maxPerDay: null,
  ownerTimezone: BERLIN,
  fromDate: WINTER_MONDAY,
  toDate: WINTER_MONDAY,
  latestStart: at('2027-01-01T00:00:00.000Z'),
  now: at('2026-01-01T00:00:00.000Z'),
  ...overrides,
})

describe('instantForWallTime', () => {
  it('reads a winter morning as UTC+1', () => {
    expect(instantForWallTime(WINTER_MONDAY, 9 * 60, BERLIN)).toBe(
      at('2026-01-12T08:00:00.000Z'),
    )
  })

  it('reads the same wall time in summer as UTC+2', () => {
    expect(instantForWallTime(SUMMER_MONDAY, 9 * 60, BERLIN)).toBe(
      at('2026-07-13T07:00:00.000Z'),
    )
  })

  it('returns null for a wall time the spring-forward night skips', () => {
    // The clock goes straight from 02:00 to 03:00, so neither of these ever
    // shows on a clock in Germany that night.
    expect(instantForWallTime(SPRING_FORWARD, 2 * 60, BERLIN)).toBeNull()
    expect(instantForWallTime(SPRING_FORWARD, 2 * 60 + 30, BERLIN)).toBeNull()
  })

  it('keeps the hours either side of the gap', () => {
    expect(instantForWallTime(SPRING_FORWARD, 60, BERLIN)).toBe(at('2026-03-29T00:00:00.000Z'))
    expect(instantForWallTime(SPRING_FORWARD, 3 * 60, BERLIN)).toBe(at('2026-03-29T01:00:00.000Z'))
  })

  it('resolves the repeated autumn hour to one instant, not two', () => {
    expect(instantForWallTime(FALL_BACK, 2 * 60 + 30, BERLIN)).toBe(
      at('2026-10-25T01:30:00.000Z'),
    )
  })
})

describe('dayInZone', () => {
  it('reads an instant as the day it falls on where the visitor is', () => {
    const instant = at('2026-01-12T23:30:00.000Z')

    expect(dayInZone(instant, BERLIN)).toBe('2026-01-13')
    expect(dayInZone(instant, 'America/New_York')).toBe('2026-01-12')
  })
})

describe('windowsForDay', () => {
  const rules = [officeHours(1)]

  it('gives the weekly window on a matching weekday', () => {
    expect(windowsForDay(WINTER_MONDAY, rules, [])).toEqual([{ start: 540, end: 1020 }])
  })

  it('gives nothing on a weekday with no rule', () => {
    expect(windowsForDay('2026-01-11', rules, [])).toEqual([])
  })

  it('adds an opening on a day that has no rule', () => {
    const opening: ScheduleException = {
      onDate: '2026-01-11',
      kind: 'OPEN',
      startsAtMinute: 600,
      endsAtMinute: 720,
    }

    expect(windowsForDay('2026-01-11', rules, [opening])).toEqual([{ start: 600, end: 720 }])
  })

  it('splits the day in two when a block lands in the middle', () => {
    const lunch: ScheduleException = {
      onDate: WINTER_MONDAY,
      kind: 'BLOCK',
      startsAtMinute: 720,
      endsAtMinute: 780,
    }

    expect(windowsForDay(WINTER_MONDAY, rules, [lunch])).toEqual([
      { start: 540, end: 720 },
      { start: 780, end: 1020 },
    ])
  })

  it('lets a whole-day block win over an opening on the same day', () => {
    const exceptions: ScheduleException[] = [
      { onDate: WINTER_MONDAY, kind: 'OPEN', startsAtMinute: 480, endsAtMinute: 540 },
      { onDate: WINTER_MONDAY, kind: 'BLOCK', startsAtMinute: null, endsAtMinute: null },
    ]

    expect(windowsForDay(WINTER_MONDAY, rules, exceptions)).toEqual([])
  })
})

describe('generateSlots', () => {
  it('fills the working day on the grid it was given', () => {
    const slots = generateSlots(input())

    // 09:00 to 17:00 in half hours, the last call starting at 16:30.
    expect(slots).toHaveLength(16)
    expect(slots[0]).toBe(at('2026-01-12T08:00:00.000Z'))
    expect(slots[slots.length - 1]).toBe(at('2026-01-12T15:30:00.000Z'))
  })

  it('never offers a time the spring-forward night skips', () => {
    const slots = generateSlots(
      input({
        rules: [{ weekday: 0, startsAtMinute: 60, endsAtMinute: 240 }],
        fromDate: SPRING_FORWARD,
        toDate: SPRING_FORWARD,
      }),
    )

    expect(slots.map((slot) => new Date(slot).toISOString())).toEqual([
      '2026-03-29T00:00:00.000Z',
      '2026-03-29T00:30:00.000Z',
      '2026-03-29T01:00:00.000Z',
      '2026-03-29T01:30:00.000Z',
    ])
  })

  it('offers the repeated autumn hour once, not twice', () => {
    const slots = generateSlots(
      input({
        rules: [{ weekday: 0, startsAtMinute: 60, endsAtMinute: 240 }],
        fromDate: FALL_BACK,
        toDate: FALL_BACK,
      }),
    )

    expect(slots).toHaveLength(6)
    expect(new Set(slots).size).toBe(6)
  })

  it('drops a slot an existing booking covers', () => {
    const slots = generateSlots(
      input({
        existing: [
          {
            startsAt: at('2026-01-12T09:00:00.000Z'),
            blockedStartsAt: at('2026-01-12T09:00:00.000Z'),
            blockedEndsAt: at('2026-01-12T09:30:00.000Z'),
          },
        ],
      }),
    )

    expect(slots).not.toContain(at('2026-01-12T09:00:00.000Z'))
    expect(slots).toContain(at('2026-01-12T09:30:00.000Z'))
  })

  it('lets a buffer reach past the meeting and take the next slot too', () => {
    const slots = generateSlots(
      input({
        bufferAfterMinutes: 15,
        existing: [
          {
            startsAt: at('2026-01-12T09:00:00.000Z'),
            blockedStartsAt: at('2026-01-12T09:00:00.000Z'),
            // A 30 minute call whose 15 minute tail runs to 09:45.
            blockedEndsAt: at('2026-01-12T09:45:00.000Z'),
          },
        ],
      }),
    )

    // 09:30 would fit the meeting itself, but not the buffer around it.
    expect(slots).not.toContain(at('2026-01-12T09:30:00.000Z'))
    expect(slots).toContain(at('2026-01-12T10:00:00.000Z'))
  })

  it('never offers two slots whose own buffers overlap', () => {
    const slots = generateSlots(input({ bufferAfterMinutes: 15 }))

    // A 30-minute grid normally has 16 entries. With a 15-minute tail, every
    // second one would conflict with the slot directly before it, so it must
    // not be shown as a choice in the first place.
    expect(slots).toHaveLength(8)
    for (let index = 1; index < slots.length; index += 1) {
      expect(slots[index] - slots[index - 1]).toBe(60 * 60 * 1000)
    }
  })

  it('honours the minimum notice', () => {
    const slots = generateSlots(
      input({
        now: at('2026-01-12T08:00:00.000Z'),
        minimumNoticeMinutes: 120,
      }),
    )

    expect(slots[0]).toBe(at('2026-01-12T10:00:00.000Z'))
  })

  it('stops at the end of the booking window', () => {
    const slots = generateSlots({
      ...input(),
      latestStart: at('2026-01-12T09:00:00.000Z'),
    })

    expect(slots).toHaveLength(3)
  })

  it('closes a day that already holds its daily maximum', () => {
    const slots = generateSlots(
      input({
        maxPerDay: 2,
        existing: [
          {
            startsAt: at('2026-01-12T08:00:00.000Z'),
            blockedStartsAt: at('2026-01-12T08:00:00.000Z'),
            blockedEndsAt: at('2026-01-12T08:30:00.000Z'),
          },
          {
            startsAt: at('2026-01-12T13:00:00.000Z'),
            blockedStartsAt: at('2026-01-12T13:00:00.000Z'),
            blockedEndsAt: at('2026-01-12T13:30:00.000Z'),
          },
        ],
      }),
    )

    expect(slots).toEqual([])
  })

  it('counts the daily maximum on the owner’s day, not the visitor’s', () => {
    // 22:00 UTC is still Sunday evening in Berlin, though it is already Monday
    // morning in Tokyo. The cap is the owner's, so this must not close the
    // Monday.
    const slots = generateSlots(
      input({
        maxPerDay: 1,
        existing: [
          {
            startsAt: at('2026-01-11T22:00:00.000Z'),
            blockedStartsAt: at('2026-01-11T22:00:00.000Z'),
            blockedEndsAt: at('2026-01-11T22:30:00.000Z'),
          },
        ],
      }),
    )

    expect(slots).toHaveLength(16)
  })
})
