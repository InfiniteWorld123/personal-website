import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The dashboard stylesheet, read as text.
 *
 * Everything else about this surface is checked by rendering it, but jsdom
 * does not resolve layered CSS, so the rules that decide what a *collapsed*
 * sidebar looks like are invisible to every other test here. They are also the
 * rules most likely to be edited by someone changing something else, and they
 * fail silently: a broken one does not throw, it just stops applying.
 *
 * That is not hypothetical. The list below once ended on a fifth selector,
 * `.dash-nav-badge`. When the counts were taken out of the navigation that
 * line was deleted — and it was carrying the closing brace and the
 * `display: none` with it. The list was left hanging on a comma, swallowed the
 * rule written after it, and the collapsed rail stopped hiding anything: at
 * 72px the owner's name broke over two lines, every label wrapped, and the
 * site card folded into a column of three-letter words. It shipped, and it was
 * spotted from a screenshot rather than from a failing test.
 */
const css = readFileSync('src/frontend/dashboard/dashboard.css', 'utf8')

/** Every rule as `{ selector, body }`, with comments removed first. */
const rules = css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('}')
  .map((chunk) => {
    const at = chunk.indexOf('{')
    if (at === -1) return null

    return { selector: chunk.slice(0, at).trim(), body: chunk.slice(at + 1).trim() }
  })
  .filter((rule): rule is { selector: string; body: string } => rule !== null)

const ruleFor = (selector: string) =>
  rules.find((rule) => rule.selector.split(',').some((part) => part.trim() === selector))

describe('the collapsed sidebar still hides what does not fit in 72px', () => {
  it.each([
    ['.dash-wordmark', 'the owner name and the word Dashboard'],
    ['.dash-group-label', 'the MENU and GENERAL headings'],
    ['.dash-promo', 'the public-site card in the footer'],
    ['.dash-nav-text', 'every navigation label'],
  ])('hides %s — %s', (klass) => {
    const rule = ruleFor(`[data-dashboard][data-rail='true'] ${klass}`)

    expect(rule, `no rule targets ${klass} in the collapsed rail`).toBeDefined()
    expect(rule?.body).toContain('display: none')
  })

  /**
   * The other half of the same rule: collapsed, a row centres its icon and
   * gives up the padding that positions a label it no longer shows.
   */
  it('takes the row padding away so the icon can centre', () => {
    const rule = ruleFor("[data-dashboard][data-rail='true'] .dash-nav-row")

    expect(rule?.body).toContain('justify-content: center')
    expect(rule?.body).toContain('padding-left: 0')
  })
})

describe('opening the rail reveals rather than reflows', () => {
  /**
   * The contents are laid out at the open width from the first frame and the
   * sidebar clips them, so the 220ms of widening slides the labels into view
   * instead of wrapping them into a 72px column for the length of it.
   */
  it('holds the open width while the sidebar is still widening', () => {
    const rule = ruleFor("[data-dashboard]:not([data-rail='true']) .dash-side-inner")

    expect(rule?.body).toContain('width: 264px')
  })

  it('clips while open and stays visible while collapsed', () => {
    const open = ruleFor("[data-dashboard]:not([data-rail='true']) .dash-side")

    // Horizontally clipped, vertically scrollable: a short window must not
    // swallow the last section of the navigation.
    expect(open?.body).toContain('overflow: hidden auto')

    // Collapsed, nothing may clip: the label slides out past 72px.
    const collapsed = ruleFor("[data-dashboard][data-rail='true'] .dash-side")
    expect(collapsed?.body ?? '').not.toContain('overflow')
  })
})

describe('the stylesheet is structurally whole', () => {
  /** A dangling comma is what made the rule above disappear in the first place. */
  it('leaves no selector list hanging', () => {
    const dangling = rules.filter((rule) => rule.selector.trimEnd().endsWith(','))

    expect(dangling.map((rule) => rule.selector)).toEqual([])
  })

  it('balances every brace', () => {
    const naked = css.replace(/\/\*[\s\S]*?\*\//g, '')

    expect(naked.split('{').length).toBe(naked.split('}').length)
  })
})
