// @vitest-environment jsdom
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LanguageProvider, useLanguage } from '#/frontend/i18n/language-provider'

/**
 * Switching the language keeps the rest of the address. A private booking
 * link carries its credential in the fragment (`…/manage/REF#credential`);
 * dropping it on a language switch locked the visitor out, and the switch
 * replaces the history entry, so Back could not bring it back either.
 */

function Switcher() {
  const { language, setLanguage } = useLanguage()

  return (
    <button type="button" onClick={() => setLanguage('de')}>
      {language}
    </button>
  )
}

const start = async (href: string) => {
  const root = createRootRoute({
    component: () => (
      <LanguageProvider>
        <Switcher />
        <Outlet />
      </LanguageProvider>
    ),
  })
  const routes = [
    createRoute({ getParentRoute: () => root, path: '$lang/booking/manage/$reference', component: () => null }),
    createRoute({ getParentRoute: () => root, path: '$lang/booking/room/$reference', component: () => null }),
    createRoute({ getParentRoute: () => root, path: '$lang/booking/$slug', component: () => null }),
  ]
  const router = createRouter({ routeTree: root.addChildren(routes), history: createMemoryHistory({ initialEntries: [href] }) })

  await act(async () => {
    render(<RouterProvider router={router} />)
  })
  await screen.findByRole('button', { name: 'en' })

  return router
}

// jsdom has no scrolling; the router restores the scroll position on every navigation.
beforeEach(() => {
  window.scrollTo = () => {}
})

afterEach(() => cleanup())

describe('switching the language', () => {
  it('keeps the private credential of the manage link', async () => {
    const router = await start('/en/booking/manage/YW-7K3QM9PX#secret-credential')

    fireEvent.click(screen.getByRole('button', { name: 'en' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/de/booking/manage/YW-7K3QM9PX'))
    expect(router.state.location.hash).toBe('secret-credential')
    expect(await screen.findByRole('button', { name: 'de' })).toBeTruthy()
  })

  it('keeps the private credential of the video room link', async () => {
    const router = await start('/en/booking/room/YW-7K3QM9PX#secret-credential')

    fireEvent.click(screen.getByRole('button', { name: 'en' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/de/booking/room/YW-7K3QM9PX'))
    expect(router.state.location.hash).toBe('secret-credential')
  })

  it('keeps the query too', async () => {
    const router = await start('/en/booking/intro?slot=2026-10-07T08%3A00%3A00.000Z')

    fireEvent.click(screen.getByRole('button', { name: 'en' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/de/booking/intro'))
    expect(router.state.location.search).toEqual({ slot: '2026-10-07T08:00:00.000Z' })
  })
})
