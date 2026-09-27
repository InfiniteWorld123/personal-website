import { afterEach, describe, expect, it } from 'vitest'
import { content } from '#/frontend/content/base'
import { applyContentOverrides, emptyOverrides } from '#/frontend/content/overrides'
import { languages } from '#/frontend/i18n/language'
import { Route as aboutRoute } from '#/frontend/routes/$lang.about'
import { Route as contactRoute } from '#/frontend/routes/$lang.contact'
import { Route as faqRoute } from '#/frontend/routes/$lang.faq'
import { Route as homeRoute } from '#/frontend/routes/$lang.index'
import { Route as servicesRoute } from '#/frontend/routes/$lang.services.index'
import { Route as languageRoute } from '#/frontend/routes/$lang'
import type { PublishedContent } from '#/shared/types/content.types'

type Head = { meta?: Array<Record<string, unknown> | undefined> }

/** Calls a route's `head()` the way the router does, with only what it reads. */
const runHead = async (route: { options: { head?: unknown } }, context: object): Promise<Head> => {
  const head = route.options.head as ((context: object) => Head | Promise<Head>) | undefined
  return (await head?.(context)) ?? {}
}

const titleOf = (head: Head) => head.meta?.find((tag) => tag && 'title' in tag)?.title

const pages = [
  { route: homeRoute, section: 'home' },
  { route: aboutRoute, section: 'about' },
  { route: faqRoute, section: 'faq' },
  { route: contactRoute, section: 'contact' },
  { route: servicesRoute, section: 'services' },
] as const

// Nothing applied before a test: the browser starts every page load with the
// code's copy and only the language route's loader data carries the saved one.
afterEach(() => applyContentOverrides(emptyOverrides()))

/**
 * The router builds the head the same way on the server and while the browser
 * hydrates: every match's `head()` in order, parent first, before React
 * renders. The saved title must already be in place when the page's own head
 * runs, or the browser replaces the server's title with the code's one.
 */
describe('page titles from saved content', () => {
  it('use the saved title and description on every page and in every language', async () => {
    const published: PublishedContent = { de: {}, en: {}, ar: {}, shared: {} }

    for (const language of languages) {
      for (const { section } of pages) {
        published[language][`${section}.meta.title`] = `Saved ${section} title (${language})`
        published[language][`${section}.meta.description`] = `Saved ${section} description (${language})`
      }
    }

    for (const language of languages) {
      for (const { route, section } of pages) {
        const params = { lang: language }
        await runHead(languageRoute, { params, loaderData: { published, beacon: null } })
        const head = await runHead(route, { params, loaderData: undefined })

        expect(titleOf(head)).toBe(`Saved ${section} title (${language})`)
        expect(head.meta).toContainEqual({ name: 'description', content: `Saved ${section} description (${language})` })
      }
    }
  })

  it('keep the code’s title for a page whose title was never saved', async () => {
    const published: PublishedContent = { de: { 'about.meta.title': 'Nur Über mich' }, en: {}, ar: {}, shared: {} }

    await runHead(languageRoute, { params: { lang: 'de' }, loaderData: { published, beacon: null } })

    expect(titleOf(await runHead(homeRoute, { params: { lang: 'de' } }))).toBe(content.de.home.meta.title)
  })

  it('follow a newly saved title on the next page load', async () => {
    const first: PublishedContent = { de: { 'home.meta.title': 'Erster Titel' }, en: {}, ar: {}, shared: {} }
    const second: PublishedContent = { de: { 'home.meta.title': 'Zweiter Titel' }, en: {}, ar: {}, shared: {} }
    const params = { lang: 'de' }

    await runHead(languageRoute, { params, loaderData: { published: first, beacon: null } })
    expect(titleOf(await runHead(homeRoute, { params }))).toBe('Erster Titel')

    await runHead(languageRoute, { params, loaderData: { published: second, beacon: null } })
    expect(titleOf(await runHead(homeRoute, { params }))).toBe('Zweiter Titel')
  })
})
