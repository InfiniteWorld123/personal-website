import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  THEME_STORAGE_KEY,
  type ThemePreference,
  defaultThemePreference,
  isThemePreference,
} from './theme'

type ThemeContextValue = {
  preference: ThemePreference
  resolvedTheme: 'light' | 'dark'
  setPreference: (preference: ThemePreference) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const systemPrefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

const resolve = (preference: ThemePreference): 'light' | 'dark' =>
  preference === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : preference

const readStoredPreference = (): ThemePreference => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : defaultThemePreference
  } catch {
    return defaultThemePreference
  }
}

/**
 * Single source of truth for the theme. The `.dark` class is applied on first
 * paint by the inline script in `__root.tsx`, which reads the same storage key,
 * so there is no flash of the wrong theme. This provider keeps React in sync
 * and owns changes after hydration.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(defaultThemePreference)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  const apply = useCallback((next: ThemePreference, animate = false) => {
    const resolved = resolve(next)
    const root = document.documentElement

    const commit = () => {
      root.classList.toggle('dark', resolved === 'dark')
      root.dataset.themePreference = next
    }

    // Cross-fade the whole page between themes instead of snapping. The View
    // Transitions API does it in one frame capture; browsers without it, and
    // visitors who prefer reduced motion, switch instantly.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const canAnimate =
      animate && !reduced && !document.hidden && typeof document.startViewTransition === 'function'

    if (canAnimate) {
      root.classList.add('theme-switching')
      const transition = document.startViewTransition(commit)
      const done = () => root.classList.remove('theme-switching')
      // Every promise on the transition rejects when the browser skips it
      // (hidden tab, a second switch mid-fade, unsupported embedding). The
      // theme is applied either way, so none of those rejections matter.
      const ignore = () => undefined
      transition.ready.catch(ignore)
      transition.updateCallbackDone.catch(ignore)
      transition.finished.then(done, done)
    } else {
      commit()
    }

    setResolvedTheme(resolved)
  }, [])

  useEffect(() => {
    const stored = readStoredPreference()
    setPreferenceState(stored)
    apply(stored)
  }, [apply])

  useEffect(() => {
    if (preference !== 'system') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('system')

    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [preference, apply])

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next)
      apply(next, true)

      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next)
      } catch {
        // Preference is not persisted; the session still works.
      }
    },
    [apply],
  )

  const toggle = useCallback(() => {
    setPreference(resolvedTheme === 'dark' ? 'light' : 'dark')
  }, [resolvedTheme, setPreference])

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) throw new Error('useTheme must be used inside ThemeProvider')

  return context
}
