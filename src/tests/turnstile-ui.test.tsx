// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TurnstileWidget } from '#/frontend/features/security/TurnstileWidget'

afterEach(() => {
  cleanup()
  delete window.turnstile
  document.getElementById('cloudflare-turnstile-script')?.remove()
  vi.restoreAllMocks()
})

/**
 * A check that passes says nothing: no status line, no reserved height. The
 * widget only speaks when the visitor has to act, which is why the passing
 * states are asserted through the token callback rather than through text.
 */
describe('Turnstile UI states', () => {
  it('covers ready, verified, expired, error, retry, and Arabic direction', async () => {
    let options: Record<string, unknown> | undefined
    const remove = vi.fn()
    const onTokenChange = vi.fn()

    window.turnstile = {
      render: (_container, nextOptions) => {
        options = nextOptions
        return 'widget-1'
      },
      remove,
      reset: vi.fn(),
    }

    const { container } = render(
      <TurnstileWidget
        action="booking_create"
        language="ar"
        resetKey={0}
        onTokenChange={onTokenChange}
      />,
    )

    await act(async () => {})
    expect(options?.sitekey).toBeTruthy()
    expect(container.firstElementChild?.getAttribute('dir')).toBe('rtl')
    // Waiting and ready are silent: nothing to read, nothing to do.
    expect(container.textContent).toBe('')

    act(() => (options?.callback as (token: string) => void)('verified-token'))
    expect(onTokenChange).toHaveBeenLastCalledWith('verified-token')
    expect(container.textContent).toBe('')

    act(() => (options?.['expired-callback'] as () => void)())
    expect(screen.getByText('انتهت صلاحية فحص الأمان.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeTruthy()
    expect(onTokenChange).toHaveBeenLastCalledWith(null)

    act(() => (options?.['error-callback'] as () => void)())
    expect(screen.getByText('تم حظر فحص الأمان أو تعذّر تحميله.')).toBeTruthy()
  })

  it('discards a failed script and can load a fresh one on retry', async () => {
    const { container } = render(
      <TurnstileWidget
        action="contact_submit"
        language="en"
        resetKey={0}
        onTokenChange={vi.fn()}
      />,
    )

    const failedScript = document.getElementById('cloudflare-turnstile-script')
    expect(failedScript).toBeTruthy()
    act(() => failedScript?.dispatchEvent(new Event('error')))
    expect(await screen.findByText('The security check was blocked or could not load.')).toBeTruthy()
    expect(document.getElementById('cloudflare-turnstile-script')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    const freshScript = document.getElementById('cloudflare-turnstile-script')
    expect(freshScript).toBeTruthy()
    expect(freshScript).not.toBe(failedScript)

    window.turnstile = {
      render: () => 'widget-2',
      remove: vi.fn(),
      reset: vi.fn(),
    }
    await act(async () => {
      freshScript?.dispatchEvent(new Event('load'))
    })
    // Loaded and waiting for the visitor: the error and its retry are gone.
    expect(container.textContent).toBe('')
  })

  it('keeps verified when a cached widget responds during render', async () => {
    const onTokenChange = vi.fn()

    window.turnstile = {
      render: (_container, options) => {
        options.callback('instant-token')
        return 'widget-3'
      },
      remove: vi.fn(),
      reset: vi.fn(),
    }

    const { container } = render(
      <TurnstileWidget
        action="contact_submit"
        language="de"
        resetKey={0}
        onTokenChange={onTokenChange}
      />,
    )

    await act(async () => {})
    expect(onTokenChange).toHaveBeenLastCalledWith('instant-token')
    expect(container.textContent).toBe('')
  })
})
