import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  LANGUAGE_STORAGE_KEY,
  type Language,
  defaultLanguage,
  directionFor,
  isLanguage,
} from './language'

type LanguageContextValue = {
  language: Language
  direction: 'rtl' | 'ltr'
  isRtl: boolean
  setLanguage: (language: Language) => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

const readStoredLanguage = (): Language => {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    return isLanguage(stored) ? stored : defaultLanguage
  } catch {
    return defaultLanguage
  }
}

/**
 * Single source of truth for language and text direction. The document's
 * `lang` and `dir` are set here so no page component has to manage them.
 *
 * The initial paint is handled by the inline script in `__root.tsx`, which
 * reads the same storage key. This effect only keeps React in sync.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(defaultLanguage)

  useEffect(() => {
    setLanguageState(readStoredLanguage())
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = directionFor(language)
  }, [language])

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next)

    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
    } catch {
      // Preference is not persisted; the session still works.
    }
  }, [])

  const direction = directionFor(language)

  return (
    <LanguageContext.Provider
      value={{ language, direction, isRtl: direction === 'rtl', setLanguage }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)

  if (!context) throw new Error('useLanguage must be used inside LanguageProvider')

  return context
}
