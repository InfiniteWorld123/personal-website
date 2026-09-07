import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import {
  LANGUAGE_COOKIE,
  type Language,
  isLanguage,
  languageFromAcceptLanguage,
} from '#/frontend/i18n/language'

const readCookie = (header: string | null, name: string) => {
  if (!header) return null

  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }

  return null
}

/**
 * Where `/` should send a visitor: the language they chose last time, else
 * the best match from the browser's Accept-Language header, else German.
 */
export const getPreferredLanguage = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Language> => {
    const { headers } = getRequest()
    const remembered = readCookie(headers.get('cookie'), LANGUAGE_COOKIE)

    if (isLanguage(remembered)) return remembered

    return languageFromAcceptLanguage(headers.get('accept-language'))
  },
)
