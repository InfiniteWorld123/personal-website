import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import { ArrowRight } from 'lucide-react'
import type { BookingMethod } from '#/backend2/contracts/booking.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { Textarea } from '#/frontend/components/ui/textarea'
import { getContent } from '#/frontend/content'
import { TurnstileWidget } from '#/frontend/features/security/TurnstileWidget'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { cn } from '#/frontend/lib/utils'
import { getBookingCopy } from '../booking-copy'
import { type BookingReceipt, type BookingRequest, createBooking } from './api'
import { getBookingV2Copy } from './booking-v2-copy'

/**
 * The details asked once a time is chosen, posted to Backend2.
 *
 * Name and email always; the phone number only for a phone call, because that
 * is the only time it is used; company, "What is it about?", "Budget range"
 * and a note stay optional — the two selects leave Contact, never Booking.
 * Timeline is not asked: the visitor has just chosen the time.
 *
 * Checked on the first press of the button, then again as each field changes.
 * The server checks everything again; what it refuses is shown at the field.
 */

/** The server's limits (`BOOKING_LIMITS`); a test keeps them equal. */
export const BOOKING_FORM_LIMITS = { name: 200, email: 254, phone: 40, company: 200, note: 2_000 } as const

const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/u
const PHONE_PATTERN = /^[+()\d\s./-]{5,}$/u

type FieldName = 'name' | 'email' | 'phone' | 'company' | 'subject' | 'budget' | 'note'
const FIELDS: readonly FieldName[] = ['name', 'email', 'phone', 'company', 'subject', 'budget', 'note']

export type BookingFormValues = Record<FieldName, string>

export type BookingFailure = 'taken' | 'too_soon'

export function BookingFormV2({
  typeSlug,
  method,
  startsAt,
  timeZone,
  submissionId,
  onBooked,
  onUnavailable,
  onBack,
}: {
  typeSlug: string
  method: BookingMethod
  startsAt: string
  timeZone: string
  submissionId: string
  onBooked: (receipt: BookingReceipt, values: BookingFormValues) => void
  onUnavailable: (reason: BookingFailure) => void
  onBack: () => void
}) {
  const { language } = useLanguage()
  const base = getBookingCopy(language).form
  const copy = getBookingV2Copy(language).form
  const { form: contactForm } = getContent(language).contact
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const honeypot = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const inFlight = useRef(false)
  // Its own flag, not the form's: a second press ends its own submit at once
  // and would clear the form's `isSubmitting` while the first is still out.
  const [sending, setSending] = useState(false)

  const focusFirstInvalid = () =>
    window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())

  const serverFieldMessage = (field: FieldName): string => {
    if (field === 'name') return copy.errName
    if (field === 'email') return copy.errEmail
    if (field === 'phone') return method === 'phone' ? copy.errPhone : copy.errPhoneFormat

    return copy.errTooLong
  }

  const form = useForm({
    defaultValues: { name: '', email: '', phone: '', company: '', subject: '', budget: '', note: '' } as BookingFormValues,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Partial<Record<FieldName, string>> = {}
        const phone = value.phone.trim()

        if (value.name.trim() === '') fields.name = copy.errName
        else if (value.name.trim().length > BOOKING_FORM_LIMITS.name) fields.name = copy.errTooLong

        if (!EMAIL_PATTERN.test(value.email.trim()) || value.email.trim().length > BOOKING_FORM_LIMITS.email) {
          fields.email = copy.errEmail
        }

        if (method === 'phone' && phone === '') fields.phone = copy.errPhone
        else if (method === 'phone' && (!PHONE_PATTERN.test(phone) || phone.length > BOOKING_FORM_LIMITS.phone)) {
          fields.phone = copy.errPhoneFormat
        }

        if (value.company.trim().length > BOOKING_FORM_LIMITS.company) fields.company = copy.errTooLong
        if (value.note.trim().length > BOOKING_FORM_LIMITS.note) fields.note = copy.errTooLong

        return Object.keys(fields).length > 0 ? { fields } : undefined
      },
    },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: async ({ value }) => {
      if (inFlight.current || !turnstileToken) return

      inFlight.current = true
      setSending(true)
      setFailure(null)
      setServerErrors({})

      const request: BookingRequest = {
        submissionId,
        typeSlug,
        method,
        startsAt,
        timeZone,
        language,
        name: value.name.trim(),
        email: value.email.trim(),
        // Sent only for a phone call: the number is not asked for anything else.
        phone: method === 'phone' ? value.phone.trim() : '',
        company: value.company.trim(),
        subject: value.subject || null,
        budget: value.budget || null,
        note: value.note.trim(),
        turnstileToken,
        website: honeypot.current?.value ?? '',
      }

      try {
        onBooked(await createBooking(request), value)
      } catch (error) {
        const code = error instanceof ApiRequestError ? error.code : null

        if (code === 'SLOT_UNAVAILABLE') return onUnavailable('taken')
        if (code === 'BOOKING_TOO_SOON' || code === 'BOOKING_TOO_FAR') return onUnavailable('too_soon')

        if (code === 'VALIDATION_ERROR' && error instanceof ApiRequestError) {
          const issues = (error.details as { issues?: Array<{ field?: string }> } | undefined)?.issues ?? []
          const found: Partial<Record<FieldName, string>> = {}

          for (const issue of issues) {
            const field = FIELDS.find((name) => name === issue.field)

            if (field) found[field] = serverFieldMessage(field)
          }

          if (Object.keys(found).length > 0) {
            setServerErrors(found)
            focusFirstInvalid()

            return
          }
        }

        setFailure(
          code === 'RATE_LIMITED' ? copy.rateLimited : code === 'VERIFICATION_FAILED' ? copy.verification : copy.failed,
        )
      } finally {
        inFlight.current = false
        setSending(false)
        // A Turnstile token is good for one check only.
        setTurnstileToken(null)
        setTurnstileResetKey((key) => key + 1)
      }
    },
  })

  const submitting = useStore(form.store, (state) => state.isSubmitting) || sending

  const errorFor = (name: FieldName, errors: unknown[]) =>
    (typeof errors[0] === 'string' ? errors[0] : undefined) ?? serverErrors[name]

  const clearServer = (name: FieldName) =>
    setServerErrors((previous) => (previous[name] ? { ...previous, [name]: undefined } : previous))

  const text = (name: FieldName, label: string, input: { type?: string; autoComplete?: string; dir?: 'ltr'; hint?: string; optional?: boolean }) => (
    <form.Field name={name}>
      {(field) => {
        const error = errorFor(name, field.state.meta.errors)
        const id = `booking-${name}`

        return (
          <FormField id={id} label={label} hint={input.optional ? base.optional : undefined} help={input.hint} error={error}>
            <Input
              id={id}
              name={name}
              type={input.type ?? 'text'}
              autoComplete={input.autoComplete}
              dir={input.dir}
              value={field.state.value}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : input.hint ? `${id}-help` : undefined}
              onBlur={field.handleBlur}
              onChange={(event) => {
                clearServer(name)
                field.handleChange(event.target.value)
              }}
            />
          </FormField>
        )
      }}
    </form.Field>
  )

  const select = (name: 'subject' | 'budget', label: string, options: Array<{ value: string; label: string }>) => (
    <form.Field name={name}>
      {(field) => {
        const id = `booking-${name}`
        const error = errorFor(name, field.state.meta.errors)

        return (
          <FormField id={id} label={label} hint={base.optional} error={error}>
            <select
              id={id}
              name={name}
              value={field.state.value}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(event) => {
                clearServer(name)
                field.handleChange(event.target.value)
              }}
              className={cn(
                'border-input bg-background h-9 w-full rounded-lg border px-3 text-sm shadow-xs',
                'focus-visible:border-ring focus-visible:ring-ring/50 outline-none focus-visible:ring-3',
              )}
            >
              <option value="">{copy.choose}</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>
        )
      }}
    </form.Field>
  )

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <p className="text-foreground text-base font-semibold">{base.heading}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {text('name', base.name, { autoComplete: 'name' })}
        {text('email', base.email, { type: 'email', autoComplete: 'email', dir: 'ltr' })}
        {method === 'phone' ? text('phone', base.phone, { type: 'tel', autoComplete: 'tel', dir: 'ltr', hint: copy.phoneHint }) : null}
        {text('company', base.company, { autoComplete: 'organization', optional: true })}
        {select('subject', base.projectType, contactForm.projectTypes)}
        {select('budget', base.budget, contactForm.budgets)}
      </div>

      <form.Field name="note">
        {(field) => {
          const error = errorFor('note', field.state.meta.errors)

          return (
            <FormField id="booking-note" label={base.note} hint={base.optional} help={base.noteHint} error={error}>
              <Textarea
                id="booking-note"
                name="note"
                rows={4}
                value={field.state.value}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'booking-note-error' : 'booking-note-help'}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  clearServer('note')
                  field.handleChange(event.target.value)
                }}
              />
            </FormField>
          )
        }}
      </form.Field>

      {/* Hidden by clipping, never by pushing it off the side: a large
          negative inset widens the document, and in RTL the page then opens
          scrolled onto the empty strip. */}
      <div aria-hidden="true" className="sr-only">
        <label htmlFor="booking-website">Website</label>
        <input ref={honeypot} id="booking-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <p className="text-foreground/58 m-0 text-xs leading-6">
        {copy.privacy}{' '}
        <Link to="/$lang/datenschutz" params={{ lang: language }} className="link-underline-slide text-primary font-semibold">
          {copy.privacyLink}
        </Link>
      </p>

      <TurnstileWidget action="booking_create" language={language} resetKey={turnstileResetKey} onTokenChange={setTurnstileToken} />

      {failure ? (
        <p role="alert" className="text-destructive text-sm">
          {failure}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" className="rounded-full" disabled={submitting || !turnstileToken} aria-busy={submitting}>
          {submitting ? base.submitting : base.submit}
          <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
        </Button>

        <Button type="button" variant="outline" className="rounded-full" disabled={submitting} onClick={onBack}>
          {base.back}
        </Button>
      </div>
    </form>
  )
}

function FormField({
  id,
  label,
  hint,
  help,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  help?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {hint ? <span className="text-foreground/45 ms-2 text-xs font-normal">{hint}</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="text-foreground/50 text-xs">
          {help}
        </p>
      ) : null}
    </div>
  )
}
