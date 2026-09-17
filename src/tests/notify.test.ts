// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  dismissNotice,
  getNotices,
  messageFromError,
  notify,
  subscribeToNotices,
} from '#/frontend/lib/notify'

/**
 * The store behind the admin's toasts. It exists because every write in the
 * admin used to fail silently, so the one thing these tests protect is that
 * a failure always produces exactly one visible notice.
 */

const drain = () => {
  for (const notice of getNotices()) dismissNotice(notice.id)
}

afterEach(() => {
  drain()
  vi.restoreAllMocks()
})

describe('the notice store', () => {
  it('tells its subscribers what to show', () => {
    const seen: string[][] = []
    const stop = subscribeToNotices((notices) => seen.push(notices.map((n) => n.message)))

    notify.error('The reply could not be sent')

    expect(seen.at(-1)).toEqual(['The reply could not be sent'])
    stop()
  })

  it('stops telling a subscriber that has gone', () => {
    let calls = 0
    const stop = subscribeToNotices(() => (calls += 1))
    stop()

    notify.error('Nobody is listening')

    expect(calls).toBe(0)
  })

  /** A refetch can raise the same complaint repeatedly; it is one complaint. */
  it('does not repeat the complaint it just made', () => {
    notify.error('Pick why this one was lost')
    notify.error('Pick why this one was lost')

    expect(getNotices()).toHaveLength(1)
  })

  it('says the same thing again once something else has happened', () => {
    notify.error('Same')
    notify.success('Different')
    notify.error('Same')

    expect(getNotices().map((n) => n.message)).toEqual(['Same', 'Different', 'Same'])
  })

  /** A column of toasts hides the page it is complaining about. */
  it('keeps only the last three', () => {
    for (const message of ['one', 'two', 'three', 'four']) notify.error(message)

    expect(getNotices().map((n) => n.message)).toEqual(['two', 'three', 'four'])
  })

  it('ignores a blank message rather than flashing an empty box', () => {
    notify.error('   ')

    expect(getNotices()).toHaveLength(0)
  })

  it('dismisses one without touching the others', () => {
    notify.error('first')
    notify.error('second')
    dismissNotice(getNotices()[0].id)

    expect(getNotices().map((n) => n.message)).toEqual(['second'])
  })
})

describe('what it says about a failure', () => {
  /**
   * `ApiRequestError` carries the sentence the central error flow chose, and
   * repeating it beats inventing a friendlier one that says less.
   */
  it('repeats the message the server sent', () => {
    expect(messageFromError(new Error('Pick why this one was lost'))).toBe(
      'Pick why this one was lost',
    )
  })

  it('falls back to a sentence when there is nothing to repeat', () => {
    expect(messageFromError(new Error('  '))).toMatch(/not saved/i)
    expect(messageFromError(undefined)).toMatch(/not saved/i)
  })
})
