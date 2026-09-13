// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ProjectCard } from '#/frontend/features/work/ProjectCard'
import { ProjectCarousel } from '#/frontend/features/work/ProjectCarousel'
import { toProjectEntry } from '#/frontend/features/work/project-list'
import { getContent } from '#/frontend/content'
import { ContactForm } from '#/frontend/features/contact/ContactForm'
import { publicProjectFixture } from './fixtures/project'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, ...props }: any) => <a href={to.replace('$lang', params.lang).replace('$slug', params.slug ?? '')} {...props}>{children}</a>,
}))
vi.mock('#/frontend/hooks/use-prefers-reduced-motion', () => ({ usePrefersReducedMotion: () => true }))
vi.mock('#/frontend/features/security/TurnstileWidget', async () => {
  const { useEffect } = await import('react')

  return {
    TurnstileWidget: ({ onTokenChange }: { onTokenChange: (token: string) => void }) => {
      useEffect(() => onTokenChange('verified-test-token'), [onTokenChange])
      return <div data-testid="turnstile" />
    },
  }
})

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const work = getContent('en').work
const labels = { visit: work.visit, source: work.source, detail: work.detailLabel }

/** A project with nothing optional filled in: no links, no images, no tech shown. */
const bareEntry = () =>
  toProjectEntry(publicProjectFixture({ website: null, source: null, images: [] }))

const fullEntry = () => toProjectEntry(publicProjectFixture())

describe('equal project presentation', () => {
  it('omits missing links and placeholder images', () => {
    const { facts, copy } = bareEntry()
    render(<ProjectCard facts={facts} copy={copy} language="en" statusLabels={work.status} labels={labels} />)
    expect(screen.getAllByRole('link')).toHaveLength(2) // title and case study
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByText(facts.stack[0])).toBeNull()
  })
  it('limits Work technology text to three and keeps primary action first', () => {
    const { facts, copy } = fullEntry()
    const { container } = render(<ProjectCard facts={facts} copy={copy} language="en" statusLabels={work.status} labels={labels} showTech />)
    expect(container.querySelector('.work-card-tech')?.textContent).toBe(facts.stack.slice(0, 3).join(' · '))
    expect(container.querySelector('.work-card-actions a')?.textContent).toContain(work.detailLabel)
    expect(screen.getByRole('link', { name: work.source + ': ' + copy.name })).toBeTruthy()
  })
  it.each([0, 1, 3, 6, 10])('handles %i carousel fixtures without a fixed project count', count => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const entry = fullEntry()
    const entries = Array.from({ length: count }, (_, i) => ({ ...entry, facts: { ...entry.facts, slug: 'fixture-' + i } }))
    render(<ProjectCarousel entries={entries} work={work} language="en" />)
    expect(screen.queryAllByRole('article')).toHaveLength(count)
    expect(screen.queryByRole('button', { name: work.next })).toBeNull()
    if (!count) expect(screen.getByText(work.empty)).toBeTruthy()
  })
  it.each(['en', 'ar'] as const)('moves in the correct direction for %s and cleans its observer', language => {
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = disconnect })
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(900)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 280 } as DOMRect)
    const scrollBy = vi.fn()
    vi.stubGlobal('getComputedStyle', () => ({ columnGap: '20px', getPropertyValue: () => '' }))
    Object.defineProperty(HTMLElement.prototype, 'scrollBy', { value: scrollBy, configurable: true })
    const entries = ['a', 'b', 'c'].map((slug) =>
      toProjectEntry(publicProjectFixture({ slug: `fixture-${slug}` })),
    )
    const { unmount } = render(<ProjectCarousel entries={entries} work={work} language={language} />)
    expect((screen.getByRole('button', { name: work.previous }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: work.next }))
    expect(scrollBy).toHaveBeenCalledWith({ left: language === 'ar' ? -300 : 300, behavior: 'instant' })
    unmount()
    expect(disconnect).toHaveBeenCalledOnce()
    delete (HTMLElement.prototype as any).scrollBy
  })
})

describe('contact behavior is preserved', () => {
  const copy = getContent('en').contact.form
  it('validates without sending invalid requests', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    render(<ContactForm copy={copy} language="en" />)
    fireEvent.click(screen.getByRole('button', { name: copy.submit }))
    expect(screen.getByText(copy.errors.name)).toBeTruthy()
    expect(screen.getByText(copy.errors.email)).toBeTruthy()
    expect(screen.getByText(copy.errors.message)).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('sends the words the visitor read, not the option ids', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 201 })
    vi.stubGlobal('fetch', fetch)
    render(<ContactForm copy={copy} language="en" />)
    fireEvent.change(document.querySelector('#name')!, { target: { value: 'Test Person' } })
    fireEvent.change(document.querySelector('#email')!, { target: { value: 'test@example.com' } })
    fireEvent.change(document.querySelector('#message')!, { target: { value: 'Local test message, never sent.' } })
    fireEvent.change(document.querySelector('#budget')!, { target: { value: copy.budgets[2].value } })
    fireEvent.click(screen.getByRole('button', { name: copy.submit }))

    await screen.findByRole('status')
    const body = fetch.mock.calls[0][1].body as FormData

    // "3000-6000" would reach the inbox as "3000-6000" and read as machinery.
    expect(body.get('budget')).toBe(copy.budgets[2].label)
    expect(body.get('projectType')).toBe(copy.projectTypes[0].label)
    expect(body.get('language')).toBe('en')
  })

  it.each([true, false])('keeps the %s response state with a mocked transport', async ok => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500 }))
    render(<ContactForm copy={copy} language="en" />)
    fireEvent.change(document.querySelector('#name')!, { target: { value: 'Test Person' } })
    fireEvent.change(document.querySelector('#email')!, { target: { value: 'test@example.com' } })
    fireEvent.change(document.querySelector('#message')!, { target: { value: 'Local test message, never sent.' } })
    fireEvent.click(screen.getByRole('button', { name: copy.submit }))
    expect(await screen.findByRole(ok ? 'status' : 'alert')).toBeTruthy()
  })
})
