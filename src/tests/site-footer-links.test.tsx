// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * The footer's contact column (approved 27 Sep 2026, `1A 2A 3A`): the owner's
 * profile links in the owner's order, each an icon and its name, hidden ones
 * left out, under the heading "Kontakt".
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => <a className={className}>{children}</a>,
}))

vi.mock('#/frontend/i18n/language-provider', () => ({ useLanguage: () => ({ language: 'de' }) }))

const { SiteFooter } = await import('#/frontend/components/layout/public/SiteFooter')
const { applyContentOverrides, emptyOverrides } = await import('#/frontend/content/overrides')
const { content } = await import('#/frontend/content/base')

afterEach(() => {
  cleanup()
  applyContentOverrides(emptyOverrides())
})

// "Kontakt" is also a page link; the column is under the heading of that name.
const contactColumn = () => screen.getAllByText('Kontakt').find((element) => element.tagName === 'P')!.parentElement!

describe('the footer’s contact column', () => {
  it('shows the email and the release links, each with an icon', () => {
    render(<SiteFooter copy={content.de.shell} />)

    const column = contactColumn()
    const links = within(column).getAllByRole('link')

    expect(links.map((link) => link.textContent)).toEqual(['info@yamanwarda.de', 'GitHub', 'LinkedIn'])
    for (const link of links) expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    expect(links[1].getAttribute('href')).toBe('https://github.com/InfiniteWorld123')
    expect(links[1].getAttribute('rel')).toBe('me noreferrer')
  })

  it('follows the owner’s saved list: order, names, and hidden links left out', () => {
    applyContentOverrides({
      ...emptyOverrides(),
      shared: {
        'site.links': [
          { platform: 'instagram', url: 'https://instagram.com/yaman', label: '', hidden: false },
          { platform: 'github', url: 'https://github.com/yaman', label: '', hidden: true },
          { platform: 'website', url: 'https://www.example.org', label: '', hidden: false },
        ],
      },
    })
    render(<SiteFooter copy={content.de.shell} />)

    const names = within(contactColumn()).getAllByRole('link').map((link) => link.textContent)
    expect(names).toEqual(['info@yamanwarda.de', 'Instagram', 'example.org'])
  })
})
