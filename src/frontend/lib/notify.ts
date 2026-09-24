/**
 * The one place a failure becomes visible.
 *
 * Without it, a write that fails would be silent unless its own screen
 * remembered to say so — and a click that answers 500 while the screen does
 * not move reads as a dead button, not as an error.
 *
 * Deliberately not a React module. `router.tsx` builds the `QueryClient` —
 * on the server as well as in the browser — and needs to hand it a default
 * `onError` for every mutation. A store it can import without pulling React
 * into that path is what makes one line there cover the whole Dashboard.
 */

export type NoticeTone = 'error' | 'success'

export type Notice = {
  id: number
  tone: NoticeTone
  /** The sentence the server sent, or ours when it sent none. */
  message: string
}

type Listener = (notices: Notice[]) => void

/**
 * Three at a time. A failing refetch can raise the same complaint repeatedly,
 * and a column of eleven identical toasts hides the page it is complaining
 * about.
 */
const MAX_VISIBLE = 3

let notices: Notice[] = []
let nextId = 1

const listeners = new Set<Listener>()

const emit = () => {
  for (const listener of listeners) listener(notices)
}

export const subscribeToNotices = (listener: Listener): (() => void) => {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export const getNotices = (): Notice[] => notices

export const dismissNotice = (id: number): void => {
  notices = notices.filter((notice) => notice.id !== id)
  emit()
}

const push = (tone: NoticeTone, message: string): void => {
  // Nothing renders these during a server render, and a module-level array
  // outlives one request there — so the server never collects them at all.
  if (typeof window === 'undefined') return

  const text = message.trim()
  if (text === '') return

  // The same complaint twice in a row is one complaint.
  const last = notices.at(-1)
  if (last && last.tone === tone && last.message === text) return

  notices = [...notices, { id: nextId++, tone, message: text }].slice(-MAX_VISIBLE)
  emit()
}

export const notify = {
  error: (message: string) => push('error', message),
  success: (message: string) => push('success', message),
}

/**
 * What to say about a thrown value. `ApiRequestError` already carries the
 * sentence the central error flow chose, so the common case is to repeat it
 * rather than to invent a friendlier one that says less.
 */
export const messageFromError = (error: unknown): string => {
  if (error instanceof Error && error.message.trim() !== '') return error.message

  return 'Something went wrong, and the change was not saved'
}
