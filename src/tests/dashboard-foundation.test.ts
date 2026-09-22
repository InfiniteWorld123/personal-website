import { describe, expect, it } from 'vitest'
import { defaultLanguage, documentLanguageFor } from '#/frontend/i18n/language'
import {
  dashboardFooterNavigation,
  dashboardNavigation,
  isSectionActive,
} from '#/frontend/dashboard/dashboard-navigation'

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
  /**
   * Nine since 22 Sep 2026. Media joined the eight the owner first approved,
   * because the shared vault is a place the owner visits — to tidy folders,
   * delete old files and see what of theirs is public — and none of that has
   * a home inside the picker other modules open. Ten since the Services
   * module, placed directly after Projects by the owner.
   */
  it('carries the ten approved sections in order', () => {
    expect(dashboardNavigation.map((item) => item.label)).toEqual([
      'Overview',
      'Projects',
      'Services',
      'Calendar',
      'Inbox',
      'Leads',
      'Content',
      'Blog',
      'Media',
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
