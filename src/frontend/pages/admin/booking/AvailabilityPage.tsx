import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import {
  availabilityQuery,
  useCreateAvailabilityException,
  useDeleteAvailabilityException,
  useSaveAvailabilityRules,
} from '#/frontend/features/booking/booking-queries'
import {
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  minuteToTime,
  timeToMinute,
} from '#/frontend/features/booking/booking-filters'
import type { AvailabilityRuleInput } from '#/shared/validation/booking.validation'

type DraftRule = AvailabilityRuleInput

/**
 * The weekly grid and the exceptions that bend it.
 *
 * Every time on this page is the owner's own wall clock in Europe/Berlin, and
 * that is said out loud rather than assumed — it is the one page where the
 * difference between a wall clock and an instant actually matters to the
 * person using it.
 */
export function AvailabilityPage() {
  const availability = useQuery(availabilityQuery())
  const save = useSaveAvailabilityRules()
  const addException = useCreateAvailabilityException()
  const removeException = useDeleteAvailabilityException()

  const [draft, setDraft] = useState<DraftRule[] | null>(null)

  // Seeded once the server answers, then owned by the page until it is saved.
  useEffect(() => {
    if (availability.data && draft === null) {
      setDraft(
        availability.data.rules.map((rule) => ({
          weekday: rule.weekday,
          startsAtMinute: rule.startsAtMinute,
          endsAtMinute: rule.endsAtMinute,
        })),
      )
    }
  }, [availability.data, draft])

  const rules = draft ?? []

  const update = (index: number, patch: Partial<DraftRule>) =>
    setDraft(rules.map((rule, position) => (position === index ? { ...rule, ...patch } : rule)))

  const addWindow = (weekday: number) =>
    setDraft([...rules, { weekday, startsAtMinute: 9 * 60, endsAtMinute: 17 * 60 }])

  const removeWindow = (index: number) => setDraft(rules.filter((_, position) => position !== index))

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/admin/bookings">
          <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
          All bookings
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Availability</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The week visitors can book into. Times are your own clock in{' '}
          <span className="font-medium">{availability.data?.timezone ?? 'Europe/Berlin'}</span>, so
          they stay where you put them when the clocks change.
        </p>
      </div>

      {availability.isPending ? (
        <p className="text-muted-foreground py-12 text-center text-sm">Loading availability…</p>
      ) : availability.isError ? (
        <div className="border-destructive/40 bg-destructive/5 rounded-lg border p-6">
          <p className="text-destructive text-sm">{(availability.error as Error).message}</p>
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="text-base font-semibold">Weekly hours</h2>

            <div className="border-border divide-border divide-y rounded-lg border">
              {WEEKDAY_ORDER.map((weekday) => {
                const windows = rules
                  .map((rule, index) => ({ rule, index }))
                  .filter((entry) => entry.rule.weekday === weekday)

                return (
                  <div key={weekday} className="flex flex-wrap items-start gap-4 p-4">
                    <p className="w-28 shrink-0 pt-2 text-sm font-medium">
                      {WEEKDAY_LABELS[weekday]}
                    </p>

                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      {windows.length === 0 ? (
                        <p className="text-muted-foreground pt-2 text-sm">Closed</p>
                      ) : (
                        windows.map(({ rule, index }) => (
                          <div key={index} className="flex flex-wrap items-center gap-2">
                            <Input
                              type="time"
                              className="tabular w-32"
                              value={minuteToTime(rule.startsAtMinute)}
                              onChange={(event) =>
                                update(index, { startsAtMinute: timeToMinute(event.currentTarget.value) })
                              }
                            />
                            <span className="text-muted-foreground text-sm">to</span>
                            <Input
                              type="time"
                              className="tabular w-32"
                              value={minuteToTime(rule.endsAtMinute)}
                              onChange={(event) =>
                                update(index, { endsAtMinute: timeToMinute(event.currentTarget.value) })
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Remove this window"
                              onClick={() => removeWindow(index)}
                            >
                              <Trash2 aria-hidden="true" className="size-4" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addWindow(weekday)}
                    >
                      <Plus aria-hidden="true" />
                      Add
                    </Button>
                  </div>
                )
              })}
            </div>

            {save.isError ? (
              <p role="alert" className="text-destructive text-sm">
                {(save.error as Error).message}
              </p>
            ) : null}

            <div className="flex items-center gap-3">
              <Button
                type="button"
                disabled={save.isPending || draft === null}
                onClick={() => save.mutate({ bookingTypeId: null, rules })}
              >
                {save.isPending ? 'Saving…' : 'Save weekly hours'}
              </Button>
              {save.isSuccess ? (
                <p className="text-muted-foreground text-sm">Saved.</p>
              ) : null}
            </div>
          </section>

          <ExceptionsSection
            exceptions={availability.data.exceptions}
            onAdd={addException.mutate}
            isAdding={addException.isPending}
            error={addException.isError ? (addException.error as Error).message : null}
            onRemove={removeException.mutate}
          />
        </>
      )}
    </div>
  )
}

function ExceptionsSection({
  exceptions,
  onAdd,
  isAdding,
  error,
  onRemove,
}: {
  exceptions: Array<{
    id: string
    onDate: string
    kind: 'BLOCK' | 'OPEN'
    startsAtMinute: number | null
    endsAtMinute: number | null
    reason: string
  }>
  onAdd: (input: {
    bookingTypeId: null
    onDate: string
    kind: 'BLOCK' | 'OPEN'
    startsAtMinute: number | null
    endsAtMinute: number | null
    reason: string
  }) => void
  isAdding: boolean
  error: string | null
  onRemove: (id: string) => void
}) {
  const [onDate, setOnDate] = useState('')
  const [kind, setKind] = useState<'BLOCK' | 'OPEN'>('BLOCK')
  const [startsAt, setStartsAt] = useState('09:00')
  const [endsAt, setEndsAt] = useState('17:00')
  const [reason, setReason] = useState('')

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">Days that break the pattern</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          A block takes time away — a holiday, a day off, an afternoon you need. An opening adds
          time to a day the week has none. A block always wins over an opening on the same day.
        </p>
      </div>

      <div className="border-border flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="exception-date" className="text-xs">
            Date
          </Label>
          <Input
            id="exception-date"
            type="date"
            className="tabular w-40"
            value={onDate}
            onChange={(event) => setOnDate(event.currentTarget.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="exception-kind" className="text-xs">
            What it does
          </Label>
          <select
            id="exception-kind"
            value={kind}
            onChange={(event) => setKind(event.currentTarget.value as 'BLOCK' | 'OPEN')}
            className="border-border bg-background h-9 rounded-md border px-2 text-sm"
          >
            <option value="BLOCK">Block the whole day</option>
            <option value="OPEN">Open extra hours</option>
          </select>
        </div>

        {kind === 'OPEN' ? (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="exception-from" className="text-xs">
                From
              </Label>
              <Input
                id="exception-from"
                type="time"
                className="tabular w-28"
                value={startsAt}
                onChange={(event) => setStartsAt(event.currentTarget.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="exception-to" className="text-xs">
                To
              </Label>
              <Input
                id="exception-to"
                type="time"
                className="tabular w-28"
                value={endsAt}
                onChange={(event) => setEndsAt(event.currentTarget.value)}
              />
            </div>
          </>
        ) : null}

        <div className="flex min-w-40 flex-1 flex-col gap-2">
          <Label htmlFor="exception-reason" className="text-xs">
            Note
          </Label>
          <Input
            id="exception-reason"
            value={reason}
            placeholder="Only you see this"
            onChange={(event) => setReason(event.currentTarget.value)}
          />
        </div>

        <Button
          type="button"
          disabled={!onDate || isAdding}
          onClick={() => {
            onAdd({
              bookingTypeId: null,
              onDate,
              kind,
              startsAtMinute: kind === 'OPEN' ? timeToMinute(startsAt) : null,
              endsAtMinute: kind === 'OPEN' ? timeToMinute(endsAt) : null,
              reason,
            })
            setOnDate('')
            setReason('')
          }}
        >
          <Plus aria-hidden="true" />
          Add
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {exceptions.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing breaks the pattern right now.</p>
      ) : (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {exceptions.map((exception) => (
            <li key={exception.id} className="flex flex-wrap items-center gap-3 p-4">
              <span className="tabular w-28 text-sm font-medium">{exception.onDate}</span>
              <span className="text-muted-foreground text-sm">
                {exception.kind === 'BLOCK'
                  ? 'Blocked all day'
                  : `Open ${minuteToTime(exception.startsAtMinute ?? 0)}–${minuteToTime(exception.endsAtMinute ?? 0)}`}
              </span>
              {exception.reason ? (
                <span className="text-muted-foreground text-sm">· {exception.reason}</span>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ms-auto"
                aria-label="Remove"
                onClick={() => onRemove(exception.id)}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
