// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * These screens draw links, but none of them navigates during a test, so the
 * router is stood in for rather than started. What is being checked is the
 * part that is genuinely this code's own: which figure appears, which rows a
 * filter leaves behind, and which message the reading pane is showing.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: '/dashboard' } }),
}))

const { OverviewPage } = await import('#/frontend/pages/dashboard/overview/OverviewPage')
const { InvoicesPage } = await import('#/frontend/pages/dashboard/invoices/InvoicesPage')
const { InboxPage } = await import('#/frontend/pages/dashboard/inbox/InboxPage')
const { sampleFigures } = await import('#/frontend/dashboard/sample-data')
const { DashboardSidebar } = await import('#/frontend/dashboard/DashboardSidebar')

afterEach(cleanup)

/** `Intl` writes money with a non-breaking space; a reader does not see one. */
const plain = (value: string) => value.replace(/ /g, ' ')

const shown = (text: string) =>
  screen.getByText((content) => plain(content) === text)

describe('the Overview', () => {
  it('leads with the four figures, in the order he asked for', () => {
    render(<OverviewPage />)

    expect(screen.getByText('Revenue this month')).toBeTruthy()
    expect(screen.getByText('Overdue')).toBeTruthy()
    expect(screen.getByText('Website visits')).toBeTruthy()
    expect(screen.getByText('Unread messages')).toBeTruthy()

    expect(shown('8.450 €')).toBeTruthy()
    expect(shown('2.180 €')).toBeTruthy()
    expect(shown('1.284')).toBeTruthy()
  })

  /**
   * The badge is not decoration. Every figure on this page comes from a
   * fixture, and a dashboard whose numbers look counted but are not is the
   * failure the rebuild exists to avoid. It comes off when the page reads from
   * a real query, and not before.
   */
  it('says out loud that none of it is counted', () => {
    render(<OverviewPage />)

    expect(screen.getByText('SAMPLE DATA')).toBeTruthy()
  })

  /** Exactly one card carries the brand fill; if every card could be the loud
      one, none of them says anything. */
  it('sends the money cards to the invoices screen and leaves visits alone', () => {
    render(<OverviewPage />)

    const links = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'))

    expect(links).toContain('/dashboard/invoices')
    expect(links).toContain('/dashboard/inbox')
  })

  describe('the week of visits', () => {
    it('opens on the busiest day rather than an arbitrary one', () => {
      render(<OverviewPage />)

      expect(shown('Wednesday · 241 visits')).toBeTruthy()
    })

    it('answers a click on a bar', () => {
      render(<OverviewPage />)

      fireEvent.click(screen.getByRole('button', { name: 'Monday, 186 visits' }))

      expect(shown('Monday · 186 visits')).toBeTruthy()
    })

    /** The bars are shapes. The same numbers have to be readable without them. */
    it('writes the same figures out for a screen reader', () => {
      render(<OverviewPage />)

      const table = screen.getByRole('table', { name: /visits per day/i })

      expect(within(table).getByRole('row', { name: /Wednesday/ })).toBeTruthy()
      expect(within(table).getByRole('row', { name: /Sunday/ })).toBeTruthy()
    })
  })
})

describe('the invoice filter', () => {
  const rowCount = () => screen.getAllByRole('row').length - 2 // header and total

  it('starts on everything', () => {
    render(<InvoicesPage />)

    expect(rowCount()).toBe(6)
    expect(shown('11.610 €')).toBeTruthy()
  })

  /**
   * The total is summed from the rows on screen, so filtering to Overdue has
   * to produce the same figure the Overview's overdue card shows. If these two
   * ever disagree, one of them is lying about his money.
   */
  it('narrows the rows and takes the total with it', () => {
    render(<InvoicesPage />)

    fireEvent.click(screen.getByRole('tab', { name: 'Overdue 3' }))

    expect(rowCount()).toBe(sampleFigures.overdueCount)
    expect(shown('2.180 €')).toBeTruthy()
  })

  it('shows only what has been paid, and that matches the revenue card', () => {
    render(<InvoicesPage />)

    fireEvent.click(screen.getByRole('tab', { name: 'Paid 2' }))

    expect(rowCount()).toBe(2)
    expect(shown('8.450 €')).toBeTruthy()
  })

  it('marks the chosen filter for anything that cannot see the fill', () => {
    render(<InvoicesPage />)

    const overdue = screen.getByRole('tab', { name: 'Overdue 3' })
    fireEvent.click(overdue)

    expect(overdue.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'All 6' }).getAttribute('aria-selected')).toBe('false')
  })
})

describe('the mailbox', () => {
  it('opens on the first message', () => {
    render(<InboxPage />)

    expect(
      screen.getByRole('heading', { name: 'Re: Workshop dates in October' }),
    ).toBeTruthy()
  })

  it('swaps the reading pane when another message is chosen', () => {
    render(<InboxPage />)

    fireEvent.click(screen.getByRole('button', { name: /Jonas Weiß/ }))

    expect(
      screen.getByRole('heading', { name: 'Anfrage über das Kontaktformular' }),
    ).toBeTruthy()
    // A phrase from the body only. The opening line also appears as the
    // preview in the list beside it, so matching that would pass without the
    // reading pane having changed at all.
    expect(screen.getByText(/einen richtigen Shop/)).toBeTruthy()
  })

  /**
   * Sending, attachments and folders need the mailbox specification before
   * they can exist. Until then the controls are visibly dead rather than
   * quietly broken.
   */
  it('leaves every control that would need a real mailbox disabled', () => {
    render(<InboxPage />)

    for (const name of ['Reply', 'Send', 'Attach a file']) {
      expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(true)
    }
  })
})

/**
 * The dashboard stylesheet lives in Tailwind's `components` layer, so a utility
 * written beside one of its classes wins. That is the right relationship almost
 * everywhere — it is what lets `p-0` shrink a `.dash-btn` — but it is fatal for
 * a class whose whole job is to look different in a second state, because the
 * override in the stylesheet never arrives.
 *
 * It shipped twice. The Inbox count stayed lit in the collapsed rail and pulled
 * the row's padding out past the 72px edge, and the blue bar marking the active
 * section was transparent on every screen, because `flex` and `bg-transparent`
 * sat in the markup beside the rules meant to change them.
 *
 * jsdom will not resolve layered CSS, so this cannot be checked by computing a
 * style. What it checks instead is the thing that actually went wrong: whether
 * the markup still hands those properties to a utility.
 */
describe('nothing in the sidebar overrides a rule that has two states', () => {
  const OWNED: { klass: string; exact: string[]; prefixes: string[]; why: string }[] = [
    {
      klass: 'dash-nav-row',
      exact: ['flex'],
      prefixes: ['gap-', 'p-', 'px-', 'py-', 'pl-', 'pr-', 'pt-', 'pb-', 'h-', 'items-', 'justify-'],
      why: "the collapsed rail takes away this row's padding, gap and alignment",
    },
    {
      klass: 'dash-nav-edge',
      exact: [],
      prefixes: ['bg-', 'w-', 'h-'],
      why: 'this bar turns blue when its section is the page you are on',
    },
    {
      klass: 'dash-nav-badge',
      exact: ['flex', 'hidden', 'block', 'inline-flex'],
      prefixes: [],
      why: 'the collapsed rail hides this count',
    },
  ]

  it.each(OWNED)('leaves $klass alone, because $why', ({ klass, exact, prefixes }) => {
    render(<DashboardSidebar />)

    const nodes = document.querySelectorAll(`.${klass}`)
    expect(nodes.length).toBeGreaterThan(0)

    for (const node of nodes) {
      const offenders = [...node.classList].filter(
        (name) =>
          name !== klass &&
          (exact.includes(name) || prefixes.some((prefix) => name.startsWith(prefix))),
      )

      expect(offenders).toEqual([])
    }
  })
})
