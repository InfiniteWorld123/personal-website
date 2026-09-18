import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowLeft, Plus } from 'lucide-react'
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
import { Panel, PanelNote } from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import {
  adminBookingTypeQuery,
  adminBookingTypesQuery,
  adminBookingsQuery,
  useDeleteBookingType,
} from '#/frontend/features/booking/booking-queries'
import { toBookingFilterInput } from '#/frontend/features/booking/booking-filters'
import { usePrefetch } from '#/frontend/lib/prefetch'
import { cn } from '#/frontend/lib/utils'
import type { AdminBookingType } from '#/shared/types/booking.types'

/**
 * What a visitor can book.
 *
 * The old table carried its meaning in the header row: four columns of bare
 * numbers that only made sense while the headings were on screen. Here each
 * figure keeps its own word, so a row still reads on a phone where a table
 * would have scrolled its headings away.
 */

/** One number on a call-type row, with the word that says what it is. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-w-16 flex-col gap-0.5">
      <span className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
        {label}
      </span>
      <span className="tabular text-sm">{value}</span>
    </span>
  )
}

function Row({ type, onDelete }: { type: AdminBookingType; onDelete: () => void }) {
  const prefetch = usePrefetch()

  return (
    <div className="hover:bg-accent/50 has-[a:focus-visible]:bg-accent/50 border-border/60 relative flex flex-wrap items-center gap-x-6 gap-y-3 border-b px-5 py-3.5 last:border-b-0 motion-safe:transition-colors">
      <Link
        to="/admin/bookings/types/$id"
        params={{ id: type.id }}
        // The editor this row opens, fetched while the pointer is still on it.
        {...prefetch(adminBookingTypeQuery(type.id))}
        className="focus-visible:ring-ring flex min-w-40 flex-1 flex-col rounded-md after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:outline-none"
      >
        <span className="truncate text-sm font-medium">
          {type.translations.de.name || type.slug}
        </span>
        <span className="text-muted-foreground truncate text-xs" dir="ltr">
          {type.slug}
        </span>
      </Link>

      <Figure label="Length" value={`${type.durationMinutes} min`} />
      <Figure
        label="Buffers"
        value={`${type.bufferBeforeMinutes} / ${type.bufferAfterMinutes}`}
      />
      <Figure label="Notice" value={`${Math.round(type.minimumNoticeMinutes / 60)} h`} />
      <Figure label="Upcoming" value={String(type.upcomingCount)} />

      <span className="ms-auto flex items-center gap-2">
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
            type.isActive ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground',
          )}
        >
          {type.isActive ? 'Active' : 'Off'}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="relative rounded-full"
          onClick={onDelete}
        >
          Delete
        </Button>
      </span>
    </div>
  )
}

/** Four rows: the number of things a one-person studio offers to book. */
function RowsSkeleton() {
  return (
    <SkeletonScreen label="Loading call types">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          className="border-border/60 flex flex-wrap items-center gap-x-6 gap-y-3 border-b px-5 py-3.5 last:border-b-0"
          key={index}
        >
          <div className="min-w-40 flex-1">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
          {Array.from({ length: 4 }, (_, figure) => (
            <div className="flex min-w-16 flex-col gap-1.5" key={figure}>
              <Skeleton className="h-2.5 w-12" />
              <Skeleton className="h-3.5 w-10" />
            </div>
          ))}
          <div className="ms-auto flex items-center gap-2">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-7 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </SkeletonScreen>
  )
}

export function BookingTypesPage() {
  const prefetch = usePrefetch()
  const types = useQuery(adminBookingTypesQuery())
  const remove = useDeleteBookingType()
  const [pendingDelete, setPendingDelete] = useState<AdminBookingType | null>(null)

  return (
    <AdminPage>
      <PageHeader
        back={
          <Button asChild variant="ghost" size="sm" className="-ms-2 w-fit rounded-full">
            <Link to="/admin/bookings" {...prefetch(adminBookingsQuery(toBookingFilterInput({})))}>
              <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
              All bookings
            </Link>
          </Button>
        }
        title="Call types"
        description="What a visitor can book, and the rules each one follows. An inactive type disappears from the public page but keeps its history."
        actions={
          <Button asChild className="rounded-full" size="sm">
            <Link to="/admin/bookings/types/new">
              <Plus aria-hidden="true" />
              New call type
            </Link>
          </Button>
        }
      />

      <Panel className="overflow-hidden">
        {types.isPending ? (
          <RowsSkeleton />
        ) : types.isError ? (
          <PanelNote tone="error">
            <div>
              <p className="font-medium">{(types.error as Error).message}</p>
              <p className="text-muted-foreground mt-1">
                If the database is behind the code, run{' '}
                <code className="text-xs">bun run db:migrate</code> and try again.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void types.refetch()}>
              Try again
            </Button>
          </PanelNote>
        ) : types.data.length === 0 ? (
          <PanelNote>
            <div>
              <p className="text-foreground font-medium">No call type yet.</p>
              <p className="mx-auto mt-1 max-w-sm">
                Until one exists and is active, the public booking page has nothing to offer. Run{' '}
                <code className="text-xs">bun run db:seed:booking</code> for the default one, or
                make your own.
              </p>
            </div>
          </PanelNote>
        ) : (
          types.data.map((type) => (
            <Row key={type.id} onDelete={() => setPendingDelete(type)} type={type} />
          ))
        )}
      </Panel>

      <AlertDialog open={pendingDelete !== null} onOpenChange={() => setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this call type?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && pendingDelete.upcomingCount > 0
                ? 'Calls are already booked with it, so it cannot be deleted. Turn it off instead and it stops being offered.'
                : 'It disappears from the public page. Turning it off does the same thing and is reversible.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) remove.mutate(pendingDelete.id)
                setPendingDelete(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {remove.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {(remove.error as Error).message}
        </p>
      ) : null}
    </AdminPage>
  )
}
