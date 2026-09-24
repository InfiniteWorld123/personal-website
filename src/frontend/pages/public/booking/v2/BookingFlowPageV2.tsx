import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarCheck } from 'lucide-react'
import type { BookingMethod } from '#/backend2/contracts/booking.contract'
import { Container } from '#/frontend/components/layout/public/Container'
import { Eyebrow } from '#/frontend/components/layout/public/Section'
import { Button } from '#/frontend/components/ui/button'
import { BookingCalendar } from '#/frontend/features/booking/BookingCalendar'
import { SlotPicker } from '#/frontend/features/booking/SlotPicker'
import { getBookingCopy } from '#/frontend/features/booking/booking-copy'
import { addMonths, dayIn, detectTimezone, endOfMonth, startOfMonth } from '#/frontend/features/booking/booking-time'
import type { BookingReceipt } from '#/frontend/features/booking/v2/api'
import { type BookingFailure, BookingFormV2 } from '#/frontend/features/booking/v2/BookingFormV2'
import { BookingSuccess } from '#/frontend/features/booking/v2/BookingSuccess'
import { getBookingV2Copy } from '#/frontend/features/booking/v2/booking-v2-copy'
import { formatWhen, newSubmissionId } from '#/frontend/features/booking/v2/format'
import { MethodChoice } from '#/frontend/features/booking/v2/MethodChoice'
import { v2SlotsQuery, v2TypesQuery } from '#/frontend/features/booking/v2/queries'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { SplitWords, useReveal } from '#/frontend/motion'
import { type Step, StepRail, TimezoneSelect } from './flow-parts'

/**
 * One appointment type, booked against Backend2 (`docs/v2/public-cutover.md`,
 * step 5). The legacy page's shape and look, with what the approved lab adds:
 * the way to meet before the time (video preselected when allowed), the phone
 * number only for a phone call, a time just taken said plainly, and a success
 * page per way of meeting with the private link.
 */
export function BookingFlowPageV2({ slug, slot }: { slug: string; slot?: string }) {
  const { language } = useLanguage()
  const copy = getBookingCopy(language)
  const words = getBookingV2Copy(language)
  const ref = useReveal<HTMLElement>()
  const queryClient = useQueryClient()
  const types = useQuery(v2TypesQuery(language))
  const type = types.data?.find((item) => item.slug === slug) ?? null

  const [timezone, setTimezone] = useState(detectTimezone)
  const today = useMemo(() => dayIn(new Date(), timezone), [timezone])
  const invited = useMemo(() => (slot ? dayIn(new Date(slot), timezone) : null), [slot, timezone])

  const [method, setMethod] = useState<BookingMethod | null>(null)
  const [month, setMonth] = useState(() => startOfMonth(invited ?? today))
  const [selectedDay, setSelectedDay] = useState<string | null>(invited)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(slot ?? null)
  const [step, setStep] = useState<Step>('time')
  const [unavailable, setUnavailable] = useState<BookingFailure | null>(null)
  const [done, setDone] = useState<{ receipt: BookingReceipt; phone: string } | null>(null)
  // One per form fill: a double press or a retry after a lost answer returns
  // the same appointment, never a second one.
  const [submissionId, setSubmissionId] = useState(newSubmissionId)

  const chosenMethod: BookingMethod | null = type ? (method && type.methods.includes(method) ? method : type.defaultMethod) : null

  const from = month === startOfMonth(today) ? today : month
  const slots = useQuery({
    ...v2SlotsQuery({ slug, method: chosenMethod ?? 'video', from, to: endOfMonth(month), timeZone: timezone, language }),
    enabled: chosenMethod !== null,
  })

  const days = slots.data?.days ?? []
  const availableDays = useMemo(() => new Set(days.filter((day) => day.slots.length > 0).map((day) => day.date)), [days])
  const daySlots = days.find((day) => day.date === selectedDay)?.slots ?? []

  useEffect(() => {
    if (!slots.isSuccess || !selectedSlot) return
    if (!daySlots.some((offered) => offered.startsAt === selectedSlot)) setSelectedSlot(null)
  }, [slots.isSuccess, selectedSlot, daySlots])

  const refreshSlots = () => queryClient.invalidateQueries({ queryKey: ['booking-v2', 'slots'] })

  const title = type?.name ?? copy.title

  return (
    <section ref={ref} data-reveal-scope="" className="py-section lg:py-section-lg">
      <Container className="flex flex-col gap-10">
        <div className="flex max-w-2xl flex-col">
          <Eyebrow data-reveal>{copy.eyebrow}</Eyebrow>
          <h1 className="section-title text-display-lg text-foreground mt-5">
            <SplitWords text={title} />
          </h1>
          {type?.description ? (
            <p data-reveal className="text-foreground/58 mt-5 text-base leading-8">
              {type.description}
            </p>
          ) : null}
        </div>

        <StepRail step={step} />

        {types.isPending ? (
          <p className="text-foreground/55 py-12 text-sm">{copy.calendar.loading}</p>
        ) : types.isError ? (
          <div className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-3 rounded-[1.4rem] border p-6">
            <p className="text-destructive text-sm">{copy.calendar.failed}</p>
            <Button type="button" variant="outline" onClick={() => void types.refetch()}>
              {copy.calendar.retry}
            </Button>
          </div>
        ) : !type || !chosenMethod ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-foreground/58 text-sm">{words.typeMissing}</p>
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/$lang/booking" params={{ lang: language }}>
                {copy.manage.bookAgain}
              </Link>
            </Button>
          </div>
        ) : step === 'done' && done ? (
          <BookingSuccess receipt={done.receipt} durationMinutes={type.durationMinutes} timeZone={timezone} phone={done.phone} />
        ) : step === 'details' && selectedSlot ? (
          <div className="surface-card flex flex-col gap-6 rounded-[1.75rem] p-6 sm:p-8">
            <p className="text-foreground/70 m-0 text-sm">
              <CalendarCheck aria-hidden="true" className="me-2 inline size-4" />
              {formatWhen(selectedSlot, timezone, language)} · {words.methods[chosenMethod]}
            </p>

            <BookingFormV2
              typeSlug={type.slug}
              method={chosenMethod}
              startsAt={selectedSlot}
              timeZone={timezone}
              submissionId={submissionId}
              onBack={() => setStep('time')}
              onBooked={(receipt, values) => {
                setDone({ receipt, phone: values.phone.trim() })
                setStep('done')
                setSubmissionId(newSubmissionId())
                void refreshSlots()
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              onUnavailable={(reason) => {
                setUnavailable(reason)
                setSelectedSlot(null)
                setStep('time')
                void refreshSlots()
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="surface-card rounded-[1.75rem] p-6 sm:p-7">
              <MethodChoice
                methods={type.methods}
                value={chosenMethod}
                onChange={(next) => {
                  setMethod(next)
                  setUnavailable(null)
                }}
              />
            </div>

            {unavailable ? (
              <p role="alert" className="border-destructive/40 bg-destructive/5 text-destructive m-0 flex items-start gap-3 rounded-[1.2rem] border p-4 text-sm leading-7">
                <AlertTriangle aria-hidden="true" className="mt-1 size-4 shrink-0" />
                {unavailable === 'taken' ? words.taken : words.tooSoon}
              </p>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,17rem)] lg:justify-center">
              <div className="flex flex-col gap-4">
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
                    setUnavailable(null)
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
                    <SlotPicker day={selectedDay} slots={daySlots} timezone={timezone} selected={selectedSlot} onSelect={setSelectedSlot} />

                    {selectedSlot ? (
                      <Button type="button" size="lg" className="w-fit rounded-full" onClick={() => setStep('details')}>
                        {copy.pick}
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Container>
    </section>
  )
}
