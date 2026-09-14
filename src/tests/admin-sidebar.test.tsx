// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const pathname = { current: '/admin/inbox' }

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: pathname.current } }),
}))

vi.mock('#/frontend/features/inbox/inbox-queries', () => ({
  inboxSettingsQuery: () => ({ queryKey: ['settings'], queryFn: async () => null }),
  unreadLeadsQuery: () => ({ queryKey: ['unread'], queryFn: async () => ({ unread: 0 }) }),
}))

import { AdminSidebar } from '#/frontend/components/layout/admin/AdminSidebar'

afterEach(() => {
  cleanup()
  pathname.current = '/admin/inbox'
})

const at = (path: string) => {
  pathname.current = path
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <AdminSidebar />
    </QueryClientProvider>,
  )
}

const LENSES = ['Inbox', 'Pipeline', 'Today', 'Calls', 'All leads', 'Settings']

/**
 * The lenses used to close the menu that offered them: a section opened only
 * when the path matched the section's own landing, so walking from the inbox
 * to the board folded the list away and left no way back except the browser's
 * back button.
 */
describe('the leads section stays open across its own lenses', () => {
  for (const path of [
    '/admin/inbox',
    '/admin/leads/pipeline',
    '/admin/leads/today',
    '/admin/leads/calls',
    '/admin/leads/all',
    '/admin/leads/settings',
  ]) {
    it(`shows all six on ${path}`, () => {
      at(path)

      for (const lens of LENSES) expect(screen.getByText(lens)).toBeTruthy()
    })
  }

  it('does not open the section from an unrelated page', () => {
    at('/admin/blog')

    expect(screen.queryByText('Pipeline')).toBeNull()
    expect(screen.queryByText('All leads')).toBeNull()
    // The section itself is always reachable.
    expect(screen.getByText('Leads')).toBeTruthy()
  })

  it('keeps the calendar out of the leads lenses', () => {
    at('/admin/leads/calls')

    expect(screen.getByText('Calendar')).toBeTruthy()
    expect(screen.queryByText('Bookings')).toBeNull()
  })
})
