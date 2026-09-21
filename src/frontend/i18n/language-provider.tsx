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
 * Routes without a language segment (admin, api) fall back to German.
 */
export function LanguageProvider({
  children,
  language: forced,
  onLanguageChange,
}: {
  children: ReactNode
  /**
   * Set only where a piece of the public site is rendered somewhere the URL
   * does not carry a language — the content editor previews all three from
   * `/admin/content`. A forced language deliberately leaves `<html lang>` and
   * `dir` alone: the admin around the preview stays as it is.
   */
  language?: Language
  onLanguageChange?: (language: Language) => void
}) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const navigate = useNavigate()

  const language = forced ?? documentLanguageFor(pathname)
  const direction = directionFor(language)

  useEffect(() => {
    if (forced) return

    document.documentElement.lang = language
    document.documentElement.dir = direction
  }, [forced, language, direction])

  const setLanguage = useCallback(
    (next: Language) => {
      if (onLanguageChange) {
        onLanguageChange(next)
        return
      }

      rememberLanguage(next)
      void navigate({ to: withLanguage(pathname, next), replace: true })
    },
    [navigate, onLanguageChange, pathname],
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
