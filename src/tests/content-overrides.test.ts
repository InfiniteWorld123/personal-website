import { afterEach, describe, expect, it } from 'vitest'
import { content } from '#/frontend/content/base'
import {
  codeDefault,
  editableFieldByKey,
  editableFields,
  isEditableKey,
} from '#/frontend/content/editable'
import {
  applyContentOverrides,
  emptyOverrides,
  getServicePrices,
  getSite,
  resolveContent,
} from '#/frontend/content/overrides'

afterEach(() => applyContentOverrides(emptyOverrides()))

describe('the editable registry', () => {
  it('offers the copy that sells and withholds the copy that is furniture', () => {
    expect(isEditableKey('home.hero.headline')).toBe(true)
    expect(isEditableKey('home.meta.description')).toBe(true)
    expect(isEditableKey('legal.impressum.intro')).toBe(true)
    expect(isEditableKey('site.phone')).toBe(true)
    expect(isEditableKey('price.websites')).toBe(true)

    // The owner ruled these out on 13 Sep 2026, and D12 rules out the rest.
    expect(isEditableKey('contact.form.submit')).toBe(false)
    expect(isEditableKey('shell.nav.0.label')).toBe(false)
    expect(isEditableKey('work.items.inknest.name')).toBe(false)
    expect(isEditableKey('blog.loadMore')).toBe(false)
  })

  it('never offers a route as something to rewrite', () => {
    expect(editableFields.some((field) => field.key.endsWith('.to'))).toBe(false)
  })

  it('knows a list from a sentence from a price', () => {
    expect(editableFieldByKey.get('home.hero.typed[]')?.kind).toBe('list')
    expect(editableFieldByKey.get('home.hero.cta')?.kind).toBe('text')
    expect(editableFieldByKey.get('home.hero.sub')?.kind).toBe('area')
    expect(editableFieldByKey.get('price.shopify')?.kind).toBe('number')
  })

  it('holds the owner’s own details once rather than three times', () => {
    expect(editableFieldByKey.get('site.email')?.shared).toBe(true)
    expect(editableFieldByKey.get('home.hero.cta')?.shared).toBe(false)
  })

  it('recommends the length the design was built for, and the conventions for search', () => {
    expect(editableFieldByKey.get('home.meta.title')?.max).toBe(60)
    expect(editableFieldByKey.get('home.meta.description')?.max).toBe(155)

    const headline = editableFieldByKey.get('home.hero.headline')
    expect(headline?.max).toBeGreaterThan(content.de.home.hero.headline.length)
  })

  it('can always name the wording the code ships', () => {
    expect(codeDefault('home.hero.cta', 'de')).toBe(content.de.home.hero.cta)
    expect(codeDefault('home.hero.cta', 'ar')).toBe(content.ar.home.hero.cta)
    expect(codeDefault('price.websites', 'de')).toBe(990)
    expect(codeDefault('site.phone', 'de')).toBe('')
  })
})

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
