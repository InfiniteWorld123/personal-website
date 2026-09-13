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
import { Badge } from '#/frontend/components/ui/badge'
import { Button } from '#/frontend/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/frontend/components/ui/table'
import {
  adminBookingTypesQuery,
  useDeleteBookingType,
} from '#/frontend/features/booking/booking-queries'
import type { AdminBookingType } from '#/shared/types/booking.types'

export function BookingTypesPage() {
  const types = useQuery(adminBookingTypesQuery())
  const remove = useDeleteBookingType()
  const [pendingDelete, setPendingDelete] = useState<AdminBookingType | null>(null)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/admin/bookings">
          <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
          All bookings
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Call types</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            What a visitor can book, and the rules each one follows. An inactive type disappears
            from the public page but keeps its history.
          </p>
        </div>

        <Button asChild>
          <Link to="/admin/bookings/types/new">
            <Plus aria-hidden="true" />
            New call type
          </Link>
        </Button>
      </div>

      {types.isPending ? (
        <p className="text-muted-foreground py-12 text-center text-sm">Loading call types…</p>
      ) : types.isError ? (
        <div className="border-destructive/40 bg-destructive/5 rounded-lg border p-6">
          <p className="text-destructive text-sm">{(types.error as Error).message}</p>
        </div>
      ) : types.data.length === 0 ? (
        <div className="border-border flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm font-medium">No call type yet.</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Until one exists and is active, the public booking page has nothing to offer. Run{' '}
            <code className="text-xs">bun run db:seed:booking</code> for the default one, or make
            your own.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Length</TableHead>
              <TableHead>Buffers</TableHead>
              <TableHead>Notice</TableHead>
              <TableHead>Upcoming</TableHead>
              <TableHead className="text-end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.data.map((type) => (
              <TableRow key={type.id}>
                <TableCell>
                  <span className="flex flex-col">
                    <Link
                      to="/admin/bookings/types/$id"
                      params={{ id: type.id }}
                      className="hover:text-primary font-medium"
                    >
                      {type.translations.de.name || type.slug}
                    </Link>
                    <span className="text-muted-foreground text-xs">{type.slug}</span>
                  </span>
                </TableCell>
                <TableCell className="tabular">{type.durationMinutes} min</TableCell>
                <TableCell className="tabular text-muted-foreground text-sm">
                  {type.bufferBeforeMinutes} / {type.bufferAfterMinutes}
                </TableCell>
                <TableCell className="tabular text-muted-foreground text-sm">
                  {Math.round(type.minimumNoticeMinutes / 60)} h
                </TableCell>
                <TableCell className="tabular">{type.upcomingCount}</TableCell>
                <TableCell className="text-end">
                  <span className="flex items-center justify-end gap-2">
                    <Badge variant="outline" className="rounded-full">
                      {type.isActive ? 'Active' : 'Off'}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingDelete(type)}
                    >
                      Delete
                    </Button>
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

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
    </div>
  )
}
