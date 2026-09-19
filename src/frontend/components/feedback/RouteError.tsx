import { ErrorComponent, type ErrorComponentProps } from '@tanstack/react-router'
import { useEffect } from 'react'

/**
 * A route component is a separate JavaScript file, fetched the moment the route
 * is entered. When that fetch fails the route cannot render at all, and the
 * router falls back to its own screen — "Something went wrong!" over an
 * otherwise empty page, with no way forward but the address bar.
 *
 * The fetch fails for reasons that have nothing to do with the code inside the
 * file: a deploy replaced the build while the tab was open and the old hash is
 * gone, or the edge answered one request out of a burst with a 5xx. Both are
 * cured by asking for the page again — the next request gets a file that is
 * there. So that is what this does, instead of reporting a failure the visitor
 * can do nothing about.
 */
const CHUNK_LOAD_MESSAGES = [
  // Chrome, and the wording the admin was shown.
  'failed to fetch dynamically imported module',
  // Firefox.
  'error loading dynamically imported module',
  // Safari.
  'importing a module script failed',
  // Vite's own preload helper, when a dependency of the chunk is what was lost.
  'unable to preload css',
]

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : ''

export const isChunkLoadError = (error: unknown): boolean => {
  const lowered = messageOf(error).toLowerCase()

  return CHUNK_LOAD_MESSAGES.some((known) => lowered.includes(known))
}

/**
 * What already cost a reload, so nothing is reloaded for twice.
 *
 * Keyed by the message — which in Chrome carries the URL of the file that was
 * lost — rather than by a single flag, because a session can lose more than one
 * chunk and each of those is worth its own attempt. The same chunk failing a
 * second time means the reload did not help, and repeating it would leave the
 * visitor in a refresh loop they cannot read their way out of. The cap is the
 * same guard for the case where a broken build loses a different file each
 * time.
 */
const RELOADED_KEY = 'route-error:reloaded'
const RELOAD_LIMIT = 3

const reloadedFor = (): string[] | null => {
  try {
    const stored = sessionStorage.getItem(RELOADED_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)

    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : []
  } catch {
    /*
     * Server rendering has no `sessionStorage` at all, and a private window or
     * blocked site data can throw on access. Without somewhere to record the
     * attempt there is no way to keep the promise of "once", so the answer is
     * `null`: do not reload, show the error.
     */
    return null
  }
}

export function RouteError(props: ErrorComponentProps) {
  const token = messageOf(props.error)
  const already = isChunkLoadError(props.error) ? reloadedFor() : null
  const willReload = already !== null && already.length < RELOAD_LIMIT && !already.includes(token)

  useEffect(() => {
    if (!willReload) return

    try {
      sessionStorage.setItem(RELOADED_KEY, JSON.stringify([...(already ?? []), token]))
    } catch {
      return
    }

    window.location.reload()
  }, [willReload, token, already])

  /*
   * Nothing is drawn while the reload is on its way. A message that lives for a
   * few hundred milliseconds only reads as a flash of broken page; the reload
   * is the answer, and it is already moving.
   */
  if (willReload) return null

  return <ErrorComponent error={props.error} />
}
