import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, Mail, Phone, X } from 'lucide-react'
import type { VideoPreflight } from '#/backend2/contracts/booking.contract'
import { Container } from '#/frontend/components/layout/public/Container'
import { Button } from '#/frontend/components/ui/button'
import { getSite } from '#/frontend/content'
import { dayIn, detectTimezone, formatDay, formatTime } from '#/frontend/features/booking/booking-time'
import { errorCode, videoJoin, videoPreflight } from '#/frontend/features/booking/v2/api'
import { type BookingV2Copy, getBookingV2Copy } from '#/frontend/features/booking/v2/booking-v2-copy'
import { zoneLabel } from '#/frontend/features/booking/v2/format'
import { callCopy } from '#/frontend/features/call/call-copy'
import { useMedia } from '#/frontend/features/call/use-media'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { cn } from '#/frontend/lib/utils'

/**
 * The visitor's video link, served by Backend2 (approved choice 5A).
 *
 * Before the start: a waiting room with a countdown and a camera and
 * microphone check, then the call opens by itself. The call screen itself
 * needs Cloudflare RealtimeKit, which is not switched on — so at the start
 * this page says so plainly and offers email and phone instead. It never
 * pretends to hold a call it cannot hold. Nothing is recorded or sent while
 * the camera preview runs; the preview stays in this browser.
 */

type Phase = 'waiting' | 'entering' | 'unavailable' | 'ended' | 'closed' | 'cancelled' | 'not_video' | 'invalid'

const phaseOf = (state: VideoPreflight['state']): Phase =>
  state === 'early' ? 'waiting' : state === 'open' ? 'entering' : state

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
  const [phase, setPhase] = useState<Phase | null>(null)
  const joining = useRef(false)
  const refetchPreflight = preflight.refetch

  const code = errorCode(preflight.error)
  const current: Phase | null =
    token.length === 0 || code === 'BOOKING_LINK_INVALID'
      ? 'invalid'
      : code === 'NOT_VIDEO'
        ? 'not_video'
        : (phase ?? (preflight.data ? phaseOf(preflight.data.state) : null))

  useEffect(() => {
    if (current !== 'entering' || joining.current) return

    joining.current = true
    videoJoin(reference, token)
      // A seat was issued, but the screen that would hold the call waits for
      // RealtimeKit. Saying so is the honest answer; a fake call is not.
      .then(() => setPhase('unavailable'))
      .catch((error: unknown) => {
        const refused = errorCode(error)

        // Still early by the server's clock: wait again from a fresh reading of it.
        if (refused === 'VIDEO_NOT_OPEN') {
          setPhase(null)
          void refetchPreflight()

          return
        }

        setPhase(refused === 'VIDEO_CLOSED' ? 'closed' : 'unavailable')
      })
      .finally(() => {
        joining.current = false
      })
  }, [current, reference, token, refetchPreflight])

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
              <p className="m-0 text-sm">{callCopy[language].lobby.checking}</p>
            )
          ) : current === 'waiting' && preflight.data ? (
            <WaitingRoom preflight={preflight.data} copy={copy} onStart={() => setPhase('entering')} />
          ) : current === 'entering' ? (
            <p className="m-0 text-sm">{copy.room.entering}</p>
          ) : current === 'unavailable' ? (
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
 * The countdown runs on the server's clock, not the visitor's: a laptop five
 * minutes wrong would otherwise open the room early or leave them waiting.
 */
function WaitingRoom({ preflight, copy, onStart }: { preflight: VideoPreflight; copy: BookingV2Copy; onStart: () => void }) {
  const { language } = useLanguage()
  const [timezone] = useState(detectTimezone)
  const [offset] = useState(() => Date.parse(preflight.serverTime) - Date.now())
  const [remaining, setRemaining] = useState(() => Date.parse(preflight.startsAt) - (Date.now() + offset))
  const media = useMedia(callCopy[language])
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const tick = () => {
      const left = Date.parse(preflight.startsAt) - (Date.now() + offset)

      setRemaining(left)
      if (left <= 0) onStart()
    }
    const timer = window.setInterval(tick, 1000)

    return () => window.clearInterval(timer)
  }, [preflight.startsAt, offset, onStart])

  useEffect(() => {
    if (video.current) video.current.srcObject = media.stream

    return () => {
      if (video.current) video.current.srcObject = null
    }
  }, [media.stream])

  const blocked = media.status === 'failed'
  const hasVideo = (media.stream?.getVideoTracks().length ?? 0) > 0
  const hasAudio = (media.stream?.getAudioTracks().length ?? 0) > 0

  return (
    <>
      <h1 className="font-heading m-0 text-2xl font-semibold text-[#edf3ff] sm:text-3xl">{blocked ? copy.room.permTitle : copy.room.early}</h1>
      <p className="m-0 text-sm">
        {copy.room.startsAt}{' '}
        <b className="text-[#edf3ff]">{formatTime(preflight.startsAt, timezone, language)}</b> ·{' '}
        {formatDay(dayIn(new Date(preflight.startsAt), timezone), language)} ({zoneLabel(timezone)})
      </p>
      {/* A countdown only on the day: "3 days" is not news a clock can tell. */}
      {remaining < 86_400_000 ? (
        <p className="font-heading tabular m-0 text-4xl font-semibold text-[#edf3ff]" aria-label={`${copy.room.countdown} ${countdown(remaining)}`}>
          <span aria-hidden="true">{countdown(remaining)}</span>
        </p>
      ) : null}

      <div className="relative aspect-video w-full max-w-xl overflow-hidden rounded-[1.4rem] bg-[#172036]">
        <video ref={video} autoPlay playsInline muted className={cn('h-full w-full scale-x-[-1] object-cover', hasVideo ? '' : 'invisible')} />
      </div>

      {blocked ? (
        <>
          <div className="flex flex-wrap justify-center gap-2">
            <Check_ ok={false} label={copy.room.camBlocked} />
            <Check_ ok={false} label={copy.room.micBlocked} />
          </div>
          <p className="m-0 max-w-[56ch] text-sm leading-7">{copy.room.permBody}</p>
          <ContactOptions />
        </>
      ) : media.status === 'starting' ? (
        <p className="m-0 text-sm">{copy.room.checking}</p>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          <Check_ ok={hasVideo} label={copy.room.camOk} />
          <Check_ ok={hasAudio} label={copy.room.micOk} />
        </div>
      )}

      <p className="m-0 max-w-[52ch] text-sm leading-7">{copy.room.autoEnter}</p>
    </>
  )
}

function Check_({ ok, label }: { ok: boolean; label: string }) {
  const Icon = ok ? Check : X

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
        ok ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300',
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
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
