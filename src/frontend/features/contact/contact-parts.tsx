import { Link } from '@tanstack/react-router'
import { CalendarDays } from 'lucide-react'
import type { ReactNode } from 'react'
import { Label } from '#/frontend/components/ui/label'
import { getBookingEntryCopy } from '#/frontend/features/booking/booking-entry-copy'
import type { Language } from '#/frontend/i18n/language'
import { cn } from '#/frontend/lib/utils'

/** The Contact form's labelled field and its "or book a call" line. */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={htmlFor} className="flex flex-wrap items-baseline gap-2">
        {label}
        {hint && !error ? <span id={`${htmlFor}-hint`} className="text-muted-foreground text-xs font-normal">{hint}</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * What used to be a radio pair — email or a call — is now the two doors of
 * the site itself: this form is answered by email, and a call is a time the
 * visitor picks in the calendar. Asking here and then answering by email
 * anyway was the contradiction this replaces.
 */
export function CallInstead({ language }: { language: Language }) {
  const entry = getBookingEntryCopy(language)

  return (
    <p className="text-muted-foreground m-0 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <CalendarDays aria-hidden="true" className="size-4 text-primary" />
      {entry.toBooking.question}{' '}
      <Link
        to="/$lang/booking"
        params={{ lang: language }}
        className="link-underline-slide text-primary font-semibold"
      >
        {entry.toBooking.link}
      </Link>
    </p>
  )
}
