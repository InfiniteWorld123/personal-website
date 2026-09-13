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

    expect(await screen.findByText('يرجى إكمال فحص الأمان.')).toBeTruthy()
    expect(container.firstElementChild?.getAttribute('dir')).toBe('rtl')

    act(() => (options?.callback as (token: string) => void)('verified-token'))
    expect(screen.getByText('اكتمل فحص الأمان.')).toBeTruthy()
    expect(onTokenChange).toHaveBeenLastCalledWith('verified-token')

    act(() => (options?.['expired-callback'] as () => void)())
    expect(screen.getByText('انتهت صلاحية فحص الأمان.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeTruthy()

    act(() => (options?.['error-callback'] as () => void)())
    expect(screen.getByText('تم حظر فحص الأمان أو تعذّر تحميله.')).toBeTruthy()
  })

  it('discards a failed script and can load a fresh one on retry', async () => {
    render(
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
    act(() => freshScript?.dispatchEvent(new Event('load')))
    expect(await screen.findByText('Please complete the security check.')).toBeTruthy()
  })

  it('keeps verified when a cached widget responds during render', async () => {
    window.turnstile = {
      render: (_container, options) => {
        options.callback('instant-token')
        return 'widget-3'
      },
      remove: vi.fn(),
      reset: vi.fn(),
    }

    render(
      <TurnstileWidget
        action="admin_login"
        language="de"
        resetKey={0}
        onTokenChange={vi.fn()}
      />,
    )

    expect(await screen.findByText('Sicherheitsprüfung abgeschlossen.')).toBeTruthy()
  })
})
