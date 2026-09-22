import type { ReactNode } from 'react'
import { DashboardMark } from '#/frontend/dashboard/DashboardMark'
import { cn } from '#/frontend/lib/utils'

/**
 * The standalone surface every signed-out V2 screen sits on.
 *
 * Outside the Dashboard shell — no rail, no top bar — but not outside its
 * identity: `data-dashboard` is what makes `dashboard.css` apply at all, and
 * `data-surface="floating"` picks the tinted ground the approved design puts
 * the card on. Both attributes live here rather than on each page, so there is
 * one place the sign-in surface is decided.
 */
export function AuthShell({
  children,
  width = 'narrow',
  footer,
}: {
  children: ReactNode
  width?: 'narrow' | 'wide'
  footer?: ReactNode
}) {
  return (
    <div
      data-dashboard
      data-surface="floating"
      className="flex min-h-dvh items-center justify-center bg-[var(--dash-canvas)] px-4 py-10"
    >
      <div className={cn('flex w-full flex-col gap-5', width === 'wide' ? 'max-w-2xl' : 'max-w-[404px]')}>
        <div className="flex items-center gap-2 pl-0.5">
          <DashboardMark size={26} />
          <span className="dash-eyebrow-quiet">YAMAN WARDA</span>
        </div>

        <div className="dash-panel p-[30px] pb-[26px]">{children}</div>

        {footer ? (
          <p className="text-center text-[11.5px] leading-relaxed text-[var(--dash-quiet)]">
            {footer}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="dash-title text-[29px]">{title}</h1>
      {children ? (
        <p className="text-[13px] leading-relaxed text-[var(--dash-quiet)]">{children}</p>
      ) : null}
    </div>
  )
}

/**
 * The one slot a refusal appears in, under the heading.
 *
 * `role="status"` rather than `role="alert"`: these messages land after a
 * submit the owner just made, so a screen reader announcing them politely
 * follows the action instead of interrupting it.
 */
export function AuthNotice({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'info'
  children: ReactNode
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-[12.5px] leading-snug',
        tone === 'error'
          ? 'bg-[var(--dash-red-tint)] text-[var(--dash-red-ink)]'
          : 'bg-[var(--dash-blue-tint)] text-[var(--dash-blue-ink)]',
      )}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-px shrink-0">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7.5 V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1.2" fill="currentColor" />
      </svg>
      <p className="m-0">{children}</p>
    </div>
  )
}

/** A hairline with a word in it. Separates the passkey route from the fallback. */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px grow bg-[var(--dash-line)]" />
      <span className="dash-eyebrow-quiet">{label}</span>
      <span className="h-px grow bg-[var(--dash-line)]" />
    </div>
  )
}

/**
 * A labelled field with its error underneath.
 *
 * `aria-describedby` points at the message only while there is one, so the
 * field is not announced as having a description that is empty.
 */
export function Field({
  id,
  label,
  error,
  hint,
  action,
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: ReactNode
  action?: ReactNode
  children: (describedBy: string | undefined) => ReactNode
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs font-semibold">
          {label}
        </label>
        {action}
      </div>
      {children(describedBy)}
      {error ? (
        <p id={`${id}-error`} className="text-[11.5px] leading-snug text-[var(--dash-red-ink)]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[11.5px] leading-snug text-[var(--dash-quiet)]">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** Three dots that stand in for a spinner, and stop when motion is reduced. */
export function Working({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="flex gap-1">
        <span className="h-1 w-1 animate-pulse rounded-full bg-current motion-reduce:animate-none" />
        <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:150ms] motion-reduce:animate-none" />
        <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:300ms] motion-reduce:animate-none" />
      </span>
      {label}
    </span>
  )
}
