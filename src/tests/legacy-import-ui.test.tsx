// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { ImportPlan, ImportPlanItem } from '#/backend2/contracts/import.contract'

/**
 * Settings → Old site: check first (reads only), then copy, step by step,
 * with every state — waiting, done, a problem, the old site unreachable —
 * said in words. All data here is fictional.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
  Outlet: () => null,
}))

const { OldSitePage } = await import('#/frontend/pages/dashboard/settings/OldSitePage')

const row = (over: Partial<ImportPlanItem>): ImportPlanItem => ({
  kind: 'project',
  key: 'inknest',
  label: 'Inknest',
  action: 'create',
  reason: null,
  lands: 'published',
  needsYou: [],
  images: { total: 2, copied: 0, failed: 0 },
  ...over,
})

const planWith = (items: ImportPlanItem[]): ImportPlan => ({
  items,
  counts: {
    create: items.filter((item) => item.action === 'create').length,
    skip: items.filter((item) => item.action === 'skip').length,
    done: items.filter((item) => item.action === 'done').length,
    failed: items.filter((item) => item.action === 'failed').length,
  },
  images: { toCopy: 2, bytes: 3 * 1024 * 1024, unknownSizes: 0 },
  notes: ['Nothing on the old site changes, and nothing already in V2 is changed or deleted.'],
})

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  document.cookie = 'v2_csrf=token-123'
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const open = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OldSitePage />
    </QueryClientProvider>,
  )

describe('Settings → Old site', () => {
  it('reads nothing until asked, then shows the plan in words', async () => {
    fetchMock.mockResolvedValueOnce(
      ok(
        planWith([
          row({ needsYou: ['Before it can go live: EN: the summary is empty'], lands: 'draft' }),
          row({ kind: 'service', key: 'websites', label: 'Websites', action: 'skip', reason: 'V2 already has a service with the address “websites”. It is kept as it is.', lands: null, images: { total: 0, copied: 0, failed: 0 } }),
        ]),
      ),
    )

    open()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /^Copy/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Check what would be copied' }))

    expect(await screen.findByText(/1 to copy · 1 skipped · 2 pictures, 3.0 MB/)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/v2/owner/import/legacy', expect.objectContaining({ credentials: 'same-origin' }))

    const rows = screen.getAllByRole('listitem').filter((item) => item.querySelector('p.font-semibold'))
    expect(within(rows[0]!).getByText('Copies · private')).toBeTruthy()
    expect(within(rows[0]!).getByText('Before it can go live: EN: the summary is empty')).toBeTruthy()
    expect(within(rows[1]!).getByText('Skipped')).toBeTruthy()
    expect(screen.getByText(/Nothing on the old site changes/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy 1 item' })).toBeTruthy()
  })

  it('copies step by step with the CSRF header, then shows the new state', async () => {
    fetchMock
      .mockResolvedValueOnce(ok(planWith([row({})])))
      .mockResolvedValueOnce(ok({ did: 'Copied the image “home.jpg”', remaining: 2 }))
      .mockResolvedValueOnce(ok({ did: 'Could not copy the image “mobile.jpg”: the old site answered 404 for it', remaining: 1 }))
      .mockResolvedValueOnce(ok({ did: 'Copied the project “Inknest”', remaining: 0 }))
      .mockResolvedValueOnce(ok(planWith([row({ action: 'done', reason: 'Copied on an earlier run.', lands: null })])))

    open()
    fireEvent.click(screen.getByRole('button', { name: 'Check what would be copied' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Copy 1 item' }))

    expect(await screen.findByText('Done. 3 steps finished, 1 with a problem listed below.')).toBeTruthy()
    expect(screen.getByText(/mobile.jpg/)).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100')

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts).toHaveLength(3)
    for (const [, init] of posts) {
      expect(new Headers(init.headers).get('x-v2-csrf')).toBe('token-123')
      expect(init.body).toBe(JSON.stringify({ confirm: true }))
    }

    await waitFor(() => expect(screen.getByText('Already copied')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Nothing left to copy' }).hasAttribute('disabled')).toBe(true)
  })

  it('explains an unreachable old site instead of a bare error', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, code: 'PROVIDER_UNAVAILABLE', message: 'An unexpected error occurred' }), { status: 503 }),
    )

    open()
    fireEvent.click(screen.getByRole('button', { name: 'Check what would be copied' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('The old site’s database cannot be reached from here. Nothing was changed.')
  })

  it('keeps what was copied when a step fails, and says how to carry on', async () => {
    fetchMock
      .mockResolvedValueOnce(ok(planWith([row({})])))
      .mockResolvedValueOnce(ok({ did: 'Copied the image “home.jpg”', remaining: 2 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, code: 'STORAGE_UNAVAILABLE', message: 'x' }), { status: 503 }),
      )
      .mockResolvedValueOnce(ok(planWith([row({ images: { total: 2, copied: 1, failed: 0 } })])))

    open()
    fireEvent.click(screen.getByRole('button', { name: 'Check what would be copied' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Copy 1 item' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Media storage is not available here')
    expect(alert.textContent).toContain('press Copy again to carry on')
  })
})
