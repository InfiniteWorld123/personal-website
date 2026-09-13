import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarCheck, Check } from 'lucide-react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Eyebrow } from '#/frontend/components/layout/public/Section'
import { Button } from '#/frontend/components/ui/button'
import { BookingCalendar } from '#/frontend/features/booking/BookingCalendar'
import { BookingForm, type BookingFormValues } from '#/frontend/features/booking/BookingForm'
import { SlotPicker } from '#/frontend/features/booking/SlotPicker'
import { getBookingCopy } from '#/frontend/features/booking/booking-copy'
import { slotsQuery, useCreateBooking } from '#/frontend/features/booking/booking-queries'
import {
  dayIn,
  detectTimezone,
  endOfMonth,
  formatDateTime,
  startOfMonth,
} from '#/frontend/features/booking/booking-time'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { cn } from '#/frontend/lib/utils'
import { SplitWords, useReveal } from '#/frontend/motion'
import type { PublicBooking } from '#/shared/types/booking.types'

type Step = 'time' | 'details' | 'done'

export function BookingFlowPage({ slug, slot }: { slug: string; slot?: string }) {
  const { language } = useLanguage()
  const copy = getBookingCopy(language)
  const ref = useReveal<HTMLElement>()

  // Read once: re-detecting on every render would fight a visitor who picked a
  // different zone from the select.
  const [timezone, setTimezone] = useState(detectTimezone)
  const today = useMemo(() => dayIn(new Date(), timezone), [timezone])

  // A time carried in from elsewhere on the site (`?slot=`). It opens the
  // calendar on that day with that time chosen; the visitor still confirms.
  const invited = useMemo(() => (slot ? dayIn(new Date(slot), timezone) : null), [slot, timezone])

  const [month, setMonth] = useState(() => startOfMonth(invited ?? today))
  const [selectedDay, setSelectedDay] = useState<string | null>(invited)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(slot ?? null)
  const [step, setStep] = useState<Step>('time')
  const [confirmed, setConfirmed] = useState<PublicBooking | null>(null)

  const create = useCreateBooking()

  // The month, clipped so a visitor is never shown days already gone.
  const from = month === startOfMonth(today) ? today : month
  const slots = useQuery(slotsQuery(slug, language, { from, to: endOfMonth(month), timezone }))

  const days = slots.data?.days ?? []
  const availableDays = useMemo(
    () => new Set(days.filter((day) => day.slots.length > 0).map((day) => day.date)),
    [days],
  )

  const daySlots = days.find((day) => day.date === selectedDay)?.slots ?? []

  // Somebody else may have taken the invited time between the link being
  // rendered and this page loading, so it is only kept once the calendar has
  // actually offered it. The day stays selected either way.
  useEffect(() => {
    if (!slots.isSuccess || !selectedSlot) return
    if (!daySlots.some((offered) => offered.startsAt === selectedSlot)) setSelectedSlot(null)
  }, [slots.isSuccess, selectedSlot, daySlots])

  const handleMonthChange = (next: string) => {
    setMonth(next)
    setSelectedDay(null)
    setSelectedSlot(null)
  }

  const handleSubmit = (values: BookingFormValues) => {
    if (!selectedSlot) return

    create.mutate(
      { ...values, bookingTypeSlug: slug, startsAt: selectedSlot, timezone, language },
      {
        onSuccess: (booking) => {
          setConfirmed(booking)
          setStep('done')
        },
      },
    )
  }

  return (
    <section ref={ref} data-reveal-scope="" className="py-section lg:py-section-lg">
      <Container className="flex flex-col gap-10">
        <div className="flex max-w-2xl flex-col">
          <Eyebrow data-reveal>{copy.eyebrow}</Eyebrow>
          <h1 className="section-title text-display-lg text-foreground mt-5">
            <SplitWords text={slots.data?.bookingType.name ?? copy.title} />
          </h1>
          {slots.data?.bookingType.description ? (
            <p data-reveal className="text-foreground/58 mt-5 text-base leading-8">
              {slots.data.bookingType.description}
            </p>
          ) : null}
        </div>

        <StepRail step={step} />

        {step === 'done' && confirmed ? (
          <Confirmation booking={confirmed} timezone={timezone} />
        ) : step === 'details' && selectedSlot ? (
          <div className="surface-card flex flex-col gap-6 rounded-[1.75rem] p-6 sm:p-8">
            <p className="text-foreground/70 text-sm">
              <CalendarCheck aria-hidden="true" className="me-2 inline size-4" />
              {formatDateTime(selectedSlot, timezone, language)}
            </p>

            <BookingForm
              isSubmitting={create.isPending}
              errorMessage={create.isError ? (create.error as Error).message : null}
              onBack={() => setStep('time')}
              onSubmit={handleSubmit}
            />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,17rem)] lg:justify-center">
            <div className="flex flex-col gap-4">
              <BookingCalendar
                month={month}
                today={today}
                lastBookableDate={slots.data?.lastBookableDate ?? today}
                availableDays={availableDays}
                selectedDay={selectedDay}
                onMonthChange={handleMonthChange}
                onSelectDay={(day) => {
                  setSelectedDay(day)
                  setSelectedSlot(null)
                }}
              />

              <TimezoneSelect value={timezone} onChange={setTimezone} />
            </div>

            <div className="surface-card flex flex-col gap-5 rounded-[1.75rem] p-6 sm:p-7 lg:h-full lg:min-h-0">
              {slots.isPending ? (
                <p className="text-foreground/55 py-12 text-sm">{copy.calendar.loading}</p>
              ) : slots.isError ? (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-destructive text-sm">{copy.calendar.failed}</p>
                  <Button type="button" variant="outline" onClick={() => void slots.refetch()}>
                    {copy.calendar.retry}
                  </Button>
                </div>
              ) : availableDays.size === 0 ? (
                <p className="text-foreground/55 py-12 text-sm">{copy.calendar.noneThisMonth}</p>
              ) : selectedDay === null ? (
                <p className="text-foreground/55 py-12 text-sm">{copy.calendar.pickDay}</p>
              ) : (
                <>
                  <SlotPicker
                    day={selectedDay}
                    slots={daySlots}
                    timezone={timezone}
                    selected={selectedSlot}
                    onSelect={setSelectedSlot}
                  />

                  {selectedSlot ? (
                    <Button
                      type="button"
                      size="lg"
                      className="w-fit rounded-full"
                      onClick={() => setStep('details')}
                    >
                      {copy.pick}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )}
      </Container>
    </section>
  )
}

function StepRail({ step }: { step: Step }) {
  const { language } = useLanguage()
  const copy = getBookingCopy(language).steps
  const order: Step[] = ['time', 'details', 'done']
  const current = order.indexOf(step)

  return (
    <ol className="flex flex-wrap items-center gap-3">
      {order.map((name, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo'

        return (
          <li
            key={name}
            data-state={state}
            className="booking-step text-foreground/60 flex items-center gap-2 text-sm"
          >
            <span
              className={cn(
                'booking-step-dot tabular flex size-6 items-center justify-center',
                'rounded-full text-xs font-semibold',
              )}
            >
              {state === 'done' ? <Check aria-hidden="true" className="size-3.5" /> : index + 1}
            </span>
            <span className={cn(state === 'current' && 'text-foreground font-semibold')}>
              {copy[name]}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Zones come from the browser's own list where it has one. Where it does not,
 * the detected zone is still shown — it is right far more often than not, and
 * a visitor who needs to change it can still read what it currently says.
 */
function TimezoneSelect({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
  const { language } = useLanguage()
  const copy = getBookingCopy(language).timezone

  const zones = useMemo(() => {
    try {
      const supported = Intl.supportedValuesOf?.('timeZone') ?? []

      return supported.includes(value) ? supported : [value, ...supported]
    } catch {
      return [value]
    }
  }, [value])

  return (
    <label className="surface-card flex flex-col gap-2 rounded-[1.4rem] px-5 py-4 text-sm">
      <span className="text-foreground/45 text-[0.7rem] font-semibold tracking-[0.18em] uppercase rtl:tracking-normal">
        {copy.label}
      </span>
      <select
        dir="ltr"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="text-foreground w-full bg-transparent text-sm font-semibold focus:outline-none"
      >
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </select>
    </label>
  )
}

function Confirmation({ booking, timezone }: { booking: PublicBooking; timezone: string }) {
  const { language } = useLanguage()
  const copy = getBookingCopy(language).confirmed

  return (
    <div className="surface-card flex flex-col gap-5 rounded-[1.75rem] p-6 sm:p-7 lg:h-full lg:min-h-0">
      <span className="brand-mark text-primary w-fit">
        <Check aria-hidden="true" className="size-5" />
      </span>

      <div className="flex flex-col gap-2">
        <p className="font-heading text-foreground text-2xl font-semibold">{copy.heading}</p>
        <p className="text-foreground/58 text-sm leading-7">{copy.body}</p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <Detail label={copy.when} value={formatDateTime(booking.startsAt, timezone, language)} />
        <Detail
          label={copy.duration}
          value={`${booking.bookingType.durationMinutes} ${getBookingCopy(language).minutes}`}
        />
        <Detail label={copy.reference} value={booking.reference} />
      </dl>

      <p className="text-foreground/58 text-sm">{copy.emailed}</p>

      {booking.manageToken ? (
        <Button asChild variant="outline" className="w-fit rounded-full">
          <Link
            to="/$lang/booking/manage/$reference"
            params={{ lang: language, reference: booking.reference }}
            hash={`token=${encodeURIComponent(booking.manageToken)}`}
          >
            <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
            {copy.cancel}
          </Link>
        </Button>
      ) : null}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-foreground/45 text-[0.7rem] font-semibold tracking-[0.18em] uppercase rtl:tracking-normal">
        {label}
      </dt>
      <dd className="text-foreground tabular text-sm font-semibold">{value}</dd>
    </div>
  )
}
