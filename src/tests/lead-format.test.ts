import { afterEach, describe, expect, it, vi } from 'vitest'
import { daysUntil, dueLabel, dueTone, money, today } from '#/frontend/features/leads/lead-format'

/**
 * The follow-up list is only useful if "today" means today **where he lives**.
 *
 * A Worker's clock is UTC, and between midnight and 02:00 in Erfurt that is
 * still yesterday — so a list built on the server's date would move a person
 * out of "overdue" for two hours every night, which is exactly the kind of
 * quiet wrongness that makes a panel untrustworthy. The same zone is used in
 * SQL (`TODAY` in `lead.sql.ts`) and here.
 */

const at = (iso: string) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

afterEach(() => vi.useRealTimers())

const plain = (value: string) => value.replace(/ /g, ' ')

describe('today, on his clock', () => {
  it('is already tomorrow in Erfurt while it is still today in UTC', () => {
    // 23:30 UTC on the 18th is 01:30 on the 19th in Erfurt, summer time.
    at('2026-09-18T23:30:00Z')

    expect(today()).toBe('2026-09-19')
  })

  it('is the same day through the working hours', () => {
    at('2026-09-18T09:00:00Z')

    expect(today()).toBe('2026-09-18')
  })

  it('still lands on his day after the clocks go back', () => {
    // Winter: Erfurt is UTC+1, so 23:30 UTC is 00:30 the next day.
    at('2026-11-10T23:30:00Z')

    expect(today()).toBe('2026-11-11')
  })
})

describe('how a follow-up reads', () => {
  it('counts whole days either side of today', () => {
    at('2026-09-18T09:00:00Z')

    expect(daysUntil('2026-09-15')).toBe(-3)
    expect(daysUntil('2026-09-18')).toBe(0)
    expect(daysUntil('2026-09-21')).toBe(3)
  })

  it('says how late, in words', () => {
    at('2026-09-18T09:00:00Z')

    expect(dueLabel('2026-09-15')).toBe('3 days late')
    expect(dueLabel('2026-09-17')).toBe('1 day late')
    expect(dueLabel('2026-09-18')).toBe('today')
    expect(dueLabel('2026-09-19')).toBe('tomorrow')
    expect(dueLabel('2026-09-23')).toBe('in 5 days')
    expect(dueLabel(null)).toBe('')
  })

  it('becomes a date once "in N days" stops helping', () => {
    at('2026-09-18T09:00:00Z')

    expect(dueLabel('2026-10-24')).toBe('Sat 24 Oct')
  })

  it('sorts a day into the group the list draws it in', () => {
    at('2026-09-18T09:00:00Z')

    expect(dueTone('2026-09-15')).toBe('late')
    expect(dueTone('2026-09-18')).toBe('today')
    expect(dueTone('2026-09-20')).toBe('soon')
    expect(dueTone('2026-10-30')).toBe('later')
    expect(dueTone(null)).toBe('none')
  })
})

describe('money', () => {
  it('writes whole euros the way he does', () => {
    expect(plain(money(99_000))).toBe('990 €')
    expect(plain(money(149_000))).toBe('1.490 €')
    expect(plain(money(0))).toBe('0 €')
  })

  it('keeps the cents when there are any', () => {
    expect(plain(money(4_950))).toBe('49,50 €')
  })
})
