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
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelBody, PanelHeader, PanelNote, PanelTitle } from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import { Textarea } from '#/frontend/components/ui/textarea'
import {
  adminBookingQuery,
  adminBookingsQuery,
  useCancelBookingAsAdmin,
  useSetBookingStatus,
} from '#/frontend/features/booking/booking-queries'
import { toBookingFilterInput } from '#/frontend/features/booking/booking-filters'
import { usePrefetch } from '#/frontend/lib/prefetch'
import { isCallOpen } from '#/shared/types/call.types'
import { BERLIN, StatusPill, formatOn } from './booking-admin-ui'

/**
 * One call, everything known about it, and the two or three things that can
 * still be done to it.
 *
 * The back link and the title survive the wait now: the page used to replace
 * itself with the word *Loading booking…*, which meant the way out disappeared
 * for as long as the request took.
 */

/** The way back, kept identical on every page under /admin/bookings. */
function BackToBookings() {
  const prefetch = usePrefetch()

  return (
    <Button asChild variant="ghost" size="sm" className="-ms-2 w-fit rounded-full">
      <Link to="/admin/bookings" {...prefetch(adminBookingsQuery(toBookingFilterInput({})))}>
        <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
        All bookings
      </Link>
    </Button>
  )
}

/**
 * The real blocks at their real heights: a panel of paired label/value rows,
 * then the note panel, then the row of actions.
 */
function DetailSkeleton() {
  return (
    <SkeletonScreen className="contents" label="Loading booking">
      {/* The pairs are drawn at the real line heights — a `dt` is 16px and a
          `dd` 20px with a 4px gap — so the panel is the height it will be
          rather than a shorter one that grows when the call arrives. */}
      <Panel>
        <PanelBody className="grid gap-5 px-6 pt-6 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="flex flex-col gap-1" key={index}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-48" />
            </div>
          ))}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <Skeleton className="h-4 w-32" />
        </PanelHeader>
        <PanelBody className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </PanelBody>
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-36 rounded-full" />
        <Skeleton className="h-8 w-40 rounded-full" />
      </div>
    </SkeletonScreen>
  )
}

export function BookingDetailPage({ id }: { id: string }) {
  const booking = useQuery(adminBookingQuery(id))
  const cancel = useCancelBookingAsAdmin(id)
  const setStatus = useSetBookingStatus(id)

  const [isCancelOpen, setIsCancelOpen] = useState(false)
  const [reason, setReason] = useState('')

  if (booking.isPending) {
    return (
      <AdminPage width="narrow">
        <PageHeader
          back={<BackToBookings />}
          title={
            <>
              {/* The heading keeps a name for a screen reader while the real
                  one is still on its way. */}
              <span className="sr-only">Loading booking</span>
              <Skeleton aria-hidden="true" className="h-7 w-56" />
            </>
          }
        />
        <DetailSkeleton />
      </AdminPage>
    )
  }

  if (booking.isError) {
    return (
      <AdminPage width="narrow">
        <PageHeader back={<BackToBookings />} title="Booking" />
        <Panel>
          <PanelNote tone="error">
            <p>{(booking.error as Error).message}</p>
          </PanelNote>
        </Panel>
      </AdminPage>
    )
  }

  const detail = booking.data
  const isPast = Date.parse(detail.startsAt) < Date.now()
  const isOpen = detail.status === 'CONFIRMED'

  return (
    <AdminPage width="narrow">
      <PageHeader
        back={<BackToBookings />}
        title={detail.visitorName}
        description={
          <>
            {detail.bookingTypeName} · <span className="tabular">{detail.reference}</span>
          </>
        }
        actions={<StatusPill className="px-3 py-1 text-xs" status={detail.status} />}
      />

      <Panel>
        <dl className="grid gap-5 p-6 sm:grid-cols-2">
          <Row label="When (Berlin)" value={formatOn(detail.startsAt, BERLIN)} />
          <Row
            label={`When (${detail.visitorTimezone})`}
            value={formatOn(detail.startsAt, detail.visitorTimezone)}
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
            value={`${formatOn(detail.blockedStartsAt, BERLIN)} — ${formatOn(detail.blockedEndsAt, BERLIN)}`}
          />
          {detail.rescheduledFromReference ? (
            <Row label="Moved from" value={detail.rescheduledFromReference} />
          ) : null}
          {detail.cancelledAt ? (
            <Row
              label={`Cancelled by ${detail.cancelledBy?.toLowerCase() ?? '—'}`}
              value={`${formatOn(detail.cancelledAt, BERLIN)}${detail.cancellationReason ? ` · ${detail.cancellationReason}` : ''}`}
            />
          ) : null}
        </dl>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
            What it is about
          </PanelTitle>
        </PanelHeader>
        <PanelBody>
          {detail.visitorNote ? (
            <p className="text-sm leading-7 whitespace-pre-wrap">{detail.visitorNote}</p>
          ) : (
            <p className="text-muted-foreground text-sm">Nothing was written.</p>
          )}
        </PanelBody>
      </Panel>

      <div className="flex flex-wrap gap-2">
        {/* Only while the room exists. A call button on a booking three weeks
            out is a button whose only outcome is an error message. */}
        {isCallOpen(detail) ? (
          <Button asChild className="rounded-full">
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
              className="rounded-full"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ status: 'COMPLETED' })}
            >
              <Check aria-hidden="true" />
              Mark as held
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ status: 'NO_SHOW' })}
            >
              <UserX aria-hidden="true" />
              Mark as no show
            </Button>
          </>
        ) : null}

        {isOpen && !isPast ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => setIsCancelOpen(true)}
          >
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
              onClick={() => cancel.mutate({ reason }, { onSuccess: () => setIsCancelOpen(false) })}
            >
              {cancel.isPending ? 'Cancelling…' : 'Cancel booking'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPage>
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
