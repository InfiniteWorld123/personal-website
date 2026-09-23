import { useState } from 'react'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import { Loader2, Plus, X } from 'lucide-react'
import { type Availability, type BookingSettings, SETTINGS_BOUNDS } from '#/backend2/contracts/booking.contract'
import { Panel, PanelHead } from '#/frontend/dashboard/primitives'
import { DialogAlert } from '#/frontend/features/blog-v2/BlogDialog'
import { berlinToday, minuteText, textMinute } from '#/frontend/features/booking-v2/berlin'
import { useAvailability, useBookingSettings, useSaveAvailability, useSaveSettings } from '#/frontend/features/booking-v2/queries'
import { messageFromError, notify } from '#/frontend/lib/notify'
import { LoadFailure } from '../blog/blog-parts'
import { FieldError } from './calendar-parts'

/**
 * Weekly hours, exceptions, and the limits for visitors — all in Berlin time.
 * Saving never moves an appointment already confirmed.
 */

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

type Range = { start: string; end: string }
type HoursValues = {
  weekly: Range[][]
  exceptions: Array<{ date: string; closed: boolean; ranges: Range[]; note: string }>
}

const toValues = (availability: Availability): HoursValues => ({
  weekly: DAYS.map((_, index) =>
    availability.weekly
      .filter((range) => range.weekday === index + 1)
      .map((range) => ({ start: minuteText(range.startMinute), end: minuteText(range.endMinute === 1440 ? 1439 : range.endMinute) })),
  ),
  exceptions: availability.exceptions.map((item) => ({
    date: item.date,
    closed: item.ranges.length === 0,
    ranges: item.ranges.map((range) => ({ start: minuteText(range.startMinute), end: minuteText(range.endMinute === 1440 ? 1439 : range.endMinute) })),
    note: item.note,
  })),
})

const rangeError = (ranges: Range[]): string | null => {
  const minutes = ranges.map((range) => ({ start: textMinute(range.start), end: textMinute(range.end) })).sort((a, b) => a.start - b.start)

  if (minutes.some((range) => range.start >= range.end)) return 'Each range must end after it starts'
  if (minutes.some((range, index) => index > 0 && minutes[index - 1]!.end > range.start)) return 'Ranges on one day may not overlap'

  return null
}

const toMinutes = (ranges: Range[]) =>
  ranges.map((range) => ({ startMinute: textMinute(range.start), endMinute: range.end === '23:59' ? 1440 : textMinute(range.end) }))

function RangesEditor({ ranges, onChange, label }: { ranges: Range[]; onChange: (ranges: Range[]) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ranges.length === 0 ? <span className="text-[12.5px] text-[var(--dash-quiet)]">Closed</span> : null}
      {ranges.map((range, index) => (
        <span key={index} className="inline-flex items-center gap-1 rounded-[8px] border border-[var(--dash-line)] px-1.5 py-1">
          <input type="time" step={900} aria-label={`${label}, range ${index + 1} start`} className="bg-transparent text-[12.5px]" value={range.start} onChange={(event) => onChange(ranges.map((item, i) => (i === index ? { ...item, start: event.target.value } : item)))} />
          –
          <input type="time" step={900} aria-label={`${label}, range ${index + 1} end`} className="bg-transparent text-[12.5px]" value={range.end} onChange={(event) => onChange(ranges.map((item, i) => (i === index ? { ...item, end: event.target.value } : item)))} />
          <button type="button" className="rounded p-0.5 text-[var(--dash-quiet)] hover:text-[var(--dash-red-ink)]" aria-label={`Remove ${label} range ${index + 1}`} onClick={() => onChange(ranges.filter((_, i) => i !== index))}>
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      <button type="button" className="dash-btn dash-btn-ghost h-7 text-[11.5px]" onClick={() => onChange([...ranges, { start: '09:00', end: '17:00' }])}>
        <Plus className="size-3.5" aria-hidden="true" /> Add hours
      </button>
    </div>
  )
}

function HoursForm({ availability }: { availability: Availability }) {
  const save = useSaveAvailability()
  const [failure, setFailure] = useState<string | null>(null)

  const form = useForm({
    defaultValues: toValues(availability),
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Record<string, string> = {}

        value.weekly.forEach((ranges, index) => {
          const error = rangeError(ranges)

          if (error) fields[`weekly[${index}]`] = error
        })
        value.exceptions.forEach((item, index) => {
          if (!item.date) fields[`exceptions[${index}].date`] = 'Choose a date'
          const error = item.closed ? null : rangeError(item.ranges)

          if (error) fields[`exceptions[${index}].ranges`] = error
        })

        const dates = value.exceptions.map((item) => item.date)

        if (new Set(dates).size !== dates.length) fields.exceptions = 'One exception per date'

        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        await save.mutateAsync({
          weekly: value.weekly.flatMap((ranges, index) => toMinutes(ranges).map((range) => ({ weekday: index + 1, ...range }))),
          exceptions: value.exceptions.map((item) => ({ date: item.date, ranges: item.closed ? [] : toMinutes(item.ranges), note: item.note.trim() })),
        })
        notify.success('Hours saved. Appointments already booked keep their time.')
      } catch (error) {
        setFailure(messageFromError(error))
      }
    },
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-4 px-5 pb-5"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="flex flex-col gap-2">
        {DAYS.map((day, index) => (
          <form.Field key={day} name={`weekly[${index}]`}>
            {(field) => (
              <div className="grid gap-1.5 sm:grid-cols-[110px_minmax(0,1fr)] sm:items-center">
                <span className="text-[13px] font-medium">{day}</span>
                <div>
                  <RangesEditor label={day} ranges={field.state.value} onChange={(ranges) => field.handleChange(ranges)} />
                  <FieldError id={`weekly-${index}-err`} error={field.state.meta.errors[0]} />
                </div>
              </div>
            )}
          </form.Field>
        ))}
      </div>

      <form.Field name="exceptions" mode="array">
        {(field) => (
          <div className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold">Exceptions</h3>
            <p className="text-[12px] text-[var(--dash-quiet)]">A date that differs from the week — closed, or open at other hours.</p>
            {field.state.value.map((_, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[var(--dash-line)] p-2.5">
                <form.Field name={`exceptions[${index}].date`}>
                  {(dateField) => (
                    <input type="date" min={berlinToday()} aria-label="Date" className="dash-field h-8 px-2 text-[12.5px]" value={dateField.state.value} aria-invalid={dateField.state.meta.errors.length > 0} onChange={(event) => dateField.handleChange(event.target.value)} />
                  )}
                </form.Field>
                <form.Field name={`exceptions[${index}].closed`}>
                  {(closedField) => (
                    <label className="inline-flex items-center gap-1.5 text-[12.5px]">
                      <input type="checkbox" checked={closedField.state.value} onChange={(event) => closedField.handleChange(event.target.checked)} /> Closed all day
                    </label>
                  )}
                </form.Field>
                <form.Subscribe selector={(state) => state.values.exceptions[index]?.closed}>
                  {(closed) =>
                    closed ? null : (
                      <form.Field name={`exceptions[${index}].ranges`}>
                        {(rangesField) => (
                          <span className="flex flex-col">
                            <RangesEditor label={`Exception ${index + 1}`} ranges={rangesField.state.value} onChange={(ranges) => rangesField.handleChange(ranges)} />
                            <FieldError id={`exc-${index}-err`} error={rangesField.state.meta.errors[0]} />
                          </span>
                        )}
                      </form.Field>
                    )
                  }
                </form.Subscribe>
                <form.Field name={`exceptions[${index}].note`}>
                  {(noteField) => (
                    <input aria-label="Note" placeholder="Note (only you see it)" maxLength={200} className="dash-field h-8 min-w-0 flex-1 px-2 text-[12.5px]" value={noteField.state.value} onChange={(event) => noteField.handleChange(event.target.value)} />
                  )}
                </form.Field>
                <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12px]" onClick={() => field.removeValue(index)}>Remove</button>
              </div>
            ))}
            <FieldError id="exceptions-err" error={field.state.meta.errors[0]} />
            <button type="button" className="dash-btn dash-btn-quiet h-8 self-start text-[12px]" onClick={() => field.pushValue({ date: berlinToday(), closed: true, ranges: [], note: '' })}>
              <Plus className="size-3.5" aria-hidden="true" /> Add exception
            </button>
          </div>
        )}
      </form.Field>

      {failure ? <DialogAlert>{failure}</DialogAlert> : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(submitting) => (
          <button type="submit" className="dash-btn dash-btn-primary self-start" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Save hours
          </button>
        )}
      </form.Subscribe>
    </form>
  )
}

const CHOICES = {
  minNoticeMinutes: [[0, 'No minimum'], [120, '2 hours ahead'], [720, '12 hours ahead'], [1440, '24 hours ahead'], [2880, '48 hours ahead'], [10080, '1 week ahead']],
  windowDays: [[14, '14 days ahead'], [30, '30 days ahead'], [60, '60 days ahead'], [90, '90 days ahead'], [180, '180 days ahead'], [365, '1 year ahead']],
  changeLimitHours: [[0, 'Until it starts'], [6, '6 hours before'], [12, '12 hours before'], [24, '24 hours before'], [48, '48 hours before']],
  reminderMinutes: [[60, '1 hour before'], [120, '2 hours before'], [1440, '24 hours before'], [2880, '48 hours before']],
} as const

function LimitsForm({ settings }: { settings: BookingSettings }) {
  const save = useSaveSettings()
  const [failure, setFailure] = useState<string | null>(null)

  const form = useForm({
    defaultValues: {
      minNoticeMinutes: settings.minNoticeMinutes,
      windowDays: settings.windowDays,
      changeLimitHours: settings.changeLimitHours,
      reminderMinutes: settings.reminderMinutes,
    },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Record<string, string> = {}

        for (const key of Object.keys(SETTINGS_BOUNDS) as Array<keyof typeof SETTINGS_BOUNDS>) {
          const bounds = SETTINGS_BOUNDS[key]

          if (value[key] < bounds.min || value[key] > bounds.max) fields[key] = 'That value is outside the allowed range'
        }

        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        await save.mutateAsync(value)
        notify.success('Limits saved. Reminders not yet sent follow the new timing.')
      } catch (error) {
        setFailure(messageFromError(error))
      }
    },
  })

  const select = (name: keyof typeof CHOICES, label: string) => (
    <form.Field name={name}>
      {(field) => {
        const options = CHOICES[name] as ReadonlyArray<readonly [number, string]>
        const known = options.some(([value]) => value === field.state.value)

        return (
          <label className="flex flex-col gap-1 text-[12px] text-[var(--dash-quiet)]">
            {label}
            <select className="dash-field h-9 px-2 text-[13px] text-[var(--dash-ink)]" value={field.state.value} onChange={(event) => field.handleChange(Number(event.target.value))}>
              {known ? null : <option value={field.state.value}>Current: {field.state.value}</option>}
              {options.map(([value, text]) => (
                <option key={value} value={value}>{text}</option>
              ))}
            </select>
            <FieldError id={`${name}-err`} error={field.state.meta.errors[0]} />
          </label>
        )
      }}
    </form.Field>
  )

  return (
    <form
      noValidate
      className="flex flex-col gap-3 px-5 pb-5"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      {select('minNoticeMinutes', 'Earliest booking')}
      {select('windowDays', 'Booking window')}
      {select('changeLimitHours', 'Visitors can change or cancel')}
      {select('reminderMinutes', 'Reminder email')}
      <p className="text-[12px] text-[var(--dash-quiet)]">These limit visitors only — you can book anything from here. Saving never moves appointments already confirmed.</p>
      {failure ? <DialogAlert>{failure}</DialogAlert> : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(submitting) => (
          <button type="submit" className="dash-btn dash-btn-primary self-start" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Save limits
          </button>
        )}
      </form.Subscribe>
    </form>
  )
}

export function HoursTab() {
  const availability = useAvailability()
  const settings = useBookingSettings()

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Panel>
        <PanelHead title="Weekly hours" note="Berlin time" />
        {availability.isPending ? (
          <div className="px-5 pb-5"><span className="dash-skeleton block h-48 rounded" /></div>
        ) : availability.isError ? (
          <LoadFailure title="Hours could not load" message={messageFromError(availability.error)} onRetry={() => void availability.refetch()} />
        ) : (
          <HoursForm availability={availability.data} />
        )}
      </Panel>
      <Panel>
        <PanelHead title="Limits for visitors" />
        {settings.isPending ? (
          <div className="px-5 pb-5"><span className="dash-skeleton block h-40 rounded" /></div>
        ) : settings.isError ? (
          <LoadFailure title="Limits could not load" message={messageFromError(settings.error)} onRetry={() => void settings.refetch()} />
        ) : (
          <LimitsForm settings={settings.data} />
        )}
      </Panel>
    </div>
  )
}
