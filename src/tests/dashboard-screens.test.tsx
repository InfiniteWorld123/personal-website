// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * What is left of the dashboard shell once the fixtures are gone.
 *
 * The screens this file used to test — an Overview of invented figures, an
 * invoice filter over invented invoices, a mailbox of invented messages — were
 * deleted along with the data behind them. What remains is the part that was
 * always real: the sidebar's own CSS contract, and the two honest screens that
 * replaced the fixtures.
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

const { DashboardSidebar } = await import('#/frontend/dashboard/DashboardSidebar')
const { OverviewPage } = await import('#/frontend/pages/dashboard/OverviewPage')
const { NotBuiltYet } = await import('#/frontend/pages/dashboard/NotBuiltYet')

afterEach(cleanup)

describe('the Overview', () => {
  it('shows what is built and what is not, and never a figure', () => {
    render(<OverviewPage />)

    expect(screen.getByText('WORKING')).toBeTruthy()
    expect(screen.getByText('Security')).toBeTruthy()
    expect(screen.getByText('NOT BUILT YET')).toBeTruthy()
    expect(screen.getByText('Invoices')).toBeTruthy()

    // The fixtures are gone, and so is every claim they made.
    const text = document.body.textContent ?? ''

    expect(text).not.toMatch(/SAMPLE DATA/i)
    expect(text).not.toMatch(/8\.450|2\.180|1\.284/)
    expect(text).not.toMatch(/€/)
  })
})

describe('a section that is not built', () => {
  it('says so, and says what it is for', () => {
    render(<NotBuiltYet module="inbox" />)

    expect(screen.getByText('Not built yet')).toBeTruthy()
    expect(screen.getByText(/a compact real mailbox/i)).toBeTruthy()
    expect(screen.getByText(/reads or writes anything/i)).toBeTruthy()
  })

  it('carries no toolbar, no rows and no badge', () => {
    render(<NotBuiltYet module="leads" />)

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByText(/SAMPLE DATA/i)).toBeNull()
    expect(screen.queryByText(/NOT SPECIFIED YET/i)).toBeNull()
  })
})

describe('nothing in the sidebar overrides a rule that has two states', () => {
  const OWNED: { klass: string; exact: string[]; prefixes: string[]; why: string }[] = [
    {
      klass: 'dash-nav-row',
      exact: ['flex'],
      prefixes: ['gap-', 'p-', 'px-', 'py-', 'pl-', 'pr-', 'pt-', 'pb-', 'h-', 'items-', 'justify-'],
      why: "the collapsed rail takes away this row's padding, gap and alignment",
    },
    {
      klass: 'dash-side-inner',
      exact: [],
      prefixes: ['w-'],
      why: 'it holds the open width while the rail is still widening',
    },
    {
      klass: 'dash-brand-block',
      exact: [],
      prefixes: ['p-', 'px-', 'pl-', 'pr-', 'justify-'],
      why: 'the collapsed rail drops its padding so the mark can centre itself',
    },
    {
      klass: 'dash-nav-edge',
      exact: [],
      prefixes: ['bg-', 'w-', 'h-'],
      why: 'this bar turns blue when its section is the page you are on',
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
