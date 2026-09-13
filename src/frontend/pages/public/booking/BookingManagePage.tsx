import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { ArrowLeft, CalendarCheck, CalendarClock, CalendarX, Check } from 'lucide-react'
import { ApiRequestError } from '#/frontend/api/response'
import { Container } from '#/frontend/components/layout/public/Container'
import { Eyebrow } from '#/frontend/components/layout/public/Section'
import { Button } from '#/frontend/components/ui/button'
import { Label } from '#/frontend/components/ui/label'
import { Textarea } from '#/frontend/components/ui/textarea'
import { BookingCalendar } from '#/frontend/features/booking/BookingCalendar'
import { SlotPicker } from '#/frontend/features/booking/SlotPicker'
import { getBookingCopy } from '#/frontend/features/booking/booking-copy'
import {
  bookingQuery,
  slotsQuery,
  useCancelBooking,
  useRescheduleBooking,
} from '#/frontend/features/booking/booking-queries'
import {
  dayIn,
  endOfMonth,
  formatDateTime,
  startOfMonth,
} from '#/frontend/features/booking/booking-time'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { SplitWords, useReveal } from '#/frontend/motion'
import type { PublicBooking } from '#/shared/types/booking.types'

/** The email link's token authorises this page; the reference alone proves nothing. */
export function BookingManagePage({ reference, token }: { reference: string; token: string }) {
  const { language } = useLanguage()
  const copy = getBookingCopy(language)
  const ref = useReveal<HTMLElement>()
  const booking = useQuery(bookingQuery(reference, token))
  const cancel = useCancelBooking(reference, token)
  const [reason, setReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [rescheduled, setRescheduled] = useState<PublicBooking | null>(null)

  const status = cancel.data?.status ?? booking.data?.status
  const isPast = booking.data ? Date.parse(booking.data.startsAt) < Date.now() : false
  const canManage = status === 'CONFIRMED' && !isPast
  const invalidLink =
    booking.error instanceof ApiRequestError && [401, 404, 422].includes(booking.error.status)

  return (
    <section ref={ref} data-reveal-scope="" className="py-section lg:py-section-lg">
      <Container className="flex max-w-2xl flex-col gap-8">
        <div className="flex flex-col">
          <Eyebrow data-reveal>{copy.eyebrow}</Eyebrow>
          <h1 className="section-title text-display-lg text-foreground mt-5">
            <SplitWords text={copy.manage.heading} />
          </h1>
        </div>

        {booking.isPending ? (
          <p className="text-foreground/55 text-sm">{copy.manage.loading}</p>
        ) : booking.isError ? (
          <div className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-3 rounded-[1.4rem] border p-6">
            <p className="text-destructive text-sm">
              {invalidLink ? copy.manage.notFound : copy.manage.failed}
            </p>
            {!invalidLink ? (
              <Button type="button" variant="outline" onClick={() => void booking.refetch()}>
                {copy.manage.retry}
              </Button>
            ) : null}
          </div>
        ) : rescheduled ? (
          <RescheduledBooking booking={rescheduled} />
        ) : isRescheduling && canManage ? (
          <ReschedulePanel
            booking={booking.data}
            reference={reference}
            token={token}
            onBack={() => setIsRescheduling(false)}
            onComplete={setRescheduled}
          />
        ) : (
          <div className="surface-card flex flex-col gap-6 rounded-[1.75rem] p-6 sm:p-8">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail
                label={copy.manage.when}
                value={formatDateTime(booking.data.startsAt, booking.data.timezone, language)}
              />
              <Detail label={copy.manage.status} value={copy.status[status ?? 'CONFIRMED']} />
            </dl>

            {status === 'CANCELLED' ? (
              <div className="flex flex-col items-start gap-4">
                <p className="text-foreground/58 text-sm">{copy.manage.cancelled}</p>
                {/* A cancelled booking is not the end of the conversation. */}
                <Button asChild className="rounded-full">
                  <Link to="/$lang/booking" params={{ lang: language }}>
                    <CalendarClock aria-hidden="true" className="size-4" />
                    {copy.manage.bookAgain}
                  </Link>
                </Button>
              </div>
            ) : isPast ? (
              <p className="text-foreground/58 text-sm">{copy.manage.alreadyPast}</p>
            ) : null}

            {canManage ? (
              <>
                {/* Moving a call keeps it; cancelling ends it. So moving is the
                    button, and cancelling is a line underneath that opens the
                    panel — which itself offers the other way out first. */}
                <div className="border-border flex flex-col gap-3 border-t pt-6">
                  <p className="text-foreground text-base font-semibold">{copy.manage.rescheduleHeading}</p>
                  <p className="text-foreground/58 text-sm leading-7">{copy.manage.rescheduleBody}</p>
                  <Button
                    type="button"
                    className="w-fit rounded-full"
                    onClick={() => setIsRescheduling(true)}
                  >
                    <CalendarClock aria-hidden="true" className="size-4" />
                    {copy.manage.rescheduleHeading}
                  </Button>
                </div>

                {isCancelling ? (
                  <div className="border-border flex flex-col gap-4 border-t pt-6">
                    <div className="flex flex-col gap-1">
                      <p className="text-foreground text-base font-semibold">{copy.manage.cancelHeading}</p>
                      <p className="text-foreground/58 text-sm leading-7">{copy.manage.cancelBody}</p>
                    </div>

                    <div className="cancel-offer flex flex-wrap items-center gap-3 rounded-[1.2rem] p-4">
                      <p className="text-foreground/70 m-0 flex-1 text-sm leading-7">
                        {copy.manage.rescheduleInstead}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => setIsRescheduling(true)}
                      >
                        <CalendarClock aria-hidden="true" className="size-4" />
                        {copy.manage.rescheduleHeading}
                      </Button>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="cancel-reason" className="text-sm font-medium">
                        {copy.manage.cancelReason}
                        <span className="text-foreground/45 ms-2 text-xs font-normal">
                          {copy.form.optional}
                        </span>
                      </Label>
                      <Textarea
                        id="cancel-reason"
                        rows={3}
                        value={reason}
                        onChange={(event) => setReason(event.currentTarget.value)}
                      />
                    </div>

                    {cancel.isError ? (
                      <p role="alert" className="text-destructive text-sm">
                        {(cancel.error as Error).message}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="text-destructive border-destructive/40 hover:bg-destructive/5 hover:text-destructive rounded-full"
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate({ reason })}
                      >
                        <CalendarX aria-hidden="true" className="size-4" />
                        {cancel.isPending ? copy.manage.cancelling : copy.manage.cancelConfirm}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="rounded-full"
                        disabled={cancel.isPending}
                        onClick={() => {
                          setIsCancelling(false)
                          setReason('')
                        }}
                      >
                        {copy.manage.keepBooking}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="link-underline-slide text-foreground/50 hover:text-destructive w-fit text-sm font-medium"
                    onClick={() => setIsCancelling(true)}
                  >
                    {copy.manage.cancelInstead}
                  </button>
                )}
              </>
            ) : null}
          </div>
        )}
      </Container>
    </section>
  )
}

function ReschedulePanel({
  booking,
  reference,
  token,
  onBack,
  onComplete,
}: {
  booking: PublicBooking
  reference: string
  token: string
  onBack: () => void
  onComplete: (booking: PublicBooking) => void
}) {
  const { language } = useLanguage()
  const copy = getBookingCopy(language)
  // Keep the same clock the visitor originally chose. A device timezone change
  // must not make the replacement time look different from the old booking.
  const timezone = booking.timezone
  const today = useMemo(() => dayIn(new Date(), timezone), [timezone])
  const [month, setMonth] = useState(() => startOfMonth(today))
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const slots = useQuery(
    slotsQuery(booking.bookingType.slug, booking.language, {
      from: month === startOfMonth(today) ? today : month,
      to: endOfMonth(month),
      timezone,
    }),
  )
  const reschedule = useRescheduleBooking(reference, token)
  const days = slots.data?.days ?? []
  const availableDays = useMemo(
    () => new Set(days.filter((day) => day.slots.length > 0).map((day) => day.date)),
    [days],
  )
  const daySlots = days.find((day) => day.date === selectedDay)?.slots ?? []

  return (
    <div className="surface-card flex flex-col gap-6 rounded-[1.75rem] p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <p className="text-foreground text-base font-semibold">{copy.manage.rescheduleHeading}</p>
        <p className="text-foreground/58 text-sm leading-7">{copy.manage.rescheduleBody}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <BookingCalendar
          month={month}
          today={today}
          lastBookableDate={slots.data?.lastBookableDate ?? today}
          availableDays={availableDays}
          selectedDay={selectedDay}
          onMonthChange={(next) => {
            setMonth(next)
            setSelectedDay(null)
            setSelectedSlot(null)
          }}
          onSelectDay={(day) => {
            setSelectedDay(day)
            setSelectedSlot(null)
          }}
        />

        <div className="border-border flex min-h-48 flex-col gap-4 rounded-[1.4rem] border p-5">
          {slots.isPending ? (
            <p className="text-foreground/55 text-sm">{copy.calendar.loading}</p>
          ) : slots.isError ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-destructive text-sm">{copy.calendar.failed}</p>
              <Button type="button" variant="outline" onClick={() => void slots.refetch()}>
                {copy.calendar.retry}
              </Button>
            </div>
          ) : availableDays.size === 0 ? (
            <p className="text-foreground/55 text-sm">{copy.calendar.noneThisMonth}</p>
          ) : selectedDay === null ? (
            <p className="text-foreground/55 text-sm">{copy.calendar.pickDay}</p>
          ) : (
            <SlotPicker
              day={selectedDay}
              slots={daySlots}
              timezone={timezone}
              selected={selectedSlot}
              onSelect={setSelectedSlot}
            />
          )}
        </div>
      </div>

      {reschedule.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {(reschedule.error as Error).message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          className="w-fit rounded-full"
          disabled={!selectedSlot || reschedule.isPending}
          onClick={() => {
            if (!selectedSlot) return
            reschedule.mutate({ startsAt: selectedSlot, timezone }, { onSuccess: onComplete })
          }}
        >
          <CalendarCheck aria-hidden="true" className="size-4" />
          {reschedule.isPending ? copy.manage.rescheduling : copy.manage.reschedulePick}
        </Button>
        <Button type="button" variant="outline" className="rounded-full" onClick={onBack}>
          {copy.manage.back}
        </Button>
      </div>
    </div>
  )
}

function RescheduledBooking({ booking }: { booking: PublicBooking }) {
  const { language } = useLanguage()
  const copy = getBookingCopy(language)

  return (
    <div className="surface-card flex flex-col gap-5 rounded-[1.75rem] p-6 sm:p-8">
      <span className="brand-mark text-primary w-fit">
        <Check aria-hidden="true" className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-heading text-foreground text-2xl font-semibold">{copy.manage.rescheduled}</p>
        <p className="text-foreground/58 text-sm">
          {formatDateTime(booking.startsAt, booking.timezone, language)}
        </p>
      </div>
      {booking.manageToken ? (
        <Button asChild variant="outline" className="w-fit rounded-full">
          <Link
            to="/$lang/booking/manage/$reference"
            params={{ lang: language, reference: booking.reference }}
            hash={`token=${encodeURIComponent(booking.manageToken)}`}
          >
            <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
            {copy.manage.viewNewBooking}
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
      <dd className="text-foreground text-sm font-semibold">{value}</dd>
    </div>
  )
}
