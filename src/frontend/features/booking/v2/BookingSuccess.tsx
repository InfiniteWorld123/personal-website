import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, Check, Copy, Video } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { getBookingCopy } from '../booking-copy'
import type { BookingReceipt } from './api'
import { readFragmentToken } from './api'
import { getBookingV2Copy } from './booking-v2-copy'
import { formatWhen, sitePath } from './format'

/**
 * The page a visitor lands on once the time is theirs: the details, what
 * happens next for the way they chose to meet, and the private link — which
 * is also in the confirmation email, unless that email could not be sent, in
 * which case this page says so and the link is the one thing to keep.
 */
export function BookingSuccess({
  receipt,
  durationMinutes,
  timeZone,
  phone,
}: {
  receipt: BookingReceipt
  durationMinutes: number
  timeZone: string
  phone: string
}) {
  const { language } = useLanguage()
  const legacy = getBookingCopy(language)
  const copy = getBookingV2Copy(language).success
  const words = getBookingV2Copy(language)
  const { appointment } = receipt
  const manage = sitePath(receipt.manageUrl)
  const room = receipt.roomUrl ? sitePath(receipt.roomUrl) : null
  const token = readFragmentToken(manage.hash)
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)
  const link = `${origin}${manage.path}#${manage.hash}`

  useEffect(() => setOrigin(window.location.origin), [])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="brand-mark text-primary w-fit">
          <Check aria-hidden="true" className="size-5" />
        </span>
        <h2 className="font-heading text-foreground mt-2 text-2xl font-semibold">{copy.heading}</h2>
        {receipt.confirmationSent ? <p className="text-foreground/58 m-0 text-sm leading-7">{copy.body}</p> : null}
      </div>

      {receipt.confirmationSent ? null : (
        <p role="status" className="flex items-start gap-3 rounded-[1.2rem] border border-amber-500/35 bg-amber-500/10 p-4 text-sm leading-7 text-amber-900 dark:text-amber-200">
          <AlertTriangle aria-hidden="true" className="mt-1 size-4 shrink-0" />
          {copy.noEmail}
        </p>
      )}

      <div className="surface-card flex flex-col gap-6 rounded-[1.75rem] p-6 sm:p-8">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label={copy.when} value={formatWhen(appointment.startsAt, timeZone, language)} />
          <Detail label={copy.duration} value={`${durationMinutes} ${legacy.minutes} · ${appointment.typeName}`} />
          <Detail label={copy.way} value={words.methods[appointment.method]} />
          <Detail label={copy.reference} value={appointment.reference} ltr />
        </dl>

        {appointment.method === 'video' && room ? (
          <div className="cancel-offer flex flex-col items-start gap-3 rounded-[1.2rem] p-4">
            <p className="text-foreground m-0 text-sm font-semibold">{copy.roomTitle}</p>
            <p className="text-foreground/70 m-0 text-sm leading-7">{copy.roomBody}</p>
            <Button asChild size="sm" className="rounded-full">
              <Link to="/$lang/booking/room/$reference" params={{ lang: language, reference: appointment.reference }} hash={room.hash}>
                <Video aria-hidden="true" className="size-4" />
                {copy.openRoom}
              </Link>
            </Button>
          </div>
        ) : (
          <p className="cancel-offer m-0 rounded-[1.2rem] p-4 text-sm leading-7">
            {appointment.method === 'phone' ? <PhoneSentence sentence={copy.phoneCall} phone={phone} /> : copy.inPerson}
          </p>
        )}

        <div className="border-border flex flex-col gap-2 border-t pt-6">
          <p className="text-foreground m-0 text-sm font-semibold">{copy.manageLink}</p>
          <div className="border-border flex flex-wrap items-center gap-3 rounded-[1.1rem] border border-dashed px-4 py-3" dir="ltr">
            <Link
              to="/$lang/booking/manage/$reference"
              params={{ lang: language, reference: appointment.reference }}
              hash={token}
              className="text-foreground min-w-0 flex-1 truncate text-sm font-medium"
            >
              {origin ? link : `${manage.path}#…`}
            </Link>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                void navigator.clipboard?.writeText(link).then(() => setCopied(true), () => setCopied(false))
              }}
            >
              <Copy aria-hidden="true" className="size-3.5" />
              {copied ? copy.copied : copy.copy}
            </Button>
          </div>
          <p className="text-foreground/50 m-0 text-xs">{copy.keepLink}</p>
          <span className="sr-only" aria-live="polite">
            {copied ? copy.copied : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * The number sits in its own left-to-right island and never breaks: inside
 * Arabic text a bare "+49 170 1234567" is reordered into nonsense.
 */
function PhoneSentence({ sentence, phone }: { sentence: (phone: string) => string; phone: string }) {
  const [before, after = ''] = sentence('\u0000').split('\u0000')

  return (
    <>
      {before}
      <bdi dir="ltr" className="whitespace-nowrap">
        {phone}
      </bdi>
      {after}
    </>
  )
}

export function Detail({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-foreground/45 text-[0.7rem] font-semibold tracking-[0.18em] uppercase rtl:tracking-normal">{label}</dt>
      <dd className="text-foreground m-0 text-sm font-semibold">{ltr ? <span dir="ltr">{value}</span> : value}</dd>
    </div>
  )
}
