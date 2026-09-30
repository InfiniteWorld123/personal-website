import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Mail, Phone, Video } from 'lucide-react'
import type { VideoPreflight } from '#/backend2/contracts/booking.contract'
import { Container } from '#/frontend/components/layout/public/Container'
import { Button } from '#/frontend/components/ui/button'
import { getSite } from '#/frontend/content'
import { dayIn, detectTimezone, formatDay, formatTime } from '#/frontend/features/booking/booking-time'
import { errorCode, videoPreflight } from '#/frontend/features/booking/v2/api'
import { type BookingV2Copy, getBookingV2Copy } from '#/frontend/features/booking/v2/booking-v2-copy'
import { zoneLabel } from '#/frontend/features/booking/v2/format'
import { useLanguage } from '#/frontend/i18n/language-provider'

/**
 * The visitor's video link, served by Backend2 (approved choice 5A).
 *
 * Video appointments meet in the owner's fixed Google Meet room: before and
 * during the appointment the page shows the time, a countdown on the day and
 * the way into Meet. Without a Meet room set, it says plainly that the call
 * cannot open here and offers email and phone instead. The in-site call was
 * removed on 1 Oct 2026 (`docs/v2/booking.md`, "Future: our own video system").
 */

type Phase = 'room' | 'ended' | 'closed' | 'cancelled' | 'not_video' | 'invalid'

const phaseOf = (state: VideoPreflight['state']): Phase => (state === 'early' || state === 'open' ? 'room' : state)

export function BookingRoomPageV2({ reference, token }: { reference: string; token: string }) {
  const { language } = useLanguage()
  const copy = getBookingV2Copy(language)
  const preflight = useQuery({
    queryKey: ['booking-v2', 'preflight', reference],
    queryFn: () => videoPreflight(reference, token),
    enabled: token.length > 0,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const code = errorCode(preflight.error)
  const current: Phase | null =
    token.length === 0 || code === 'BOOKING_LINK_INVALID'
      ? 'invalid'
      : code === 'NOT_VIDEO'
        ? 'not_video'
        : preflight.data
          ? phaseOf(preflight.data.state)
          : null

  return (
    <section className="py-section lg:py-section-lg">
      <Container>
        <div
          className="mx-auto flex w-full max-w-4xl flex-col items-center gap-6 rounded-[1.9rem] border border-transparent bg-[#0b1020] px-5 py-12 text-center text-[#c9d3ec] sm:px-10 dark:border-white/10 dark:bg-[#111a2e]"
          aria-live="polite"
        >
          {current === null ? (
            preflight.isError ? (
              <>
                <p className="m-0 text-sm">{copy.room.failed}</p>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => void preflight.refetch()}>
                  {copy.room.retry}
                </Button>
              </>
            ) : (
              <p className="m-0 text-sm">{copy.room.checking}</p>
            )
          ) : current === 'room' && preflight.data?.meetLink ? (
            <MeetRoom preflight={preflight.data} link={preflight.data.meetLink} copy={copy} />
          ) : current === 'room' ? (
            <Message title={copy.room.unavailableTitle} body={copy.room.unavailableBody} contact />
          ) : current === 'ended' ? (
            <Message title={copy.room.ended} body={copy.room.endedBody} />
          ) : current === 'closed' ? (
            <Message title={copy.room.closed} body={copy.room.closedBody} />
          ) : current === 'cancelled' ? (
            <Message title={copy.room.cancelled} body="">
              <Button asChild className="rounded-full">
                <Link to="/$lang/booking" params={{ lang: language }}>
                  {copy.room.bookAgain}
                </Link>
              </Button>
            </Message>
          ) : current === 'not_video' ? (
            <Message title={copy.room.notVideo} body="">
              <Button asChild className="rounded-full">
                <Link to="/$lang/booking/manage/$reference" params={{ lang: language, reference }} hash={token}>
                  {copy.room.toBooking}
                </Link>
              </Button>
            </Message>
          ) : (
            <Message title={copy.room.invalid} body="" />
          )}
        </div>
      </Container>
    </section>
  )
}

function Message({ title, body, contact, children }: { title: string; body: string; contact?: boolean; children?: ReactNode }) {
  return (
    <>
      <h1 className="font-heading m-0 text-2xl font-semibold text-[#edf3ff] sm:text-3xl">{title}</h1>
      {body ? <p className="m-0 max-w-[56ch] text-sm leading-7">{body}</p> : null}
      {contact ? <ContactOptions /> : null}
      {children}
    </>
  )
}

/** Email always; the phone only when the site publishes a number. */
function ContactOptions() {
  const { language } = useLanguage()
  const copy = getBookingV2Copy(language).room
  const site = getSite()

  return (
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild className="rounded-full">
            <a href={`mailto:${site.email}`}>
              <Mail aria-hidden="true" className="size-4" />
              {copy.emailMe}
              <span dir="ltr" className="font-normal opacity-80">
                {site.email}
              </span>
            </a>
          </Button>
          {site.phone ? (
            <Button asChild variant="outline" className="rounded-full">
              <a href={`tel:${site.phone.replace(/[^+\d]/gu, '')}`}>
                <Phone aria-hidden="true" className="size-4" />
                {copy.callMe}
                <span dir="ltr" className="font-normal opacity-80">
                  {site.phone}
                </span>
              </a>
            </Button>
          ) : null}
        </div>
  )
}

/**
 * The call runs in the owner's fixed Google Meet room: the time, a countdown
 * on the day, and the way in. Meet asks the owner to admit the visitor.
 */
function MeetRoom({ preflight, link, copy }: { preflight: VideoPreflight; link: string; copy: BookingV2Copy }) {
  const { language } = useLanguage()
  const [timezone] = useState(detectTimezone)
  const [offset] = useState(() => Date.parse(preflight.serverTime) - Date.now())
  const [remaining, setRemaining] = useState(() => Date.parse(preflight.startsAt) - (Date.now() + offset))

  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(Date.parse(preflight.startsAt) - (Date.now() + offset)), 1000)

    return () => window.clearInterval(timer)
  }, [preflight.startsAt, offset])

  return (
    <>
      <h1 className="font-heading m-0 text-2xl font-semibold text-[#edf3ff] sm:text-3xl">{copy.room.meetTitle}</h1>
      <p className="m-0 text-sm">
        {copy.room.startsAt}{' '}
        <b className="text-[#edf3ff]">{formatTime(preflight.startsAt, timezone, language)}</b> ·{' '}
        {formatDay(dayIn(new Date(preflight.startsAt), timezone), language)} ({zoneLabel(timezone)})
      </p>
      {remaining > 0 && remaining < 86_400_000 ? (
        <p className="font-heading tabular m-0 text-4xl font-semibold text-[#edf3ff]" aria-label={`${copy.room.countdown} ${countdown(remaining)}`}>
          <span aria-hidden="true">{countdown(remaining)}</span>
        </p>
      ) : null}
      <p className="m-0 max-w-[52ch] text-sm leading-7">{copy.room.meetBody}</p>
      <Button asChild size="lg" className="rounded-full">
        <a href={link} target="_blank" rel="noopener noreferrer">
          <Video aria-hidden="true" className="size-4" />
          {copy.room.meetOpen}
        </a>
      </Button>
    </>
  )
}

/** `12:40`, or `1:02:05` from an hour out. */
export const countdown = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const two = (value: number) => String(value).padStart(2, '0')

  if (hours > 0) return `${hours}:${two(minutes)}:${two(seconds)}`

  return `${two(minutes)}:${two(seconds)}`
}
