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

  const apply = useCallback((next: ThemePreference) => {
    const resolved = resolve(next)
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    document.documentElement.dataset.themePreference = next
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
      apply(next)

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
