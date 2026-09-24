import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarCheck, CalendarClock, Check, Video } from 'lucide-react'
import type { VisitorAppointment } from '#/backend2/contracts/booking.contract'
import { Container } from '#/frontend/components/layout/public/Container'
import { Eyebrow } from '#/frontend/components/layout/public/Section'
import { Button } from '#/frontend/components/ui/button'
import { BookingCalendar } from '#/frontend/features/booking/BookingCalendar'
import { SlotPicker } from '#/frontend/features/booking/SlotPicker'
import { getBookingCopy } from '#/frontend/features/booking/booking-copy'
import { addMonths, dayIn, detectTimezone, endOfMonth, formatDateTime, startOfMonth } from '#/frontend/features/booking/booking-time'
import { cancelAppointment, errorCode, rescheduleAppointment } from '#/frontend/features/booking/v2/api'
import { Detail } from '#/frontend/features/booking/v2/BookingSuccess'
import { getBookingV2Copy } from '#/frontend/features/booking/v2/booking-v2-copy'
import { CancelFormV2 } from '#/frontend/features/booking/v2/CancelFormV2'
import { formatWhen, zoneLabel } from '#/frontend/features/booking/v2/format'
import { v2AppointmentQuery, v2SlotsQuery } from '#/frontend/features/booking/v2/queries'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { SplitWords, useReveal } from '#/frontend/motion'

type Mode = 'view' | 'move' | 'cancel'

/**
 * The private page behind the emailed link, read from Backend2. The link's
 * credential authorises it; the reference alone opens nothing, and a wrong
 * credential reads exactly like an unknown booking.
 *
 * Changing or cancelling stops at the owner's limit before the start (12 hours
 * by default); after that the page says to reply to the confirmation email.
 */
export function BookingManagePageV2({ reference, token }: { reference: string; token: string }) {
  const { language } = useLanguage()
  const copy = getBookingCopy(language)
  const words = getBookingV2Copy(language)
  const ref = useReveal<HTMLElement>()
  const queryClient = useQueryClient()
  const appointment = useQuery(v2AppointmentQuery(reference, token))
  const [timezone] = useState(detectTimezone)
  const [mode, setMode] = useState<Mode>('view')
  const [notice, setNotice] = useState<'moved' | 'cancelled' | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const invalidLink = token.length === 0 || errorCode(appointment.error) === 'BOOKING_LINK_INVALID'

  const settle = (next: VisitorAppointment) => queryClient.setQueryData(v2AppointmentQuery(reference, token).queryKey, next)

  const cancel = async (input: Parameters<typeof cancelAppointment>[2]) => {
    setCancelling(true)
    setFailure(null)

    try {
      settle(await cancelAppointment(reference, token, input))
      setNotice('cancelled')
      setMode('view')
    } catch (error) {
      if (errorCode(error) === 'CHANGE_DEADLINE_PASSED' || errorCode(error) === 'CONFLICT') {
        await appointment.refetch()
        setMode('view')
      } else {
        setFailure(words.manage.failed)
      }
    } finally {
      setCancelling(false)
    }
  }

  return (
    <section ref={ref} data-reveal-scope="" className="py-section lg:py-section-lg">
      <Container className="flex max-w-2xl flex-col gap-8">
        <div className="flex flex-col">
          <Eyebrow data-reveal>{copy.eyebrow}</Eyebrow>
          <h1 className="section-title text-display-lg text-foreground mt-5">
            <SplitWords text={copy.manage.heading} />
          </h1>
        </div>

        {invalidLink ? (
          <ErrorBox message={copy.manage.notFound} />
        ) : appointment.isPending ? (
          <p className="text-foreground/55 text-sm">{copy.manage.loading}</p>
        ) : appointment.isError ? (
          <ErrorBox message={copy.manage.failed} onRetry={() => void appointment.refetch()} retry={copy.manage.retry} />
        ) : (
          <ManageView
            appointment={appointment.data}
            token={token}
            timezone={timezone}
            mode={mode}
            notice={notice}
            failure={failure}
            cancelling={cancelling}
            onMode={(next) => {
              setFailure(null)
              setNotice(null)
              setMode(next)
            }}
            onMoved={(next) => {
              settle(next)
              setNotice('moved')
              setMode('view')
            }}
            onDeadline={() => {
              void appointment.refetch()
              setMode('view')
            }}
            onCancel={cancel}
          />
        )}
      </Container>
    </section>
  )
}

function ManageView({
  appointment,
  token,
  timezone,
  mode,
  notice,
  failure,
  cancelling,
  onMode,
  onMoved,
  onDeadline,
  onCancel,
}: {
  appointment: VisitorAppointment
  token: string
  timezone: string
  mode: Mode
  notice: 'moved' | 'cancelled' | null
  failure: string | null
  cancelling: boolean
  onMode: (mode: Mode) => void
  onMoved: (next: VisitorAppointment) => void
  onDeadline: () => void
  onCancel: (input: Parameters<typeof cancelAppointment>[2]) => Promise<void>
}) {
  const { language } = useLanguage()
  const copy = getBookingCopy(language)
  const words = getBookingV2Copy(language)
  const now = Date.now()
  const isPast = Date.parse(appointment.endsAt) < now
  const confirmed = appointment.status === 'confirmed'
  const hoursBefore = Math.max(1, Math.round((Date.parse(appointment.startsAt) - Date.parse(appointment.changeDeadline)) / 3_600_000))
  const tooLate = confirmed && !isPast && !appointment.canChange

  return (
    <div className="flex flex-col gap-6">
      {notice ? (
        <p role="status" className="m-0 flex items-start gap-3 rounded-[1.2rem] border border-emerald-500/35 bg-emerald-500/10 p-4 text-sm leading-7 text-emerald-900 dark:text-emerald-200">
          <Check aria-hidden="true" className="mt-1 size-4 shrink-0" />
          {notice === 'moved' ? words.manage.moved : words.manage.cancelledNow}
        </p>
      ) : null}

      <div className="surface-card flex flex-col gap-6 rounded-[1.75rem] p-6 sm:p-8">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label={copy.manage.when} value={formatWhen(appointment.startsAt, timezone, language)} />
          <Detail label={words.manage.way} value={`${words.methods[appointment.method]} · ${appointment.typeName}`} />
          <div className="flex flex-col gap-1">
            <dt className="text-foreground/45 text-[0.7rem] font-semibold tracking-[0.18em] uppercase rtl:tracking-normal">
              {copy.manage.status}
            </dt>
            <dd className="m-0">
              <span
                className={
                  confirmed
                    ? 'inline-flex rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300'
                    : 'bg-secondary text-foreground/70 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold'
                }
              >
                {words.status[appointment.status]}
              </span>
            </dd>
          </div>
          <Detail label={words.success.reference} value={appointment.reference} ltr />
        </dl>

        {appointment.method === 'video' && confirmed && !isPast ? (
          <div className="cancel-offer flex flex-col items-start gap-3 rounded-[1.2rem] p-4">
            <p className="text-foreground m-0 text-sm font-semibold">{words.manage.videoTitle}</p>
            <p className="text-foreground/70 m-0 text-sm leading-7">{words.manage.videoBody}</p>
            <Button asChild size="sm" className="rounded-full">
              <Link to="/$lang/booking/room/$reference" params={{ lang: language, reference: appointment.reference }} hash={token}>
                <Video aria-hidden="true" className="size-4" />
                {words.manage.openRoom}
              </Link>
            </Button>
          </div>
        ) : null}

        {appointment.status === 'cancelled' ? (
          <div className="flex flex-col items-start gap-4">
            {notice === 'cancelled' ? null : <p className="text-foreground/58 m-0 text-sm">{copy.manage.cancelled}</p>}
            <Button asChild className="rounded-full">
              <Link to="/$lang/booking" params={{ lang: language }}>
                <CalendarClock aria-hidden="true" className="size-4" />
                {copy.manage.bookAgain}
              </Link>
            </Button>
          </div>
        ) : isPast ? (
          <p className="text-foreground/58 m-0 text-sm">{copy.manage.alreadyPast}</p>
        ) : tooLate ? (
          <p className="m-0 flex items-start gap-3 rounded-[1.2rem] border border-amber-500/35 bg-amber-500/10 p-4 text-sm leading-7 text-amber-900 dark:text-amber-200">
            <AlertTriangle aria-hidden="true" className="mt-1 size-4 shrink-0" />
            {words.manage.deadlinePassed(hoursBefore)}
          </p>
        ) : confirmed ? (
          <>
            <p className="text-foreground/58 m-0 text-sm">
              {words.manage.deadline(`${formatDateTime(appointment.changeDeadline, timezone, language)} (${zoneLabel(timezone)})`)}
            </p>

            {mode === 'view' ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" className="rounded-full" onClick={() => onMode('move')}>
                  <CalendarClock aria-hidden="true" className="size-4" />
                  {words.manage.move}
                </Button>
                <Button type="button" variant="ghost" className="rounded-full" onClick={() => onMode('cancel')}>
                  {words.manage.cantMake}
                </Button>
              </div>
            ) : null}

            {mode === 'move' ? (
              <MovePanel appointment={appointment} token={token} timezone={timezone} onBack={() => onMode('view')} onMoved={onMoved} onDeadline={onDeadline} />
            ) : null}

            {mode === 'cancel' ? (
              <CancelFormV2
                pending={cancelling}
                failure={failure}
                onCancel={onCancel}
                onKeep={() => onMode('view')}
                onMoveInstead={appointment.typeSlug ? () => onMode('move') : null}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}

function MovePanel({
  appointment,
  token,
  timezone,
  onBack,
  onMoved,
  onDeadline,
}: {
  appointment: VisitorAppointment
  token: string
  timezone: string
  onBack: () => void
  onMoved: (next: VisitorAppointment) => void
  onDeadline: () => void
}) {
  const { language } = useLanguage()
  const copy = getBookingCopy(language)
  const words = getBookingV2Copy(language)
  const queryClient = useQueryClient()
  const today = useMemo(() => dayIn(new Date(), timezone), [timezone])
  const [month, setMonth] = useState(() => startOfMonth(today))
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const slots = useQuery({
    ...v2SlotsQuery({
      slug: appointment.typeSlug ?? '',
      method: appointment.method,
      from: month === startOfMonth(today) ? today : month,
      to: endOfMonth(month),
      timeZone: timezone,
      language,
    }),
    enabled: Boolean(appointment.typeSlug),
  })
  const days = slots.data?.days ?? []
  const availableDays = useMemo(
    () => new Set(days.filter((day) => day.slots.some((slot) => slot.startsAt !== appointment.startsAt)).map((day) => day.date)),
    [days, appointment.startsAt],
  )
  const daySlots = (days.find((day) => day.date === selectedDay)?.slots ?? []).filter((slot) => slot.startsAt !== appointment.startsAt)

  if (!appointment.typeSlug) {
    return (
      <div className="border-border flex flex-col items-start gap-3 border-t pt-6">
        <p className="text-foreground/58 m-0 text-sm leading-7">{words.manage.typeGone}</p>
        <Button type="button" variant="outline" className="rounded-full" onClick={onBack}>
          {copy.manage.back}
        </Button>
      </div>
    )
  }

  const confirm = async () => {
    if (!selectedSlot || saving) return

    setSaving(true)
    setProblem(null)

    try {
      onMoved(await rescheduleAppointment(appointment.reference, token, { startsAt: selectedSlot, timeZone: timezone }))
      void queryClient.invalidateQueries({ queryKey: ['booking-v2', 'slots'] })
    } catch (error) {
      const code = errorCode(error)

      if (code === 'CHANGE_DEADLINE_PASSED') return onDeadline()

      if (code === 'SLOT_UNAVAILABLE' || code === 'BOOKING_TOO_SOON' || code === 'BOOKING_TOO_FAR') {
        setProblem(code === 'SLOT_UNAVAILABLE' ? words.taken : words.tooSoon)
        setSelectedSlot(null)
        void queryClient.invalidateQueries({ queryKey: ['booking-v2', 'slots'] })
      } else {
        setProblem(words.manage.failed)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-border flex flex-col gap-6 border-t pt-6">
      <p className="text-foreground m-0 text-base font-semibold">{words.manage.newTime}</p>

      {problem ? (
        <p role="alert" className="text-destructive m-0 text-sm">
          {problem}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <BookingCalendar
          month={month}
          today={today}
          lastBookableDate={slots.data?.moreAfter ? addMonths(month, 1) : month}
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

        <div className="border-border flex min-h-48 flex-col gap-4 rounded-[1.4rem] border p-5 lg:h-full lg:min-h-0">
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
            <SlotPicker day={selectedDay} slots={daySlots} timezone={timezone} selected={selectedSlot} onSelect={setSelectedSlot} />
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" className="rounded-full" disabled={!selectedSlot || saving} aria-busy={saving} onClick={() => void confirm()}>
          <CalendarCheck aria-hidden="true" className="size-4" />
          {saving ? copy.manage.rescheduling : words.manage.confirmMove}
        </Button>
        <Button type="button" variant="outline" className="rounded-full" disabled={saving} onClick={onBack}>
          {copy.manage.back}
        </Button>
      </div>
    </div>
  )
}

function ErrorBox({ message, onRetry, retry }: { message: string; onRetry?: () => void; retry?: string }) {
  return (
    <div className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-3 rounded-[1.4rem] border p-6">
      <p role="alert" className="text-destructive m-0 text-sm">
        {message}
      </p>
      {onRetry ? (
        <Button type="button" variant="outline" onClick={onRetry}>
          {retry}
        </Button>
      ) : null}
    </div>
  )
}
