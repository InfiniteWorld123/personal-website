/**
 * The last few searches, kept in this browser only (`docs/v2/search.md`).
 *
 * A search is remembered when it led somewhere — a result or "See all" was
 * opened — not on every keystroke. Storage can be missing or refuse (private
 * windows, blocked site data), and then there are simply no recent searches.
 */

export const RECENT_KEY = 'dashboard.search.recent'
export const RECENT_MAX = 5

export const readRecent = (): string[] => {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []

    if (!Array.isArray(parsed)) return []

    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '').slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

/** Puts `term` first, drops an older copy of it, keeps five. Returns the new list. */
export const rememberSearch = (term: string): string[] => {
  const clean = term.trim()

  if (clean === '') return readRecent()

  const next = [clean, ...readRecent().filter((entry) => entry.toLocaleLowerCase() !== clean.toLocaleLowerCase())].slice(
    0,
    RECENT_MAX,
  )

  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Not kept; the search still worked.
  }

  return next
}
