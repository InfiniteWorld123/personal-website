import { useEffect, useState } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '#/frontend/components/ui/toast'
import {
  dismissNotice,
  getNotices,
  subscribeToNotices,
  type Notice,
} from '#/frontend/lib/notify'

/**
 * Mounted once in the Dashboard shell. It renders whatever `lib/notify.ts`
 * holds, which is written to from one place — the `QueryClient`'s default
 * mutation `onError` in `config/router.tsx` — so a write that fails anywhere
 * in the Dashboard says so here without its own page having to remember to
 * ask.
 */

const TITLE: Record<Notice['tone'], string> = {
  error: 'Not saved',
  success: 'Saved',
}

/** Long enough to read a sentence; an error waits twice as long as a success. */
const DURATION: Record<Notice['tone'], number> = {
  error: 10_000,
  success: 4_000,
}

export function Toaster() {
  /*
   * Starts empty rather than from the store, so the server's HTML and the
   * first client render agree. Anything already queued arrives in the effect
   * below, one tick later.
   */
  const [notices, setNotices] = useState<Notice[]>([])

  useEffect(() => {
    setNotices(getNotices())

    return subscribeToNotices(setNotices)
  }, [])

  return (
    <ToastProvider swipeDirection="right">
      {notices.map((notice) => {
        const Icon = notice.tone === 'error' ? AlertTriangle : Check

        return (
          <Toast
            key={notice.id}
            tone={notice.tone}
            duration={DURATION[notice.tone]}
            open
            onOpenChange={(open) => {
              if (!open) dismissNotice(notice.id)
            }}
          >
            <Icon
              aria-hidden="true"
              className={
                notice.tone === 'error'
                  ? 'text-destructive mt-0.5 size-4 shrink-0'
                  : 'text-primary mt-0.5 size-4 shrink-0'
              }
            />
            <div className="min-w-0 flex-1">
              <ToastTitle
                className={notice.tone === 'error' ? 'text-destructive' : 'text-muted-foreground'}
              >
                {TITLE[notice.tone]}
              </ToastTitle>
              <ToastDescription dir="auto">{notice.message}</ToastDescription>
            </div>
            <ToastClose aria-label="Dismiss">
              <X aria-hidden="true" className="size-3.5" />
            </ToastClose>
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
