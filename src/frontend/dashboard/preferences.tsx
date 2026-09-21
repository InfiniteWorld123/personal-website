import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export const dashboardSurfaces = ['flat', 'floating', 'framed', 'detached'] as const

export type DashboardSurface = (typeof dashboardSurfaces)[number]

export const defaultSurface: DashboardSurface = 'flat'

const isSurface = (value: unknown): value is DashboardSurface =>
  typeof value === 'string' && (dashboardSurfaces as readonly string[]).includes(value)

const SURFACE_KEY = 'dashboard-surface'
const RAIL_KEY = 'dashboard-rail'

type DashboardPreferences = {
  /**
   * How the surface is built: one flat plane, panels lifted off a ground, the
   * whole dashboard as a rounded object on a page, or the rail, the bar and
   * the work area as three separate things with the page between them.
   */
  surface: DashboardSurface
  setSurface: (surface: DashboardSurface) => void
  /** Whether the sidebar is collapsed to a rail. */
  rail: boolean
  toggleRail: () => void
}

const PreferencesContext = createContext<DashboardPreferences | null>(null)

const read = <T,>(key: string, parse: (raw: string | null) => T): T => {
  try {
    return parse(window.localStorage.getItem(key))
  } catch {
    // Private windows and blocked site data both throw here. The dashboard
    // works either way; it just opens on its defaults every time.
    return parse(null)
  }
}

const write = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // The choice holds for this visit and is not remembered.
  }
}

/**
 * The two things about the dashboard the owner sets and the dashboard
 * remembers.
 *
 * Both start at their defaults on the server and on the first client frame, so
 * the markup the server sent matches what React hydrates; the stored values are
 * applied immediately afterwards. Reading storage during render instead would
 * make the server and the browser disagree on the very first paint.
 *
 * This is a local preference, not a setting Backend2 will own. When there is a
 * real account to hang it on, the reads and writes move; nothing else does.
 */
export function DashboardPreferencesProvider({ children }: { children: ReactNode }) {
  const [surface, setSurfaceState] = useState<DashboardSurface>(defaultSurface)
  const [rail, setRail] = useState(false)

  useEffect(() => {
    setSurfaceState(read(SURFACE_KEY, (raw) => (isSurface(raw) ? raw : defaultSurface)))
    setRail(read(RAIL_KEY, (raw) => raw === 'true'))
  }, [])

  const setSurface = useCallback((next: DashboardSurface) => {
    setSurfaceState(next)
    write(SURFACE_KEY, next)
  }, [])

  const toggleRail = useCallback(() => {
    setRail((current) => {
      const next = !current
      write(RAIL_KEY, String(next))

      return next
    })
  }, [])

  return (
    <PreferencesContext.Provider value={{ surface, setSurface, rail, toggleRail }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function useDashboardPreferences() {
  const context = useContext(PreferencesContext)

  if (!context) {
    throw new Error('useDashboardPreferences must be used inside the dashboard shell')
  }

  return context
}
