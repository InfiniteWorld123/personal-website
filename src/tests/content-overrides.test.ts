import { afterEach, describe, expect, it } from 'vitest'
import { content } from '#/frontend/content/base'
import {
  applyContentOverrides,
  emptyOverrides,
  getServicePrices,
  getSite,
  resolveContent,
} from '#/frontend/content/overrides'

afterEach(() => applyContentOverrides(emptyOverrides()))

describe('published overrides', () => {
  it('serves the code’s wording while nothing has been published', () => {
    expect(resolveContent('de').home.hero.headline).toBe(content.de.home.hero.headline)
  })

  it('puts a published sentence in front of the code’s, in that language only', () => {
    applyContentOverrides({
      ...emptyOverrides(),
      de: { 'home.hero.headline': 'Ein Partner, kein Anbieter.' },
    })

    expect(resolveContent('de').home.hero.headline).toBe('Ein Partner, kein Anbieter.')
    expect(resolveContent('en').home.hero.headline).toBe(content.en.home.hero.headline)
  })

  it('leaves the code’s own object untouched, so nothing leaks between renders', () => {
    const before = content.de.home.hero.headline

    applyContentOverrides({ ...emptyOverrides(), de: { 'home.hero.headline': 'Etwas anderes.' } })
    resolveContent('de')
    applyContentOverrides(emptyOverrides())

    expect(content.de.home.hero.headline).toBe(before)
    expect(resolveContent('de').home.hero.headline).toBe(before)
  })

  it('replaces a whole list rather than merging into it', () => {
    applyContentOverrides({ ...emptyOverrides(), de: { 'home.hero.typed[]': ['WEB-', 'APP-'] } })

    expect(resolveContent('de').home.hero.typed).toEqual(['WEB-', 'APP-'])
  })

  it('reaches a sentence nested inside a list of objects', () => {
    applyContentOverrides({
      ...emptyOverrides(),
      de: { 'home.process.steps.0.title': 'Sag mir, was du willst.' },
    })

    expect(resolveContent('de').home.process.steps[0].title).toBe('Sag mir, was du willst.')
    expect(resolveContent('de').home.process.steps[1].title).toBe(
      content.de.home.process.steps[1].title,
    )
  })

  it('ignores a key the code no longer ships instead of growing a new branch', () => {
    applyContentOverrides({ ...emptyOverrides(), de: { 'home.hero.retired': 'nothing' } })

    expect('retired' in resolveContent('de').home.hero).toBe(false)
  })

  it('gives the details and the prices to every language at once', () => {
    applyContentOverrides({
      ...emptyOverrides(),
      shared: { 'site.email': 'hallo@yamanwarda.de', 'site.phone': '+49 170 000', 'price.websites': 1290 },
    })

    expect(getSite().email).toBe('hallo@yamanwarda.de')
    expect(getSite().phone).toBe('+49 170 000')
    expect(getServicePrices().websites).toBe(1290)
    expect(getServicePrices().shopify).toBe(2490)
  })

  it('shows no phone number until one is written', () => {
    expect(getSite().phone).toBe('')
  })
})
