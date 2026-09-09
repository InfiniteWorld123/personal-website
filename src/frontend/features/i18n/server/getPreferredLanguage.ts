import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import {
  LANGUAGE_COOKIE,
  type Language,
  defaultLanguage,
  isLanguage,
  languageFromAcceptLanguage,
  languageFromCountry,
} from '#/frontend/i18n/language'

const readCookie = (header: string | null, name: string) => {
  if (!header) return null

  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }

  return null
}

/** Country of the request, as the edge reports it. */
const countryOf = (headers: Headers) =>
  headers.get('x-vercel-ip-country') ?? headers.get('cf-ipcountry')

/**
 * Where `/` should send a visitor, most reliable signal first: the language
 * they chose last time, then a language their browser actually asked for,
 * then a guess from their country. A visitor from outside the German- and
 * Arabic-speaking world gets English; German remains the fallback when the
 * request tells us nothing at all.
 */
export const getPreferredLanguage = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Language> => {
    const { headers } = getRequest()
    const remembered = readCookie(headers.get('cookie'), LANGUAGE_COOKIE)

    if (isLanguage(remembered)) return remembered

    const requested = languageFromAcceptLanguage(headers.get('accept-language'))
    if (requested) return requested

    const country = countryOf(headers)
    const local = languageFromCountry(country)
    if (local) return local

    return country ? 'en' : defaultLanguage
  },
)
