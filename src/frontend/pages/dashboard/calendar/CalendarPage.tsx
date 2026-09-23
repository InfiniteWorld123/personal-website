import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import {
  APPOINTMENT_STATUSES,
  type AppointmentSummary,
  BOOKING_METHODS,
} from '#/backend2/contracts/booking.contract'
import { DashboardPage, PageHead, Panel, PanelHead } from '#/frontend/dashboard/primitives'
import {
  addDays,
  berlin,
  berlinInstant,
  berlinToday,
  dayHeading,
  isoWeekday,
  mondayOf,
} from '#/frontend/features/booking-v2/berlin'
import { useAppointments, useAvailability, useTypes } from '#/frontend/features/booking-v2/queries'
import { messageFromError } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import type { CalendarSearch } from '#/frontend/routes/dashboard.calendar'
import { EmptyState, LoadFailure, Pager } from '../blog/blog-parts'
import { AppointmentDetailPanel } from './AppointmentDetailPanel'
import { HoursTab } from './HoursTab'
import { ManualAppointmentDrawer } from './ManualAppointmentDrawer'
import { TypesTab } from './TypesTab'
import { AppointmentStatusChip, METHOD_WORDS } from './calendar-parts'

/**
 * `/dashboard/calendar` (`docs/v2/booking.md`, approved Design Lab 1A–7A):
 * the week in Berlin time with the paged list of appointments under it, and
 * types and hours as tabs beside it. The address holds the week, the tab, the
 * open appointment and the list filters.
 */

const TABS = [
  ['appointments', 'Appointments'],
  ['types', 'Types'],
  ['hours', 'Hours & limits'],
] as const

const HOUR_PX = 44

function WeekView({ week, onOpen, onWeek }: { week: string; onOpen: (id: string) => void; onWeek: (week: string | undefined) => void }) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index))
  const from = berlinInstant(week, '00:00') ?? `${week}T00:00:00Z`
  const to = berlinInstant(addDays(week, 7), '00:00') ?? `${addDays(week, 7)}T00:00:00Z`
  const appointments = useAppointments({ from, to, pageSize: 100 })
  const availability = useAvailability()
  const today = berlinToday()

  const items = appointments.data?.items ?? []

  const rangesFor = (date: string) => {
    const exception = availability.data?.exceptions.find((item) => item.date === date)

    return exception ? exception.ranges : (availability.data?.weekly ?? []).filter((range) => range.weekday === isoWeekday(date))
  }

  // The visible hours: the owner's hours and every appointment, at least 08–18.
  const [firstHour, lastHour] = useMemo(() => {
    let first = 8
    let last = 18

    for (const range of availability.data?.weekly ?? []) {
      first = Math.min(first, Math.floor(range.startMinute / 60))
      last = Math.max(last, Math.ceil(range.endMinute / 60))
    }

    for (const item of items) {
      const start = berlin(item.startsAt)
      const end = berlin(item.endsAt)

      first = Math.min(first, Math.floor(start.minute / 60))
      last = Math.max(last, end.date === start.date ? Math.ceil(end.minute / 60) : 24)
    }

    return [Math.max(0, first), Math.min(24, last)]
  }, [availability.data, items])

  const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index)

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2 px-5 pt-4 pb-3">
        <button type="button" onClick={() => onWeek(addDays(week, -7))} className="dash-btn dash-btn-ghost h-8 px-2" aria-label="Previous week">
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <h2 className="text-sm font-semibold">
          {dayHeading(days[0]!)} – {dayHeading(days[6]!)} {new Date(`${days[6]}T12:00:00Z`).getUTCFullYear()}
        </h2>
        <button type="button" onClick={() => onWeek(addDays(week, 7))} className="dash-btn dash-btn-ghost h-8 px-2" aria-label="Next week">
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => onWeek(undefined)} className="dash-btn dash-btn-ghost h-8 text-[12px]">
          This week
        </button>
        <span className="ms-auto text-[11.5px] text-[var(--dash-quiet)]">All times Berlin{appointments.isFetching ? ' · updating…' : ''}</span>
      </div>

      {appointments.isError ? (
        <LoadFailure title="The week could not load" message={messageFromError(appointments.error)} onRetry={() => void appointments.refetch()} />
      ) : (
        <div className="overflow-x-auto px-3 pb-4">
          <div className="grid min-w-[720px] grid-cols-[48px_repeat(7,minmax(0,1fr))]" role="grid" aria-label="Week">
            <span />
            {days.map((date) => (
              <span key={date} role="columnheader" className={cn('border-b border-[var(--dash-line)] px-1 py-1.5 text-center text-[11.5px] font-semibold', date === today ? 'text-[var(--dash-brand)]' : 'text-[var(--dash-quiet)]')}>
                {dayHeading(date)}
              </span>
            ))}

            <div className="relative" style={{ height: hours.length * HOUR_PX }}>
              {hours.map((hour, index) => (
                <span key={hour} className="dash-num absolute end-1.5 text-[10.5px] text-[var(--dash-quiet)]" style={{ top: index * HOUR_PX - 6 }}>
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </div>

            {days.map((date) => {
              const ranges = rangesFor(date)
              const dayItems = items.filter((item) => berlin(item.startsAt).date === date)

              return (
                <div key={date} role="gridcell" aria-label={`${dayHeading(date)}, ${dayItems.length} appointment${dayItems.length === 1 ? '' : 's'}`} className="relative border-s border-[var(--dash-line)]" style={{ height: hours.length * HOUR_PX }}>
                  {/* Closed time hatched, open time plain. */}
                  <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--dash-soft)_6px_7px)]" aria-hidden="true" />
                  {ranges.map((range, index) => (
                    <div
                      key={index}
                      aria-hidden="true"
                      className="absolute inset-x-0 bg-[var(--dash-surface)]"
                      style={{ top: ((range.startMinute - firstHour * 60) / 60) * HOUR_PX, height: ((range.endMinute - range.startMinute) / 60) * HOUR_PX }}
                    />
                  ))}
                  {hours.map((hour, index) => (
                    <div key={hour} aria-hidden="true" className="absolute inset-x-0 border-t border-[var(--dash-soft)]" style={{ top: index * HOUR_PX }} />
                  ))}
                  {dayItems.map((item) => {
                    const start = berlin(item.startsAt)
                    const end = berlin(item.endsAt)
                    const endMinute = end.date === start.date ? end.minute : 24 * 60
                    const cancelled = item.status === 'cancelled'

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onOpen(item.id)}
                        className={cn(
                          'absolute inset-x-1 z-10 overflow-hidden rounded-[7px] border-s-[3px] px-1.5 py-0.5 text-start text-[11px] leading-tight',
                          cancelled
                            ? 'border-[var(--dash-quiet)] bg-[var(--dash-chip)] text-[var(--dash-quiet)] line-through'
                            : item.outsideHours
                              ? 'border-[#8a5a00] bg-[#fff4dc] text-[#8a5a00]'
                              : 'border-[var(--dash-brand)] bg-[var(--dash-blue-tint)] text-[var(--dash-blue-ink)]',
                        )}
                        style={{ top: ((start.minute - firstHour * 60) / 60) * HOUR_PX + 1, height: Math.max(18, ((endMinute - start.minute) / 60) * HOUR_PX - 2) }}
                      >
                        <b>{start.time}</b> {item.visitorName}
                        <span className="block truncate">{METHOD_WORDS[item.method]} · {item.typeName}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Panel>
  )
}

function AppointmentList({ search, onOpen }: { search: CalendarSearch; onOpen: (id: string) => void }) {
  const navigate = useNavigate({ from: '/dashboard/calendar' })
  const [query, setQuery] = useState(search.q ?? '')
  const types = useTypes(1, 100)
  const nowIso = useMemo(() => new Date(Date.now() - 60 * 60 * 1000).toISOString(), [])
  const list = useAppointments({
    from: search.past ? undefined : nowIso,
    status: search.status,
    typeId: search.type,
    method: search.method,
    q: search.q,
    page: search.page ?? 1,
    pageSize: 25,
  })

  const go = (patch: Partial<CalendarSearch>) => void navigate({ search: (previous: CalendarSearch) => ({ ...previous, ...patch, page: undefined }), replace: true })

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if ((search.q ?? '') !== query.trim()) go({ q: query.trim() || undefined })
    }, 350)

    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const select = 'dash-field h-8 px-2 text-[12.5px]'

  return (
    <Panel>
      <PanelHead title={search.past ? 'All appointments' : 'Upcoming appointments'} count={list.data?.total} />
      <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
        <label className="relative">
          <span className="sr-only">Search appointments</span>
          <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--dash-quiet)]" aria-hidden="true" />
          <input className="dash-field h-8 w-56 ps-7 pe-2 text-[12.5px]" placeholder="Name, email, reference" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <select aria-label="Status" className={select} value={search.status ?? ''} onChange={(event) => go({ status: (event.target.value || undefined) as CalendarSearch['status'] })}>
          <option value="">Any status</option>
          {APPOINTMENT_STATUSES.map((status) => <option key={status} value={status}>{status === 'no_show' ? 'No show' : status[0]!.toUpperCase() + status.slice(1)}</option>)}
        </select>
        <select aria-label="Type" className={select} value={search.type ?? ''} onChange={(event) => go({ type: event.target.value || undefined })}>
          <option value="">Any type</option>
          {(types.data?.items ?? []).map((type) => <option key={type.id} value={type.id}>{type.texts.en.name || type.slug}</option>)}
        </select>
        <select aria-label="Way to meet" className={select} value={search.method ?? ''} onChange={(event) => go({ method: (event.target.value || undefined) as CalendarSearch['method'] })}>
          <option value="">Any way</option>
          {BOOKING_METHODS.map((method) => <option key={method} value={method}>{METHOD_WORDS[method]}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 text-[12.5px]">
          <input type="checkbox" checked={Boolean(search.past)} onChange={(event) => go({ past: event.target.checked || undefined })} /> Include past
        </label>
      </div>

      {list.isPending ? (
        <div className="px-5 pb-5"><span className="dash-skeleton block h-32 rounded" /></div>
      ) : list.isError ? (
        <LoadFailure title="Appointments could not load" message={messageFromError(list.error)} onRetry={() => void list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title={search.q || search.status || search.type || search.method ? 'No matches' : 'Nothing booked yet'}>
          {search.q || search.status || search.type || search.method ? 'Try another filter or search.' : 'Appointments booked on the website, and ones you create, appear here.'}
        </EmptyState>
      ) : (
        <ul>
          {list.data.items.map((item: AppointmentSummary) => (
            <li key={item.id}>
              <button type="button" onClick={() => onOpen(item.id)} className="grid w-full grid-cols-[140px_minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--dash-line)] px-5 py-2.5 text-start text-[13px] hover:bg-[var(--dash-hover)] max-sm:grid-cols-[minmax(0,1fr)_auto]">
                <span className="dash-num text-[12px] text-[var(--dash-quiet)] max-sm:col-span-2">
                  {dayHeading(berlin(item.startsAt).date)} · {berlin(item.startsAt).time}
                </span>
                <span className="min-w-0 truncate">
                  <b className="font-semibold">{item.visitorName}</b> · {item.typeName} · {METHOD_WORDS[item.method]}
                </span>
                <span className="flex items-center gap-1.5">
                  {item.outsideHours ? <span className="text-[11px] text-[#8a5a00]">Outside hours</span> : null}
                  <AppointmentStatusChip status={item.status} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.data ? (
        <div className="flex flex-col gap-1 px-5 py-3">
          <span className="dash-num text-[11.5px] text-[var(--dash-quiet)]">
            {list.data.total === 0 ? '0' : `${(list.data.page - 1) * list.data.pageSize + 1}–${Math.min(list.data.page * list.data.pageSize, list.data.total)} of ${list.data.total}`}
          </span>
          <Pager page={list.data.page} pageCount={list.data.pageCount} onPage={(page) => void navigate({ search: (previous: CalendarSearch) => ({ ...previous, page: page === 1 ? undefined : page }) })} />
        </div>
      ) : null}
    </Panel>
  )
}

export function CalendarPage() {
  const search = useSearch({ from: '/dashboard/calendar' }) as CalendarSearch
  const navigate = useNavigate({ from: '/dashboard/calendar' })
  const tab = search.tab ?? 'appointments'
  const week = search.week ?? mondayOf(berlinToday())

  const go = (patch: Partial<CalendarSearch>) => void navigate({ search: (previous: CalendarSearch) => ({ ...previous, ...patch }) })

  return (
    <DashboardPage className="gap-5">
      <div className="flex flex-col gap-4">
        <PageHead
          eyebrow="CALENDAR"
          title="Calendar"
          description="Appointments booked on the website and the ones you create. Everything here is in Berlin time."
          actions={
            <button type="button" className="dash-btn dash-btn-primary" onClick={() => go({ new: true })}>
              <Plus className="size-4" aria-hidden="true" /> New appointment
            </button>
          }
        />
        <nav aria-label="Calendar" className="-mb-1 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-[var(--dash-line)]">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-current={tab === key ? 'page' : undefined}
              onClick={() => go({ tab: key === 'appointments' ? undefined : key, id: undefined })}
              className={cn(
                '-mb-px border-b-2 px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap',
                tab === key ? 'border-[var(--dash-brand)] text-[var(--dash-brand)]' : 'border-transparent text-[var(--dash-quiet)] hover:text-[var(--dash-ink)]',
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'types' ? (
        <TypesTab />
      ) : tab === 'hours' ? (
        <HoursTab />
      ) : search.id ? (
        <AppointmentDetailPanel key={search.id} id={search.id} onBack={() => go({ id: undefined })} />
      ) : (
        <>
          <WeekView week={week} onOpen={(id) => go({ id })} onWeek={(next) => go({ week: next === mondayOf(berlinToday()) ? undefined : next })} />
          <AppointmentList search={search} onOpen={(id) => go({ id })} />
        </>
      )}

      {search.new ? (
        <ManualAppointmentDrawer
          initialDate={week === mondayOf(berlinToday()) ? undefined : week}
          onClose={() => go({ new: undefined })}
          onCreated={(id) => go({ new: undefined, id, tab: undefined })}
        />
      ) : null}
    </DashboardPage>
  )
}
