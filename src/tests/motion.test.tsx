// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MotionProvider } from '#/frontend/motion/motion-provider'

const mocks = vi.hoisted(() => ({
  created: vi.fn(), destroy: vi.fn(), on: vi.fn(), off: vi.fn(),
  tickerAdd: vi.fn(), tickerRemove: vi.fn(), refresh: vi.fn(),
}))
vi.mock('lenis', () => ({
  default: class {
    constructor() { mocks.created() }
    on = mocks.on
    off = mocks.off
    destroy = mocks.destroy
    raf() {}
  },
}))
vi.mock('#/frontend/motion/motion', () => ({
  registerMotionPlugins: vi.fn(),
  gsap: { ticker: { add: mocks.tickerAdd, remove: mocks.tickerRemove } },
  ScrollTrigger: { update: vi.fn(), refresh: mocks.refresh },
}))

let reduced = true
let desktop = true
const listeners = new Map<string, Set<() => void>>()
const reduceQuery = '(prefers-reduced-motion: reduce)'
function emit(query: string) { act(() => listeners.get(query)?.forEach(fn => fn())) }

beforeEach(() => {
  vi.clearAllMocks()
  reduced = true
  desktop = true
  listeners.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() { return query === reduceQuery ? reduced : desktop },
    addEventListener: (_: string, fn: () => void) => {
      if (!listeners.has(query)) listeners.set(query, new Set())
      listeners.get(query)!.add(fn)
    },
    removeEventListener: (_: string, fn: () => void) => listeners.get(query)?.delete(fn),
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('motion eligibility and cleanup', () => {
  it('leaves reduced-motion visitors on native scrolling', () => {
    render(<MotionProvider smoothScroll><p>Complete content</p></MotionProvider>)
    expect(mocks.created).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Complete content')
  })
  it('does not smooth-scroll touch/mobile or non-home pages', () => {
    reduced = false
    desktop = false
    const { rerender } = render(<MotionProvider smoothScroll><p>Content</p></MotionProvider>)
    expect(mocks.created).not.toHaveBeenCalled()
    desktop = true
    rerender(<MotionProvider smoothScroll={false}><p>Content</p></MotionProvider>)
    expect(mocks.created).not.toHaveBeenCalled()
  })
  it('destroys Lenis and removes ticker listeners when leaving Home', () => {
    reduced = false
    const { rerender, unmount } = render(<MotionProvider smoothScroll><p>Home</p></MotionProvider>)
    expect(mocks.created).toHaveBeenCalledOnce()
    rerender(<MotionProvider smoothScroll={false}><p>Work</p></MotionProvider>)
    expect(mocks.destroy).toHaveBeenCalledOnce()
    expect(mocks.tickerRemove).toHaveBeenCalledWith(mocks.tickerAdd.mock.calls[0][0])
    unmount()
    expect([...listeners.values()].every(set => set.size === 0)).toBe(true)
  })
  it('responds to reduced motion and resizing after startup', () => {
    reduced = false
    render(<MotionProvider smoothScroll><p>Home</p></MotionProvider>)
    reduced = true
    emit(reduceQuery)
    expect(mocks.destroy).toHaveBeenCalledOnce()
    reduced = false
    emit(reduceQuery)
    expect(mocks.created).toHaveBeenCalledTimes(2)
    desktop = false
    emit('(min-width: 1024px) and (pointer: fine)')
    expect(mocks.destroy).toHaveBeenCalledTimes(2)
  })
})
