import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, CalendarPlus, Check } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { Switch } from '#/frontend/components/ui/switch'
import { Textarea } from '#/frontend/components/ui/textarea'
import {
  bookingTypesQuery,
  slotsQuery,
  useCreateBookingAsAdmin,
} from '#/frontend/features/booking/booking-queries'
import { dayIn, instantFromZoned } from '#/frontend/features/booking/booking-time'
import { cn } from '#/frontend/lib/utils'
import type { PublicBooking, PublicBookingType } from '#/shared/types/booking.types'
import { BOOKING_LANGUAGES, type BookingLanguage } from '#/shared/validation/booking.validation'

/** The owner's own clock, and the default for a client who has no other. */
const BERLIN = 'Europe/Berlin'

const LANGUAGE_LABELS: Record<BookingLanguage, string> = {
  de: 'German',
  en: 'English',
  ar: 'Arabic',
}

const TIMEZONES: string[] =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [BERLIN]

const typeLabel = (type: PublicBookingType) => `${type.name} · ${type.durationMinutes} min`

const formatSlot = (instant: string, timeZone: string) =>
  new Intl.DateTimeFormat('de-DE', { timeZone, hour: '2-digit', minute: '2-digit' }).format(
    new Date(instant),
  )

/**
 * Booking a call on somebody's behalf — the thing that happens on the phone,
 * when the answer to "shall we talk properly?" is yes and nobody wants to go
 * looking for a calendar.
 *
 * What it produces is an ordinary booking: the client gets the same
 * confirmation, the same calendar file, and the same link to move or cancel
 * it, so the conversation does not have to come back through the owner.
 */
export function BookingCreatePage() {
  // The public list, not the admin one: this page needs exactly what a visitor
  // would be offered — the active types, named, with their length and price —
  // and nothing about how they are configured.
  const types = useQuery(bookingTypesQuery('de'))
  const create = useCreateBookingAsAdmin()

  const [slug, setSlug] = useState('')
  const [language, setLanguage] = useState<BookingLanguage>('de')
  const [timezone, setTimezone] = useState(BERLIN)
  const [day, setDay] = useState(() => dayIn(new Date(), BERLIN))
  const [anyTime, setAnyTime] = useState(false)
  const [time, setTime] = useState('10:00')
  const [slot, setSlot] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [note, setNote] = useState('')
  const [created, setCreated] = useState<PublicBooking | null>(null)

  const active = types.data ?? []
  const selectedType = active.find((type) => type.slug === slug) ?? active[0]

  // Only asked for while it is the way the time is being picked.
  const slots = useQuery({
    ...slotsQuery(selectedType?.slug ?? '', language, { from: day, to: day, timezone }),
    enabled: Boolean(selectedType) && !anyTime,
  })
  const daySlots = slots.data?.days.find((entry) => entry.date === day)?.slots ?? []

  const startsAt = anyTime ? instantFromZoned(day, time, timezone) : (slot ?? '')
  const canSubmit = Boolean(selectedType && startsAt && name.trim() && email.trim())

  const reset = () => {
    setCreated(null)
    setSlot(null)
    setName('')
    setEmail('')
    setPhone('')
    setCompany('')
    setNote('')
    create.reset()
  }

  const submit = () => {
    if (!selectedType || !startsAt) return

    create.mutate(
      {
        bookingTypeSlug: selectedType.slug,
        startsAt,
        timezone,
        language,
        name: name.trim(),
        email: email.trim(),
        phone,
        company,
        note,
        anyTime,
      },
      { onSuccess: setCreated },
    )
  }

  if (created) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="border-primary/30 bg-primary/5 flex flex-col gap-4 rounded-2xl border p-8">
          <span className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-full">
            <Check aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">The call is booked</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {created.visitorName} has the confirmation, the calendar file, and a link to move or
              cancel it — sent to{' '}
              <span className="text-foreground font-medium" dir="ltr">
                {created.visitorEmail}
              </span>
              .
            </p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">When</dt>
              <dd className="text-sm font-medium">
                {new Intl.DateTimeFormat('de-DE', {
                  timeZone: BERLIN,
                  dateStyle: 'full',
                  timeStyle: 'short',
                }).format(new Date(created.startsAt))}{' '}
                <span className="text-muted-foreground font-normal">(Berlin)</span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">Reference</dt>
              <dd className="tabular text-sm font-medium">{created.reference}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={reset}>
              <CalendarPlus aria-hidden="true" />
              Book another
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/bookings">All bookings</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/admin/bookings">
          <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
          Bookings
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New booking</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Place a call for somebody yourself. They get the same confirmation as any other booking,
          so they can move or cancel it without writing to you.
        </p>
      </div>

      {types.isPending ? (
        <p className="text-muted-foreground text-sm">Loading call types…</p>
      ) : types.isError ? (
        <div className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-3 rounded-xl border p-5">
          <div>
            <p className="text-destructive text-sm font-medium">The call types could not be loaded.</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {(types.error as Error).message} — if the database is behind the code, run the
              migrations and try again.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void types.refetch()}>
            Try again
          </Button>
        </div>
      ) : active.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          There is no active call type to book.{' '}
          <Link to="/admin/bookings/types" className="text-primary font-medium">
            Add one first
          </Link>
          .
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="text-base font-semibold">The call</h2>

            {active.length === 1 ? (
              <p className="text-muted-foreground text-sm">
                <span className="text-foreground font-medium">
                  {typeLabel(active[0]!)}
                </span>{' '}
                — the only active call type.
              </p>
            ) : (
              <div role="radiogroup" aria-label="Call type" className="grid gap-2 sm:grid-cols-2">
                {active.map((type) => (
                  <button
                    key={type.slug}
                    type="button"
                    role="radio"
                    aria-checked={type.slug === selectedType?.slug}
                    onClick={() => {
                      setSlug(type.slug)
                      setSlot(null)
                    }}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-xl border p-4 text-start transition-colors',
                      type.slug === selectedType?.slug
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40',
                    )}
                  >
                    <span className="text-sm font-medium">{type.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {type.durationMinutes} min ·{' '}
                      {type.priceCents === 0
                        ? 'free'
                        : `${(type.priceCents / 100).toFixed(0)} ${type.currency}`}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="language" label="Write to them in">
                <select
                  id="language"
                  value={language}
                  onChange={(event) => setLanguage(event.currentTarget.value as BookingLanguage)}
                  className="border-border bg-background h-9 rounded-md border px-2 text-sm"
                >
                  {BOOKING_LANGUAGES.map((code) => (
                    <option key={code} value={code}>
                      {LANGUAGE_LABELS[code]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field id="day" label="Day">
                <Input
                  id="day"
                  type="date"
                  value={day}
                  onChange={(event) => {
                    setDay(event.currentTarget.value)
                    setSlot(null)
                  }}
                />
              </Field>

              <Field
                id="timezone"
                label="Their timezone"
                hint="The confirmation shows the time on their own clock."
              >
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(event) => {
                    setTimezone(event.currentTarget.value)
                    setSlot(null)
                  }}
                  className="border-border bg-background h-9 rounded-md border px-2 text-sm"
                  dir="ltr"
                >
                  {TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="border-border flex items-center justify-between gap-4 rounded-xl border p-4">
              <div>
                <p className="text-sm font-medium">Any time</p>
                <p className="text-muted-foreground text-xs">
                  Off: pick one of the times the site would offer. On: set any time you like —
                  another booking still blocks it.
                </p>
              </div>
              <Switch checked={anyTime} onCheckedChange={setAnyTime} />
            </div>

            {anyTime ? (
              <Field id="time" label="Time">
                <Input
                  id="time"
                  type="time"
                  className="tabular w-40"
                  value={time}
                  onChange={(event) => setTime(event.currentTarget.value)}
                />
              </Field>
            ) : slots.isPending ? (
              <p className="text-muted-foreground text-sm">Loading times…</p>
            ) : daySlots.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing is free on that day. Turn on <span className="font-medium">Any time</span> to
                book it anyway.
              </p>
            ) : (
              <div role="radiogroup" aria-label="Free times" className="flex flex-wrap gap-2">
                {daySlots.map((free) => (
                  <button
                    key={free.startsAt}
                    type="button"
                    role="radio"
                    aria-checked={free.startsAt === slot}
                    className={cn('time-chip tabular', free.startsAt === slot && 'is-selected')}
                    onClick={() => setSlot(free.startsAt)}
                  >
                    {formatSlot(free.startsAt, timezone)}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-base font-semibold">The client</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="name" label="Name">
                <Input id="name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
              </Field>

              <Field id="email" label="Email">
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                />
              </Field>

              <Field id="phone" label="Phone" hint="Optional">
                <Input
                  id="phone"
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(event) => setPhone(event.currentTarget.value)}
                />
              </Field>

              <Field id="company" label="Company" hint="Optional">
                <Input
                  id="company"
                  value={company}
                  onChange={(event) => setCompany(event.currentTarget.value)}
                />
              </Field>
            </div>

            <Field id="note" label="What it is about" hint="Goes into the calendar entry.">
              <Textarea
                id="note"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
              />
            </Field>
          </section>

          {create.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {(create.error as Error).message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={!canSubmit || create.isPending} onClick={submit}>
              <CalendarPlus aria-hidden="true" />
              {create.isPending ? 'Booking…' : 'Book and send the confirmation'}
            </Button>
            {!startsAt ? (
              <p className="text-muted-foreground text-sm">Pick a time first.</p>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  )
}
