import { useLocation, useNavigate } from '@tanstack/react-router'
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  LANGUAGE_COOKIE,
  type Language,
  directionFor,
  documentLanguageFor,
  withLanguage,
} from './language'

type LanguageContextValue = {
  language: Language
  direction: 'rtl' | 'ltr'
  isRtl: boolean
  /** Navigates to the same page in another language and remembers the choice. */
  setLanguage: (language: Language) => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

const rememberLanguage = (language: Language) => {
  try {
    document.cookie = `${LANGUAGE_COOKIE}=${language}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax`
  } catch {
    // Cookie blocked; the URL still carries the language.
  }
}

/**
 * The URL is the single source of truth for language: `/de/...`, `/en/...`,
 * `/ar/...`. That makes every page shareable and indexable in each language
 * and lets the server render the right `lang` and `dir` on the first byte.
 *
 * The English-only Dashboard aside, a route without a language segment falls
 * back to German (`documentLanguageFor`).
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const navigate = useNavigate()

  const language = documentLanguageFor(pathname)
  const direction = directionFor(language)

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = direction
  }, [language, direction])

  const setLanguage = useCallback(
    (next: Language) => {
      rememberLanguage(next)
      void navigate({ to: withLanguage(pathname, next), replace: true })
    },
    [navigate, pathname],
  )

  const value = useMemo(
    () => ({ language, direction, isRtl: direction === 'rtl', setLanguage }),
    [language, direction, setLanguage],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)

  if (!context) throw new Error('useLanguage must be used inside LanguageProvider')

  return context
}
