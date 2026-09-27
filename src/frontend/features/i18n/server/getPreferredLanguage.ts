import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { LANGUAGE_COOKIE, type Language, preferredLanguage } from '#/frontend/i18n/language'

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

/** Where `/` should send this request; the rules live in `preferredLanguage`. */
export const getPreferredLanguage = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Language> => {
    const { headers } = getRequest()

    return preferredLanguage({
      remembered: readCookie(headers.get('cookie'), LANGUAGE_COOKIE),
      acceptLanguage: headers.get('accept-language'),
      country: countryOf(headers),
    })
  },
)
