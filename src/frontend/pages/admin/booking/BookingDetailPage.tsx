import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowLeft, CalendarX, Check, UserX, Video } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/frontend/components/ui/alert-dialog'
import { Badge } from '#/frontend/components/ui/badge'
import { Button } from '#/frontend/components/ui/button'
import { Textarea } from '#/frontend/components/ui/textarea'
import {
  adminBookingQuery,
  useCancelBookingAsAdmin,
  useSetBookingStatus,
} from '#/frontend/features/booking/booking-queries'
import { isCallOpen } from '#/shared/types/call.types'

const BERLIN = 'Europe/Berlin'

const format = (instant: string, timeZone: string) =>
  new Intl.DateTimeFormat('de-DE', { timeZone, dateStyle: 'full', timeStyle: 'short' }).format(
    new Date(instant),
  )

export function BookingDetailPage({ id }: { id: string }) {
  const booking = useQuery(adminBookingQuery(id))
  const cancel = useCancelBookingAsAdmin(id)
  const setStatus = useSetBookingStatus(id)

  const [isCancelOpen, setIsCancelOpen] = useState(false)
  const [reason, setReason] = useState('')

  if (booking.isPending) {
    return <p className="text-muted-foreground py-12 text-center text-sm">Loading booking…</p>
  }

  if (booking.isError) {
    return (
      <div className="border-destructive/40 bg-destructive/5 mx-auto max-w-3xl rounded-lg border p-6">
        <p className="text-destructive text-sm">{(booking.error as Error).message}</p>
      </div>
    )
  }

  const detail = booking.data
  const isPast = Date.parse(detail.startsAt) < Date.now()
  const isOpen = detail.status === 'CONFIRMED'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/admin/bookings">
          <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
          All bookings
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{detail.visitorName}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {detail.bookingTypeName} · <span className="tabular">{detail.reference}</span>
          </p>
        </div>
        <Badge variant="outline" className="rounded-full">
          {detail.status}
        </Badge>
      </div>

      <dl className="border-border grid gap-5 rounded-lg border p-6 sm:grid-cols-2">
        <Row label="When (Berlin)" value={format(detail.startsAt, BERLIN)} />
        <Row
          label={`When (${detail.visitorTimezone})`}
          value={format(detail.startsAt, detail.visitorTimezone)}
        />
        <Row label="Email" value={detail.visitorEmail} ltr />
        <Row label="Phone" value={detail.visitorPhone ?? '—'} ltr />
        <Row label="Language" value={detail.language.toUpperCase()} />
        {/* On the lead, not on the booking: it belongs to the person, and a
            second booking from the same address finds it again. */}
        {detail.lead?.company ? <Row label="Company" value={detail.lead.company} /> : null}
        {detail.lead?.serviceInterest ? (
          <Row label="About" value={detail.lead.serviceInterest} />
        ) : null}
        {detail.lead?.budgetBand ? <Row label="Budget" value={detail.lead.budgetBand} /> : null}
        {detail.lead?.timeline ? <Row label="Timeline" value={detail.lead.timeline} /> : null}
        <Row
          label="Held from — to (with buffers)"
          value={`${format(detail.blockedStartsAt, BERLIN)} — ${format(detail.blockedEndsAt, BERLIN)}`}
        />
        {detail.rescheduledFromReference ? (
          <Row label="Moved from" value={detail.rescheduledFromReference} />
        ) : null}
        {detail.cancelledAt ? (
          <Row
            label={`Cancelled by ${detail.cancelledBy?.toLowerCase() ?? '—'}`}
            value={`${format(detail.cancelledAt, BERLIN)}${detail.cancellationReason ? ` · ${detail.cancellationReason}` : ''}`}
          />
        ) : null}
      </dl>

      <div className="border-border flex flex-col gap-2 rounded-lg border p-6">
        <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
          What it is about
        </p>
        {detail.visitorNote ? (
          <p className="text-sm leading-7 whitespace-pre-wrap">{detail.visitorNote}</p>
        ) : (
          <p className="text-muted-foreground text-sm">Nothing was written.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Only while the room exists. A call button on a booking three weeks
            out is a button whose only outcome is an error message. */}
        {isCallOpen(detail) ? (
          <Button asChild>
            <Link to="/admin/bookings/$id/room" params={{ id: detail.id }}>
              <Video aria-hidden="true" />
              Join the call
            </Link>
          </Button>
        ) : null}

        {isOpen && isPast ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ status: 'COMPLETED' })}
            >
              <Check aria-hidden="true" />
              Mark as held
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ status: 'NO_SHOW' })}
            >
              <UserX aria-hidden="true" />
              Mark as no show
            </Button>
          </>
        ) : null}

        {isOpen && !isPast ? (
          <Button type="button" variant="outline" onClick={() => setIsCancelOpen(true)}>
            <CalendarX aria-hidden="true" />
            Cancel and tell them
          </Button>
        ) : null}
      </div>

      {setStatus.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {(setStatus.error as Error).message}
        </p>
      ) : null}

      <AlertDialog open={isCancelOpen} onOpenChange={setIsCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              The time goes back on the calendar and {detail.visitorName} is emailed in{' '}
              {detail.language.toUpperCase()}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Textarea
            rows={3}
            placeholder="Reason (optional, not sent)"
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />

          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                cancel.mutate({ reason }, { onSuccess: () => setIsCancelOpen(false) })
              }
            >
              {cancel.isPending ? 'Cancelling…' : 'Cancel booking'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
        {label}
      </dt>
      <dd className="text-sm font-medium" dir={ltr ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  )
}
