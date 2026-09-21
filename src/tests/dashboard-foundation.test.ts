import { describe, expect, it } from 'vitest'
import { count, money, moneyExact, percentChange } from '#/frontend/dashboard/format'
import { defaultLanguage, documentLanguageFor } from '#/frontend/i18n/language'
import {
  dashboardFooterNavigation,
  dashboardNavigation,
  isSectionActive,
} from '#/frontend/dashboard/dashboard-navigation'
import {
  sampleCollected,
  sampleFigures,
  sampleInvoices,
  sampleOverdue,
  sampleWeek,
} from '#/frontend/dashboard/sample-data'

describe('the sidebar knows which section you are in', () => {
  const section = (to: string) => {
    const found = [...dashboardNavigation, ...dashboardFooterNavigation].find(
      (item) => item.to === to,
    )
    if (!found) throw new Error(`${to} is not in the navigation`)

    return found
  }

  /**
   * `/dashboard` is a prefix of every other route, so a plain `startsWith`
   * leaves Overview lit on every screen — the sidebar saying you are in two
   * places at once.
   */
  it('lights Overview only on Overview', () => {
    expect(isSectionActive(section('/dashboard'), '/dashboard')).toBe(true)
    expect(isSectionActive(section('/dashboard'), '/dashboard/invoices')).toBe(false)
    expect(isSectionActive(section('/dashboard'), '/dashboard/inbox')).toBe(false)
  })

  it('lights a section on its own page and anything under it', () => {
    expect(isSectionActive(section('/dashboard/invoices'), '/dashboard/invoices')).toBe(true)
    expect(isSectionActive(section('/dashboard/invoices'), '/dashboard/invoices/INV-1')).toBe(true)
    expect(isSectionActive(section('/dashboard/invoices'), '/dashboard/inbox')).toBe(false)
  })

  it('never lights a section from the legacy admin, which is a separate system', () => {
    for (const item of dashboardNavigation) {
      expect(isSectionActive(item, '/admin/invoices')).toBe(false)
    }
  })

  /** The order the owner approved, and no AI item — the assistant is public. */
  it('carries the eight approved sections in order', () => {
    expect(dashboardNavigation.map((item) => item.label)).toEqual([
      'Overview',
      'Projects',
      'Calendar',
      'Inbox',
      'Leads',
      'Content',
      'Blog',
      'Invoices',
    ])
  })

  it('keeps every section under /dashboard and none under /admin', () => {
    for (const item of [...dashboardNavigation, ...dashboardFooterNavigation]) {
      expect(item.to.startsWith('/dashboard')).toBe(true)
    }
  })
})

/**
 * The document shell renders `<html lang>` on the server and `LanguageProvider`
 * writes it again after hydration. While they each worked the language out for
 * themselves they disagreed about `/dashboard`: the server said English, the
 * provider overwrote it with the German default a tick later, and the page
 * announced itself as German to a screen reader. One helper now answers for
 * both, and these are the cases that must not drift again.
 */
describe('what the document says its language is', () => {
  it('calls the dashboard English, with or without a trailing path', () => {
    expect(documentLanguageFor('/dashboard')).toBe('en')
    expect(documentLanguageFor('/dashboard/')).toBe('en')
    expect(documentLanguageFor('/dashboard/invoices')).toBe('en')
  })

  it('leaves every public path exactly as it was', () => {
    expect(documentLanguageFor('/de/about')).toBe('de')
    expect(documentLanguageFor('/en/work/prime-estate')).toBe('en')
    expect(documentLanguageFor('/ar')).toBe('ar')
  })

  /** Anything without a language segment still falls back to the default. */
  it('falls back for paths that carry no language', () => {
    expect(documentLanguageFor('/')).toBe(defaultLanguage)
    expect(documentLanguageFor('/admin/invoices')).toBe(defaultLanguage)
  })

  /** A path that merely starts with the same letters is not the dashboard. */
  it('does not mistake a lookalike path for the dashboard', () => {
    expect(documentLanguageFor('/dashboards')).toBe(defaultLanguage)
    expect(documentLanguageFor('/de/dashboard')).toBe('de')
  })
})

describe('money and figures are written the way he reads them', () => {
  /**
   * German grouping, a trailing euro sign, and the cents dropped. The space
   * before the sign is the non-breaking one `Intl` produces on purpose — a
   * figure must never wrap away from its currency, so the tests name it
   * explicitly rather than letting a plain space pass by accident.
   */
  it('prints whole euros from cents', () => {
    expect(money(845_000)).toBe('8.450 €')
    expect(money(62_000)).toBe('620 €')
    expect(money(0)).toBe('0 €')
  })

  it('keeps the cents when a single invoice names them', () => {
    expect(moneyExact(124_050)).toBe('1.240,50 €')
  })

  it('groups counts the same way', () => {
    expect(count(1_284)).toBe('1.284')
  })

  /** A real minus sign, not a hyphen, and no sign at all at zero. */
  it('signs a change without guessing', () => {
    expect(percentChange(18)).toBe('+18 %')
    expect(percentChange(-4)).toBe('−4 %')
    expect(percentChange(0)).toBe('0 %')
  })
})

/**
 * The sample data is a fixture, but the figures drawn from it still have to
 * agree with each other. A dashboard whose overdue card and overdue list say
 * different numbers is the exact failure this rebuild exists to avoid — and it
 * would be just as wrong once the fixture is replaced by a query.
 */
describe('the figures on screen agree with the rows behind them', () => {
  it('sums the overdue card from the overdue invoices', () => {
    const fromRows = sampleOverdue.reduce((total, row) => total + row.cents, 0)

    expect(fromRows).toBe(sampleFigures.overdueCents)
    expect(sampleOverdue).toHaveLength(sampleFigures.overdueCount)
  })

  it('matches the overdue rows in the invoice table to the same figure', () => {
    const overdue = sampleInvoices.filter((row) => row.group === 'overdue')

    expect(overdue.reduce((total, row) => total + row.cents, 0)).toBe(sampleFigures.overdueCents)
    expect(overdue).toHaveLength(sampleFigures.overdueCount)
  })

  it('counts the paid invoices as this month s revenue', () => {
    const paid = sampleInvoices.filter((row) => row.group === 'paid')

    expect(paid.reduce((total, row) => total + row.cents, 0)).toBe(sampleFigures.revenueCents)
    expect(sampleCollected.paidCents).toBe(sampleFigures.revenueCents)
  })

  /**
   * The gauge says what share of everything billed has landed. Its denominator
   * has to be every row on the invoice table — if it silently left the August
   * invoices out while the overdue card counts them, the two panels would be
   * describing different businesses.
   */
  it('measures the gauge against every invoice on the table', () => {
    const everything = sampleInvoices.reduce((total, row) => total + row.cents, 0)

    expect(sampleCollected.invoicedCents).toBe(everything)
    expect(sampleCollected.invoicedCents).toBeGreaterThan(sampleCollected.paidCents)
  })

  it('adds the week up to the month s visit figure', () => {
    // Seven days cannot exceed thirty of them, and a week that beat the month
    // would mean the two panels are counting different things.
    const week = sampleWeek.reduce((total, day) => total + day.visits, 0)

    expect(week).toBeLessThanOrEqual(sampleFigures.visits)
    expect(week).toBeGreaterThan(0)
  })
})
