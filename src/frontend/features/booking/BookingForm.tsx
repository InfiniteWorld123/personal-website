import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { Textarea } from '#/frontend/components/ui/textarea'
import { getContent } from '#/frontend/content'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { cn } from '#/frontend/lib/utils'
import type { BookingCreateInput } from '#/shared/validation/booking.validation'
import { getBookingCopy } from './booking-copy'
import { TurnstileWidget } from '#/frontend/features/security/TurnstileWidget'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type FieldErrors = Partial<Record<'name' | 'email', string>>

export type BookingFormValues = Omit<
  BookingCreateInput,
  'bookingTypeSlug' | 'startsAt' | 'timezone' | 'language'
>

/**
 * The details asked once a time is chosen. The qualifying questions are the
 * same three the contact form asks (D13), because both doors lead to the same
 * lead and a call that starts with context is a shorter call.
 */
export function BookingForm({
  isSubmitting,
  errorMessage,
  onBack,
  onSubmit,
}: {
  isSubmitting: boolean
  errorMessage: string | null
  onBack: () => void
  onSubmit: (values: BookingFormValues) => void
}) {
  const { language } = useLanguage()
  const copy = getBookingCopy(language).form
  // The same three lists the contact form offers, from one place: the
  // questions are the same question, and two copies would drift apart.
  const { form: contactForm } = getContent(language).contact
  const [errors, setErrors] = useState<FieldErrors>({})
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const data = new FormData(event.currentTarget)
    const text = (key: string) => String(data.get(key) ?? '').trim()

    const name = text('name')
    const email = text('email')
    const found: FieldErrors = {}

    if (!name) found.name = copy.name
    if (!EMAIL_PATTERN.test(email)) found.email = copy.email

    setErrors(found)
    if (Object.keys(found).length > 0 || !turnstileToken) return

    onSubmit({
      turnstileToken,
      name,
      email,
      phone: text('phone'),
      company: text('company'),
      serviceInterest: text('projectType'),
      budgetBand: text('budget'),
      timeline: text('timeline'),
      note: text('note'),
      // The honeypot. Hidden from sight and from the tab order, so anything
      // that fills it in was not a person.
      website: text('website'),
    })
    setTurnstileToken(null)
    setTurnstileResetKey((value) => value + 1)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <p className="text-foreground text-base font-semibold">{copy.heading}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="booking-name" label={copy.name} error={errors.name}>
          <Input id="booking-name" name="name" autoComplete="name" required />
        </Field>

        <Field id="booking-email" label={copy.email} error={errors.email}>
          <Input id="booking-email" name="email" type="email" autoComplete="email" required dir="ltr" />
        </Field>

        <Field id="booking-phone" label={copy.phone} hint={copy.optional}>
          <Input id="booking-phone" name="phone" type="tel" autoComplete="tel" dir="ltr" />
        </Field>

        <Field id="booking-company" label={copy.company} hint={copy.optional}>
          <Input id="booking-company" name="company" autoComplete="organization" />
        </Field>

        <Field id="booking-project-type" label={copy.projectType} hint={copy.optional}>
          <Select id="booking-project-type" name="projectType" options={contactForm.projectTypes} />
        </Field>

        <Field id="booking-budget" label={copy.budget} hint={copy.optional}>
          <Select id="booking-budget" name="budget" options={contactForm.budgets} />
        </Field>

        <Field id="booking-timeline" label={copy.timeline} hint={copy.optional}>
          <Select id="booking-timeline" name="timeline" options={contactForm.timelines} />
        </Field>
      </div>

      <Field id="booking-note" label={copy.note} hint={copy.noteHint}>
        <Textarea id="booking-note" name="note" rows={4} />
      </Field>

      {/* Hidden by clipping, never by pushing it off the side: a large
          negative inset widens the document by that distance, and in RTL the
          page then opens scrolled onto the empty strip and reads as blank. */}
      <div aria-hidden="true" className="sr-only">
        <label htmlFor="booking-website">Website</label>
        <input id="booking-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <TurnstileWidget
        action="booking_create"
        language={language}
        resetKey={turnstileResetKey}
        onTokenChange={setTurnstileToken}
      />

      {errorMessage ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          size="lg"
          className="rounded-full"
          disabled={isSubmitting || !turnstileToken}
        >
          {isSubmitting ? copy.submitting : copy.submit}
          <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
        </Button>

        <Button type="button" variant="outline" className="rounded-full" onClick={onBack}>
          {copy.back}
        </Button>
      </div>
    </form>
  )
}

function Select({
  id,
  name,
  options,
}: {
  id: string
  name: string
  options: Array<{ value: string; label: string }>
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={options[0]?.label}
      className={cn(
        'border-input bg-background h-9 w-full rounded-lg border px-3 text-sm shadow-xs',
        'focus-visible:border-ring focus-visible:ring-ring/50 outline-none focus-visible:ring-3',
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.label}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {hint ? <span className="text-foreground/45 ms-2 text-xs font-normal">{hint}</span> : null}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  )
}
