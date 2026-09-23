import type { InboxLanguage } from '#/backend2/contracts/inbox.contract'

/** Small shared words and formats for the Inbox screens. */

export const LANGUAGE_WORDS: Record<InboxLanguage, string> = { de: 'German', en: 'English', ar: 'Arabic' }

export const fileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Today: the time. This year: day and month. Older: the date. */
export const listTime = (iso: string, now: Date = new Date()): string => {
  const date = new Date(iso)
  const sameDay = date.toDateString() === now.toDateString()

  if (sameDay) return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const fullTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export const fileBadge = (contentType: string, fileName: string): string => {
  const extension = fileName.includes('.') ? fileName.split('.').pop()!.toUpperCase() : ''

  if (contentType === 'application/pdf') return 'PDF'
  if (contentType.startsWith('image/')) return extension || 'IMG'
  if (contentType.startsWith('video/')) return extension || 'VID'

  return (extension || 'FILE').slice(0, 4)
}

/** Reads and writes a local copy of unsaved draft text. Any failure is ignored. */
export const localDraft = {
  key: (id: string) => `inbox-v2-draft:${id}`,
  read: <T,>(id: string): (T & { at: number }) | null => {
    try {
      const raw = window.localStorage.getItem(localDraft.key(id))

      return raw ? (JSON.parse(raw) as T & { at: number }) : null
    } catch {
      return null
    }
  },
  write: (id: string, value: unknown) => {
    try {
      window.localStorage.setItem(localDraft.key(id), JSON.stringify({ ...(value as object), at: Date.now() }))
    } catch {
      // Private window or storage full: the server copy is still the real one.
    }
  },
  clear: (id: string) => {
    try {
      window.localStorage.removeItem(localDraft.key(id))
    } catch {
      // Nothing to do.
    }
  },
}
