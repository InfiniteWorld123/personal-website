// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouteError, isChunkLoadError } from '#/frontend/components/feedback/RouteError'

/**
 * The admin was shown "Something went wrong!" over an empty page because one
 * request for a route's JavaScript came back 503. The file was there, and the
 * next request got it. What these tests hold is that such a failure costs a
 * reload rather than a dead end — and that a failure which survives the reload
 * stops asking for another one, so nobody is left in a refresh loop.
 */

const reload = vi.fn()

const renderFor = (message: string) =>
  render(<RouteError error={new Error(message)} info={{ componentStack: '' }} reset={() => {}} />)

beforeEach(() => {
  sessionStorage.clear()
  reload.mockClear()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  })
})

afterEach(cleanup)

describe('recognising a lost route chunk', () => {
  it('knows each browser wording, and leaves other errors alone', () => {
    expect(
      isChunkLoadError(
        new Error('Failed to fetch dynamically imported module: https://x.de/assets/admin-a.js'),
      ),
    ).toBe(true)
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true)
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true)

    expect(isChunkLoadError(new Error('Booking type not found'))).toBe(false)
    expect(isChunkLoadError('Failed to fetch')).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })
})

describe('what the visitor gets', () => {
  const lost = 'Failed to fetch dynamically imported module: https://x.de/assets/admin-a.js'

  it('reloads once for a lost chunk, and draws nothing while it does', () => {
    const { container } = renderFor(lost)

    expect(reload).toHaveBeenCalledTimes(1)
    expect(container.innerHTML).toBe('')
  })

  it('shows the error instead of reloading when the same chunk fails again', () => {
    renderFor(lost)
    cleanup()
    renderFor(lost)

    expect(reload).toHaveBeenCalledTimes(1)
    expect(screen.getByText(lost)).toBeTruthy()
  })

  it('still gives a different chunk its own attempt', () => {
    renderFor(lost)
    cleanup()
    renderFor('Failed to fetch dynamically imported module: https://x.de/assets/inbox-b.js')

    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('stops reloading once a session has spent its attempts', () => {
    for (const name of ['a', 'b', 'c', 'd']) {
      renderFor(`Failed to fetch dynamically imported module: https://x.de/assets/${name}.js`)
      cleanup()
    }

    expect(reload).toHaveBeenCalledTimes(3)
  })

  it('reports an ordinary route failure rather than reloading on it', () => {
    renderFor('Booking type not found')

    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByText('Booking type not found')).toBeTruthy()
  })

  it('shows the error when there is nowhere to record the attempt', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage is blocked')
    })

    renderFor(lost)

    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByText(lost)).toBeTruthy()
  })
})
