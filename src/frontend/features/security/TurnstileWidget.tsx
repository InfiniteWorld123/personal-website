import { useEffect, useRef, useState } from 'react'
import { Button } from '#/frontend/components/ui/button'
import type { Language } from '#/frontend/i18n/language'
import type { TurnstileAction } from '#/backend/shared/turnstile'

type WidgetState = 'error' | 'expired' | 'loading' | 'ready' | 'verified'

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      action: string
      language: Language
      theme: 'auto'
      size: 'flexible'
      'response-field': false
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ) => string
  remove: (widgetId: string) => void
  reset: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_ID = 'cloudflare-turnstile-script'
const TEST_SITE_KEY = '1x00000000000000000000AA'

const copy = {
  de: {
    loading: 'Sicherheitsprüfung wird geladen…',
    ready: 'Bitte schließen Sie die Sicherheitsprüfung ab.',
    verified: 'Sicherheitsprüfung abgeschlossen.',
    expired: 'Die Sicherheitsprüfung ist abgelaufen.',
    error: 'Die Sicherheitsprüfung wurde blockiert oder konnte nicht geladen werden.',
    retry: 'Erneut versuchen',
  },
  en: {
    loading: 'Loading security check…',
    ready: 'Please complete the security check.',
    verified: 'Security check complete.',
    expired: 'The security check expired.',
    error: 'The security check was blocked or could not load.',
    retry: 'Try again',
  },
  ar: {
    loading: 'جارٍ تحميل فحص الأمان…',
    ready: 'يرجى إكمال فحص الأمان.',
    verified: 'اكتمل فحص الأمان.',
    expired: 'انتهت صلاحية فحص الأمان.',
    error: 'تم حظر فحص الأمان أو تعذّر تحميله.',
    retry: 'إعادة المحاولة',
  },
} as const

const loadTurnstile = (): Promise<TurnstileApi> => {
  if (window.turnstile) return Promise.resolve(window.turnstile)

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    const script = existing ?? document.createElement('script')

    const rejectAndDiscard = (error: Error) => {
      script.remove()
      reject(error)
    }
    const onLoad = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : rejectAndDiscard(new Error('Missing Turnstile API'))
    const onError = () => rejectAndDiscard(new Error('Turnstile script failed'))

    script.addEventListener('load', onLoad, { once: true })
    script.addEventListener('error', onError, { once: true })

    if (!existing) {
      script.id = SCRIPT_ID
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      document.head.append(script)
    }
  })
}

export function TurnstileWidget({
  action,
  language,
  resetKey,
  onTokenChange,
}: {
  action: TurnstileAction
  language: Language
  resetKey: number
  onTokenChange: (token: string | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callbackRef = useRef(onTokenChange)
  const widgetIdRef = useRef<string | null>(null)
  const [state, setState] = useState<WidgetState>('loading')
  const [retryKey, setRetryKey] = useState(0)
  const labels = copy[language]

  callbackRef.current = onTokenChange

  useEffect(() => {
    let cancelled = false
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || (import.meta.env.DEV ? TEST_SITE_KEY : '')

    callbackRef.current(null)
    setState('loading')

    if (!siteKey || !containerRef.current) {
      setState('error')
      return
    }

    void loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return

        // Set this before render: the test key and cached widgets may invoke
        // their callback synchronously, and `verified` must win that race.
        setState('ready')
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          language,
          theme: 'auto',
          size: 'flexible',
          'response-field': false,
          callback: (token) => {
            setState('verified')
            callbackRef.current(token)
          },
          'expired-callback': () => {
            setState('expired')
            callbackRef.current(null)
          },
          'error-callback': () => {
            setState('error')
            callbackRef.current(null)
          },
        })
      })
      .catch(() => {
        if (!cancelled) setState('error')
      })

    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current)
      widgetIdRef.current = null
    }
  }, [action, language, resetKey, retryKey])

  // A check that passes has nothing to say: it reserves no height, prints no
  // "complete" line, and on an invisible site key it is not on the page at
  // all. Words appear only when the visitor has to do something about it.
  const needsAttention = state === 'error' || state === 'expired'

  return (
    <div className="flex w-full flex-col gap-2" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div ref={containerRef} className="w-full empty:hidden" />
      {needsAttention ? (
        <>
          <p aria-live="polite" className="text-foreground/58 text-xs">
            {labels[state]}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setRetryKey((value) => value + 1)}
          >
            {labels.retry}
          </Button>
        </>
      ) : null}
    </div>
  )
}
