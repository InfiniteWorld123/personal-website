import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, FlaskConical } from 'lucide-react'
import { ApiRequestError } from '#/frontend/api/response'
import { berlinToday } from '#/backend2/contracts/invoice-dates.contract'
import type { InvoiceMode, OwnerInvoiceListItem, PaymentState } from '#/backend2/contracts/invoice.contract'
import { StatusChip, type Tone } from '#/frontend/dashboard/primitives'
import { cn } from '#/frontend/lib/utils'
import './invoices.css'

/**
 * The pieces every Invoices screen shares, as approved in the Invoices Design
 * Lab (24 Sep 2026): the amber test-mode bar, the section tabs, the status
 * chips (red only for money that is late), and the form scaffolding.
 */

export function TestBar({ mode, showSettingsLink = true }: { mode: InvoiceMode; showSettingsLink?: boolean }) {
  if (mode !== 'test') return null

  return (
    <div className="inv-testbar" role="note">
      <FlaskConical className="size-3.5" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <b>Test mode.</b> Documents say TEST, are numbered TEST-{berlinToday().slice(0, 4)}-…, go only to your own
        test address when one is set, and never count as real money or in the tax archive.
      </span>
      {showSettingsLink ? (
        <Link to="/dashboard/invoices/settings" className="dash-btn dash-btn-ghost -my-1.5 -me-1 h-8 px-2.5 text-[12.5px]">
          Seller &amp; tax
        </Link>
      ) : null}
    </div>
  )
}

export function TestChip({ mode }: { mode: InvoiceMode }) {
  return mode === 'test' ? (
    <span className="inv-tone-amber inline-flex h-[22px] shrink-0 items-center rounded-md px-2 text-[11px] font-bold tracking-[0.06em]">
      TEST
    </span>
  ) : null
}

type Section = 'invoices' | 'subscriptions' | 'archive' | 'settings'

export function SectionNav({ current, subscriptions }: { current: Section; subscriptions?: number }) {
  const items: Array<[Section, string, string]> = [
    ['invoices', 'Invoices', '/dashboard/invoices'],
    ['subscriptions', 'Subscriptions', '/dashboard/invoices/subscriptions'],
    ['archive', 'Tax adviser archive', '/dashboard/invoices/archive'],
    ['settings', 'Seller & tax', '/dashboard/invoices/settings'],
  ]

  return (
    <nav className="inv-views" aria-label="Invoices sections">
      {items.map(([key, label, to]) => (
        <Link
          key={key}
          to={to}
          className="inv-view"
          activeOptions={{ exact: true, includeSearch: false }}
          aria-current={current === key ? 'page' : undefined}
        >
          {label}
          {key === 'subscriptions' && subscriptions ? <span className="inv-count">{subscriptions}</span> : null}
        </Link>
      ))}
    </nav>
  )
}

const STATE: Record<PaymentState, [string, Tone]> = {
  unpaid: ['Open', 'blue'],
  partially_paid: ['Partly paid', 'blue'],
  overdue: ['Overdue', 'red'],
  paid: ['Paid', 'outline'],
  cancelled: ['Cancelled', 'outline'],
  not_applicable: ['', 'grey'],
}

/** A draft, a cancellation document, or the payment state of an issued invoice. */
export function InvoiceStateChip({ invoice }: { invoice: Pick<OwnerInvoiceListItem, 'status' | 'kind' | 'paymentState'> }) {
  if (invoice.status === 'draft') return <StatusChip tone="grey">Draft</StatusChip>
  if (invoice.kind === 'cancellation') return <StatusChip tone="outline">Cancellation</StatusChip>

  const [label, tone] = STATE[invoice.paymentState]

  return <StatusChip tone={tone}>{label}</StatusChip>
}

export const errorId = (id: string) => `${id}-error`

export function FieldError({ id, message }: { id: string; message?: string | null }) {
  if (!message) return null

  return (
    <span id={errorId(id)} className="flex items-center gap-1.5 text-[12px] text-[var(--dash-red-ink)]">
      <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
      {message}
    </span>
  )
}

export function Label({
  htmlFor,
  children,
  optional,
  className,
}: {
  htmlFor: string
  children: ReactNode
  optional?: boolean
  className?: string
}) {
  return (
    <label htmlFor={htmlFor} className={cn('text-[12.5px] font-semibold', className)}>
      {children}
      {optional ? <span className="font-normal text-[var(--dash-quiet)]"> (optional)</span> : null}
    </label>
  )
}

export function Hint({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span id={id} className="text-[11.5px] leading-relaxed text-[var(--dash-quiet)]">
      {children}
    </span>
  )
}

/** Two to four choices, one pressed. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: T
  options: Array<[T, string] | [T, string, { disabled?: boolean; title?: string }]>
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <div className="inv-seg" role="group" aria-label={label}>
      {options.map(([key, text, extra]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          disabled={disabled || extra?.disabled}
          title={extra?.title}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

export function Banner({
  tone,
  icon,
  title,
  children,
  className,
  role,
}: {
  tone: 'info' | 'warn' | 'bad'
  icon: ReactNode
  title?: ReactNode
  children?: ReactNode
  className?: string
  role?: 'alert' | 'note' | 'status'
}) {
  return (
    <div
      role={role}
      className={cn(
        'flex items-start gap-2.5 rounded-[10px] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--dash-ink)]',
        tone === 'info' && 'bg-[var(--dash-blue-tint)] [&>svg]:text-[var(--dash-blue-ink)]',
        tone === 'warn' && 'bg-[var(--inv-amber-tint)] [&>svg]:text-[var(--inv-amber-ink)]',
        tone === 'bad' && 'bg-[var(--dash-red-tint)] [&>svg]:text-[var(--dash-red-ink)]',
        className,
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">
        {title ? <b className="block text-[13px]">{title}</b> : null}
        {children}
      </div>
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <h3 className="inv-sec-title">
      <span>{children}</span>
      {action}
    </h3>
  )
}

/** The loading rows of a list: shapes where the content will be. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3.5 p-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="grid grid-cols-[110px_1fr_90px] gap-3.5">
          <span className="dash-skeleton h-3 rounded" />
          <span className="dash-skeleton h-3 rounded" />
          <span className="dash-skeleton h-3 rounded" />
        </div>
      ))}
    </div>
  )
}

/** A fresh idempotency key for one money action. */
export const newIdempotencyKey = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/gu, (c) =>
        (Number(c) ^ (Math.floor(Math.random() * 16) >> (Number(c) / 4))).toString(16),
      )

/** What to say when a Stripe step fails: a missing key is a setup fact, not a crash. */
export const stripeFailure = (error: unknown): string => {
  if (error instanceof ApiRequestError && error.code === 'STRIPE_UNAVAILABLE') {
    return 'Stripe is not connected on this site yet, so no link can be made. Nothing was changed.'
  }

  return error instanceof ApiRequestError ? error.message : 'Stripe did not answer. Nothing was changed — try again.'
}
