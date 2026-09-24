import { useEffect, useMemo, useRef, useState } from 'react'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import * as v from 'valibot'
import {
  BOOKING_LANGUAGES,
  BUDGET_CHOICES,
  BUDGET_LABELS,
  type BookingLanguage,
  type BookingMethod,
  SUBJECT_CHOICES,
  SUBJECT_LABELS,
} from '#/backend2/contracts/booking.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DialogAlert } from '#/frontend/features/blog-v2/BlogDialog'
import { addDays, berlinInstant, berlinToday, isoWeekday, textMinute } from '#/frontend/features/booking-v2/berlin'
import { useAvailability, useCreateAppointment, useTypes } from '#/frontend/features/booking-v2/queries'
import { messageFromError, notify } from '#/frontend/lib/notify'
import { FieldError, LANGUAGE_NAMES, METHOD_WORDS } from './calendar-parts'

/**
 * The owner's own appointment, in a side panel over the week (approved
 * choice 4A). Any future time — the visitor limits do not apply — with a
 * warning outside the week's hours, and never an overlap: the server refuses
 * that, and the refusal is shown here.
 */

const EmailSchema = v.pipe(v.string(), v.trim(), v.email())

export function ManualAppointmentDrawer({ onClose, onCreated, initialDate }: { onClose: () => void; onCreated: (id: string) => void; initialDate?: string }) {
  const types = useTypes(1, 100)
  const availability = useAvailability()
  const create = useCreateAppointment()
  const [failure, setFailure] = useState<string | null>(null)
  const sendRef = useRef(false)
  const panel = useRef<HTMLDivElement>(null)

  const form = useForm({
    defaultValues: {
      typeId: '',
      method: 'video' as BookingMethod,
      // Tomorrow by default: 10:00 today has usually passed by the time the panel opens.
      // The week on screen may be a past one; its Monday is then no default at all.
      date: initialDate && initialDate > addDays(berlinToday(), 1) ? initialDate : addDays(berlinToday(), 1),
      time: '10:00',
      name: '',
      email: '',
      phone: '',
      company: '',
      subject: '' as string,
      budget: '' as string,
      note: '',
      language: 'en' as BookingLanguage,
    },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Record<string, string> = {}
        const instant = berlinInstant(value.date, value.time)

        if (!value.typeId) fields.typeId = 'Choose a type'
        if (!value.date) fields.date = 'Choose a day'
        if (!instant) fields.time = 'That time does not exist on this day (the clocks change)'
        else if (Date.parse(instant) <= Date.now()) fields.time = 'Choose a time in the future'
        if (value.name.trim() === '') fields.name = 'Enter a name'
        if (!v.safeParse(EmailSchema, value.email).success) fields.email = 'Enter a valid email address'
        if (value.method === 'phone' && value.phone.trim() === '') fields.phone = 'A phone call needs a phone number'

        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmitInvalid: () => window.requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()),
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        const created = await create.mutateAsync({
          typeId: value.typeId,
          method: value.method,
          startsAt: berlinInstant(value.date, value.time)!,
          language: value.language,
          visitorTimeZone: 'Europe/Berlin',
          name: value.name.trim(),
          email: value.email.trim(),
          phone: value.phone.trim(),
          company: value.company.trim(),
          subject: value.subject || null,
          budget: value.budget || null,
          note: value.note.trim(),
          sendInvitation: sendRef.current,
        })

        notify.success(
          !sendRef.current
            ? 'Saved. No email was sent.'
            : created.invitation === 'accepted'
              ? `Saved and invitation sent to ${created.visitorEmail}`
              : 'Saved, but the invitation could not be sent. Retry it from the Inbox conversation.',
        )
        onCreated(created.id)
      } catch (error) {
        setFailure(
          error instanceof ApiRequestError && error.code === 'SLOT_UNAVAILABLE'
            ? 'That time overlaps a confirmed appointment. Choose another time.'
            : messageFromError(error),
        )
      }
    },
  })

  const values = useStore(form.store, (state) => state.values)
  const submitting = useStore(form.store, (state) => state.isSubmitting)
  const [confirmingClose, setConfirmingClose] = useState(false)

  /*
   * Closing throws the panel away, so a panel holding someone's details asks
   * first. Only what the owner typed counts: the type and the method are
   * filled in for them and are not work to lose.
   */
  const typed = [values.name, values.email, values.phone, values.company, values.note, values.subject, values.budget].some(
    (text) => text.trim() !== '',
  )
  const typedRef = useRef(typed)
  typedRef.current = typed
  const requestClose = useRef(() => {})
  requestClose.current = () => {
    if (typedRef.current && !confirmingClose) setConfirmingClose(true)
    else if (!typedRef.current) onClose()
  }
  const typeList = types.data?.items ?? []
  const type = typeList.find((item) => item.id === values.typeId)

  // The first type is chosen for the owner, and the method follows the type.
  useEffect(() => {
    if (!values.typeId && typeList[0]) form.setFieldValue('typeId', typeList[0].id)
  }, [typeList, values.typeId, form])

  useEffect(() => {
    if (type && !type.methods.includes(values.method)) form.setFieldValue('method', type.methods[0]!)
  }, [type, values.method, form])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose.current()
    }

    window.addEventListener('keydown', onKey)
    panel.current?.querySelector<HTMLElement>('select, input')?.focus()

    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const outsideHours = useMemo(() => {
    if (!type || !availability.data || !values.date) return false

    const start = textMinute(values.time)
    const end = start + type.durationMinutes
    const exception = availability.data.exceptions.find((item) => item.date === values.date)
    const ranges = exception ? exception.ranges : availability.data.weekly.filter((range) => range.weekday === isoWeekday(values.date))

    return !ranges.some((range) => start >= range.startMinute && end <= range.endMinute)
  }, [type, availability.data, values.date, values.time])

  const input = 'dash-field h-9 w-full px-2.5 text-[13px]'
  const label = 'flex flex-col gap-1 text-[12px] text-[var(--dash-quiet)]'

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(10,14,26,0.35)]" onMouseDown={(event) => event.target === event.currentTarget && requestClose.current()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="manual-title" className="flex h-full w-full max-w-[460px] flex-col bg-[var(--dash-surface)] shadow-[var(--dash-shadow)]">
        <header className="flex items-center gap-2 border-b border-[var(--dash-line)] px-4 py-3">
          <h2 id="manual-title" className="dash-title text-[19px]">New appointment</h2>
          <button type="button" className="dash-btn dash-btn-ghost ms-auto h-8 px-2" onClick={() => requestClose.current()} aria-label="Close">
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            {confirmingClose ? (
              <div role="alertdialog" aria-labelledby="manual-discard" className="dash-panel flex flex-col gap-2 p-3">
                <p id="manual-discard" className="text-[13px] font-semibold">
                  Close without saving? What you typed here is lost.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="dash-btn dash-btn-quiet h-8" onClick={onClose}>
                    Close without saving
                  </button>
                  <button type="button" className="dash-btn dash-btn-primary h-8" autoFocus onClick={() => setConfirmingClose(false)}>
                    Keep editing
                  </button>
                </div>
              </div>
            ) : null}
            {types.isSuccess && typeList.length === 0 ? (
              <DialogAlert>Create an appointment type first, under Types.</DialogAlert>
            ) : null}

            <div className="grid grid-cols-2 gap-2.5">
              <form.Field name="typeId">
                {(field) => (
                  <label className={label}>
                    Type
                    <select className={input} value={field.state.value} aria-invalid={field.state.meta.errors.length > 0} aria-describedby="m-type-err" onChange={(event) => field.handleChange(event.target.value)}>
                      {typeList.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.texts.en.name || item.slug} · {item.durationMinutes} min{item.enabled ? '' : ' (hidden)'}
                        </option>
                      ))}
                    </select>
                    <FieldError id="m-type-err" error={field.state.meta.errors[0]} />
                  </label>
                )}
              </form.Field>
              <form.Field name="method">
                {(field) => (
                  <label className={label}>
                    How
                    <select className={input} value={field.state.value} onChange={(event) => field.handleChange(event.target.value as BookingMethod)}>
                      {(type?.methods ?? ['video']).map((method) => (
                        <option key={method} value={method}>{METHOD_WORDS[method]}</option>
                      ))}
                    </select>
                  </label>
                )}
              </form.Field>
              <form.Field name="date">
                {(field) => (
                  <label className={label}>
                    Day
                    <input type="date" className={input} value={field.state.value} aria-invalid={field.state.meta.errors.length > 0} onChange={(event) => field.handleChange(event.target.value)} />
                    <FieldError id="m-date-err" error={field.state.meta.errors[0]} />
                  </label>
                )}
              </form.Field>
              <form.Field name="time">
                {(field) => (
                  <label className={label}>
                    Time (Berlin)
                    <input type="time" step={300} className={input} value={field.state.value} aria-invalid={field.state.meta.errors.length > 0} aria-describedby="m-time-err" onChange={(event) => field.handleChange(event.target.value)} />
                    <FieldError id="m-time-err" error={field.state.meta.errors[0]} />
                  </label>
                )}
              </form.Field>
            </div>

            {outsideHours ? (
              <p role="status" className="flex gap-2 rounded-[9px] bg-[var(--dash-amber-tint,#fff4dc)] px-3 py-2 text-[12.5px] text-[#8a5a00]">
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                This is outside your hours. You can still save it — visitors cannot book this time.
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2.5">
              <form.Field name="name">
                {(field) => (
                  <label className={label}>
                    Name
                    <input className={input} value={field.state.value} autoComplete="off" aria-invalid={field.state.meta.errors.length > 0} aria-describedby="m-name-err" onChange={(event) => field.handleChange(event.target.value)} />
                    <FieldError id="m-name-err" error={field.state.meta.errors[0]} />
                  </label>
                )}
              </form.Field>
              <form.Field name="email">
                {(field) => (
                  <label className={label}>
                    Email
                    <input type="email" dir="ltr" className={input} value={field.state.value} autoComplete="off" aria-invalid={field.state.meta.errors.length > 0} aria-describedby="m-email-err" onChange={(event) => field.handleChange(event.target.value)} />
                    <FieldError id="m-email-err" error={field.state.meta.errors[0]} />
                  </label>
                )}
              </form.Field>
              <form.Field name="phone">
                {(field) => (
                  <label className={label}>
                    Phone {values.method === 'phone' ? '' : '(optional)'}
                    <input type="tel" dir="ltr" className={input} value={field.state.value} aria-invalid={field.state.meta.errors.length > 0} aria-describedby="m-phone-err" onChange={(event) => field.handleChange(event.target.value)} />
                    <FieldError id="m-phone-err" error={field.state.meta.errors[0]} />
                  </label>
                )}
              </form.Field>
              <form.Field name="language">
                {(field) => (
                  <label className={label}>
                    Email language
                    <select className={input} value={field.state.value} onChange={(event) => field.handleChange(event.target.value as BookingLanguage)}>
                      {BOOKING_LANGUAGES.map((language) => (
                        <option key={language} value={language}>{LANGUAGE_NAMES[language]}</option>
                      ))}
                    </select>
                  </label>
                )}
              </form.Field>
              <form.Field name="subject">
                {(field) => (
                  <label className={label}>
                    What is it about (optional)
                    <select className={input} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)}>
                      <option value="">—</option>
                      {SUBJECT_CHOICES.map((choice) => <option key={choice} value={choice}>{SUBJECT_LABELS[choice]}</option>)}
                    </select>
                  </label>
                )}
              </form.Field>
              <form.Field name="budget">
                {(field) => (
                  <label className={label}>
                    Budget range (optional)
                    <select className={input} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)}>
                      <option value="">—</option>
                      {BUDGET_CHOICES.map((choice) => <option key={choice} value={choice}>{BUDGET_LABELS[choice]}</option>)}
                    </select>
                  </label>
                )}
              </form.Field>
            </div>
            <form.Field name="company">
              {(field) => (
                <label className={label}>
                  Company (optional)
                  <input className={input} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} />
                </label>
              )}
            </form.Field>
            <form.Field name="note">
              {(field) => (
                <label className={label}>
                  Note — only you see it
                  <textarea rows={3} className="dash-field w-full px-2.5 py-2 text-[13px]" value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} />
                </label>
              )}
            </form.Field>

            <p className="text-[12px] text-[var(--dash-quiet)]">
              <b>Save &amp; send invitation</b> emails the details and the private change/cancel link, in the language above. <b>Save only</b> sends nothing; you can send the invitation later from the appointment.
            </p>
            {failure ? <DialogAlert>{failure}</DialogAlert> : null}
          </div>

          <footer className="flex flex-wrap gap-2 border-t border-[var(--dash-line)] px-4 py-3">
            <button type="submit" className="dash-btn dash-btn-quiet" disabled={submitting} onClick={() => { sendRef.current = false }}>
              Save only
            </button>
            <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting} onClick={() => { sendRef.current = true }}>
              {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Save &amp; send invitation
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
