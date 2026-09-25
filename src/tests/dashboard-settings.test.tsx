// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    activeOptions: _activeOptions,
    activeProps: _activeProps,
    ...rest
  }: {
    to: string
    search?: Record<string, unknown>
    children: ReactNode
    activeOptions?: unknown
    activeProps?: unknown
  }) => (
    <a href={search && Object.keys(search).length ? `${to}?${new URLSearchParams(search as Record<string, string>)}` : to} {...rest}>
      {children}
    </a>
  ),
  Outlet: () => <div data-testid="settings-outlet" />,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: '/dashboard/settings' } }),
}))

/** jsdom has no `matchMedia`, and the theme provider asks it what the system wants. */
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  })) as typeof window.matchMedia

  window.localStorage.clear()
})

const { ThemeProvider } = await import('#/frontend/components/theme/theme-provider')
const {
  DashboardPreferencesProvider,
  useDashboardPreferences,
  defaultSurface,
  dashboardSurfaces,
  defaultNavShape,
  dashboardNavShapes,
} = await import('#/frontend/dashboard/preferences')
const { SettingsPage } = await import('#/frontend/pages/dashboard/settings/SettingsPage')
const { SettingsLayout } = await import('#/frontend/pages/dashboard/settings/SettingsLayout')

afterEach(cleanup)

const open = () =>
  render(
    <ThemeProvider>
      <DashboardPreferencesProvider>
        <SettingsPage />
      </DashboardPreferencesProvider>
    </ThemeProvider>,
  )

const surfaceRadio = (label: string) => screen.getByRole('radio', { name: new RegExp(label) })

const radiosOf = (name: string) =>
  [...document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)]

describe('choosing how the surface is built', () => {
  it('opens on the flat surface', () => {
    open()

    expect(defaultSurface).toBe('flat')
    expect((surfaceRadio('Flat') as HTMLInputElement).checked).toBe(true)
    expect((surfaceRadio('Floating') as HTMLInputElement).checked).toBe(false)
  })

  it.each([
    ['Floating', 'floating'],
    ['Framed', 'framed'],
    ['Detached', 'detached'],
  ])('switches to %s and remembers it', (label, stored) => {
    open()

    fireEvent.click(surfaceRadio(label))

    expect((surfaceRadio(label) as HTMLInputElement).checked).toBe(true)
    expect(window.localStorage.getItem('dashboard-surface')).toBe(stored)
  })

  it.each([
    ['floating', 'Floating'],
    ['framed', 'Framed'],
    ['detached', 'Detached'],
  ])('opens on the stored %s choice the next time', (stored, label) => {
    window.localStorage.setItem('dashboard-surface', stored)
    open()

    expect((surfaceRadio(label) as HTMLInputElement).checked).toBe(true)
  })

  /** Only one can be on, and exactly one always is. */
  it('offers every surface and keeps exactly one chosen', () => {
    open()

    const radios = radiosOf('dashboard-surface')

    expect(radios).toHaveLength(dashboardSurfaces.length)
    expect(radios.filter((radio) => radio.checked)).toHaveLength(1)
  })

  /**
   * Storage is shared with anything else on the origin and survives every
   * deploy, so a value the dashboard no longer understands has to fall back
   * rather than put an unknown word into `data-surface` and render untokened.
   */
  it('falls back when the stored value is not a surface it knows', () => {
    window.localStorage.setItem('dashboard-surface', 'glass')
    open()

    expect((surfaceRadio('Flat') as HTMLInputElement).checked).toBe(true)
  })

  /** A name and a guess is not a choice — each option draws what it will do. */
  it('draws a preview of each surface, in that surface', () => {
    const { container } = open()
    const previews = container.querySelectorAll('[data-surface]')

    expect([...previews].map((node) => node.getAttribute('data-surface'))).toEqual([
      ...dashboardSurfaces,
    ])
  })
})

describe('choosing the theme', () => {
  it('offers light, dark and the system setting', () => {
    open()

    for (const label of ['Light', 'Dark', 'System']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('marks the chosen one for anything that cannot see the fill', () => {
    open()

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))

    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Light' }).getAttribute('aria-pressed')).toBe('false')
  })
})

describe('the rest of the settings screen', () => {
  /**
   * The greyed "not designed yet" list is gone: every module's settings now
   * exist inside that module, and Settings links straight to each of them.
   */
  it('links to the settings each section keeps for itself', () => {
    render(
      <ThemeProvider>
        <DashboardPreferencesProvider>
          <SettingsLayout />
        </DashboardPreferencesProvider>
      </ThemeProvider>,
    )

    expect(screen.queryByText('NOT DESIGNED YET')).toBeNull()
    expect(screen.getByText('IN EACH SECTION')).toBeTruthy()

    const href = (name: RegExp) => screen.getByRole('link', { name }).getAttribute('href')

    expect(href(/Appearance/)).toBe('/dashboard/settings')
    expect(href(/Security/)).toBe('/dashboard/settings/security')
    expect(href(/Inbox/)).toBe('/dashboard/inbox?settings=true')
    expect(href(/Invoices/)).toBe('/dashboard/invoices/settings')
    expect(href(/Calendar/)).toBe('/dashboard/calendar?tab=hours')
    expect(href(/Assistant/)).toBe('/dashboard/assistant/settings')
  })

  it('opens on Appearance and keeps it a section of its own', () => {
    open()

    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeTruthy()
    // The page head belongs to the shell now, not to this section.
    expect(screen.queryByText('SETTINGS')).toBeNull()
  })
})

describe('the preferences themselves', () => {
  function Probe() {
    const { surface, rail, toggleRail } = useDashboardPreferences()

    return (
      <button type="button" onClick={toggleRail}>
        {surface}/{String(rail)}
      </button>
    )
  }

  it('remembers a collapsed sidebar across visits', () => {
    const first = render(
      <DashboardPreferencesProvider>
        <Probe />
      </DashboardPreferencesProvider>,
    )

    expect(screen.getByRole('button').textContent).toBe('flat/false')
    fireEvent.click(screen.getByRole('button'))
    expect(window.localStorage.getItem('dashboard-rail')).toBe('true')

    first.unmount()
    render(
      <DashboardPreferencesProvider>
        <Probe />
      </DashboardPreferencesProvider>,
    )

    expect(screen.getByRole('button').textContent).toBe('flat/true')
  })

  it('refuses to be used outside the dashboard shell', () => {
    // React logs the thrown error; the test is that it throws at all.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<Probe />)).toThrow(/inside the dashboard shell/)

    quiet.mockRestore()
  })
})

describe('choosing how the open section is marked', () => {
  const navRadio = (label: string) =>
    screen.getByRole('radio', { name: new RegExp(label) }) as HTMLInputElement

  it('opens on the edge bar', () => {
    open()

    expect(defaultNavShape).toBe('bar')
    expect(navRadio('Edge bar').checked).toBe(true)
  })

  it('switches to the filled pill and remembers it', () => {
    open()

    fireEvent.click(navRadio('Filled pill'))

    expect(navRadio('Filled pill').checked).toBe(true)
    expect(window.localStorage.getItem('dashboard-nav-shape')).toBe('pill')
  })

  it('opens on the stored choice the next time', () => {
    window.localStorage.setItem('dashboard-nav-shape', 'pill')
    open()

    expect(navRadio('Filled pill').checked).toBe(true)
  })

  it('falls back when the stored value is not a shape it knows', () => {
    window.localStorage.setItem('dashboard-nav-shape', 'underline')
    open()

    expect(navRadio('Edge bar').checked).toBe(true)
  })

  it('offers both and keeps exactly one chosen', () => {
    open()

    const radios = radiosOf('dashboard-nav-shape')

    expect(radios).toHaveLength(dashboardNavShapes.length)
    expect(radios.filter((radio) => radio.checked)).toHaveLength(1)
  })

  /** The surface and the marker are separate choices and must not collide. */
  it('keeps the two appearance choices independent', () => {
    open()

    fireEvent.click(navRadio('Filled pill'))
    fireEvent.click(surfaceRadio('Framed'))

    expect(navRadio('Filled pill').checked).toBe(true)
    expect(window.localStorage.getItem('dashboard-surface')).toBe('framed')
    expect(window.localStorage.getItem('dashboard-nav-shape')).toBe('pill')
  })
})
