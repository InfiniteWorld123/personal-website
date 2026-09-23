import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import { ArrowLeft, Loader2, Mail, Video } from 'lucide-react'
import { BUDGET_LABELS, SUBJECT_LABELS, type AppointmentDetail } from '#/backend2/contracts/booking.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { Panel, StatusChip } from '#/frontend/dashboard/primitives'
import { BlogDialog, DialogActions, DialogAlert, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import { berlin, berlinDateTime, berlinInstant } from '#/frontend/features/booking-v2/berlin'
import {
  useAppointment,
  useCancelAppointment,
  useEndVideo,
  useJoinVideo,
  usePatchAppointment,
  useSendInvitation,
  useSetOutcome,
} from '#/frontend/features/booking-v2/queries'
import { messageFromError, notify } from '#/frontend/lib/notify'
import { LoadFailure } from '../blog/blog-parts'
import { AppointmentStatusChip, FieldError, LANGUAGE_NAMES, METHOD_WORDS } from './calendar-parts'

/**
 * One appointment: who, when (in Berlin, and what the visitor sees), how,
 * what they wrote, its emails and its history — and what the owner can do
 * with it now. Every change that the visitor should know about emails them,
 * unless the owner unticks it.
 */

const HISTORY_WORDS: Record<string, string> = {
  created: 'Booked',
  rescheduled: 'Moved',
  cancelled: 'Cancelled',
  completed: 'Marked completed',
  no_show: 'Marked no show',
  details_changed: 'Details changed',
  confirmation_sent: 'Confirmation sent',
  invitation_sent: 'Invitation sent',
  rescheduled_sent: 'Change email sent',
  cancelled_sent: 'Cancellation email sent',
  reminder_sent: 'Reminder sent',
  email_failed: 'An email could not be sent',
  video_ended: 'Video call ended',
}

const REMINDER_WORDS: Record<AppointmentDetail['reminderState'], string> = {
  pending: 'Scheduled',
  sent: 'Sent',
  skipped: 'Skipped — booked after its time',
  failed: 'Could not be sent',
  cancelled: 'Cancelled with the appointment',
}

function MoveDialog({ appointment, onClose }: { appointment: AppointmentDetail; onClose: () => void }) {
  const patch = usePatchAppointment()
  const [failure, setFailure] = useState<string | null>(null)
  const current = berlin(appointment.startsAt)

  const form = useForm({
    defaultValues: { date: current.date, time: current.time, notify: true },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const instant = berlinInstant(value.date, value.time)

        if (!instant) return { fields: { time: 'That time does not exist on this day (the clocks change)' } }
        if (Date.parse(instant) <= Date.now()) return { fields: { time: 'Choose a time in the future' } }

        return undefined
      },
    },
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        await patch.mutateAsync({ id: appointment.id, revision: appointment.revision, startsAt: berlinInstant(value.date, value.time)!, notify: value.notify })
        notify.success(value.notify ? `Moved. ${appointment.visitorName} has been emailed the new time.` : 'Moved. No email was sent.')
        onClose()
      } catch (error) {
        setFailure(
          error instanceof ApiRequestError && error.code === 'SLOT_UNAVAILABLE'
            ? 'That time overlaps a confirmed appointment. Choose another.'
            : messageFromError(error),
        )
      }
    },
  })

  return (
    <BlogDialog labelledBy="move-title" size="sm" onClose={onClose}>
      <DialogTitle id="move-title">Move to another time</DialogTitle>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <div className="grid grid-cols-2 gap-2.5">
          <form.Field name="date">
            {(field) => (
              <label className="flex flex-col gap-1 text-[12px] text-[var(--dash-quiet)]">
                Day
                <input type="date" className="dash-field h-9 px-2.5 text-[13px]" value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} />
              </label>
            )}
          </form.Field>
          <form.Field name="time">
            {(field) => (
              <label className="flex flex-col gap-1 text-[12px] text-[var(--dash-quiet)]">
                Time (Berlin)
                <input type="time" step={300} className="dash-field h-9 px-2.5 text-[13px]" value={field.state.value} aria-invalid={field.state.meta.errors.length > 0} aria-describedby="move-time-err" onChange={(event) => field.handleChange(event.target.value)} />
                <FieldError id="move-time-err" error={field.state.meta.errors[0]} />
              </label>
            )}
          </form.Field>
        </div>
        <form.Field name="notify">
          {(field) => (
            <label className="inline-flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={field.state.value} onChange={(event) => field.handleChange(event.target.checked)} />
              Email {appointment.visitorName} the new time
            </label>
          )}
        </form.Field>
        {failure ? <DialogAlert>{failure}</DialogAlert> : null}
        <DialogActions>
          <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>Cancel</button>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(submitting) => (
              <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Move
              </button>
            )}
          </form.Subscribe>
        </DialogActions>
      </form>
    </BlogDialog>
  )
}

function CancelDialog({ appointment, onClose }: { appointment: AppointmentDetail; onClose: () => void }) {
  const cancel = useCancelAppointment()
  const [failure, setFailure] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { reason: '', notify: true },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => (value.reason.trim() === '' ? { fields: { reason: 'Give a reason — it is sent to the visitor' } } : undefined),
    },
    onSubmitInvalid: () => window.requestAnimationFrame(() => document.getElementById('cancel-reason')?.focus()),
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        await cancel.mutateAsync({ id: appointment.id, reason: value.reason.trim(), notify: value.notify })
        notify.success(value.notify ? `Cancelled. ${appointment.visitorName} has been emailed.` : 'Cancelled. No email was sent.')
        onClose()
      } catch (error) {
        setFailure(messageFromError(error))
      }
    },
  })

  return (
    <BlogDialog labelledBy="cancel-title" role="alertdialog" size="sm" onClose={onClose}>
      <DialogTitle id="cancel-title">Cancel this appointment?</DialogTitle>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <p className="text-[13px] text-[var(--dash-quiet)]">The time goes back on the calendar.</p>
        <form.Field name="reason">
          {(field) => (
            <label className="flex flex-col gap-1 text-[12px] text-[var(--dash-quiet)]">
              Reason
              <textarea id="cancel-reason" rows={3} dir="auto" className="dash-field px-2.5 py-2 text-[13px] text-[var(--dash-ink)]" value={field.state.value} aria-invalid={field.state.meta.errors.length > 0} aria-describedby="cancel-reason-err" onChange={(event) => field.handleChange(event.target.value)} />
              <FieldError id="cancel-reason-err" error={field.state.meta.errors[0]} />
            </label>
          )}
        </form.Field>
        <form.Field name="notify">
          {(field) => (
            <label className="inline-flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={field.state.value} onChange={(event) => field.handleChange(event.target.checked)} />
              Email {appointment.visitorName} the cancellation and reason
            </label>
          )}
        </form.Field>
        {failure ? <DialogAlert>{failure}</DialogAlert> : null}
        <DialogActions>
          <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>Keep it</button>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(submitting) => (
              <button type="submit" className="dash-btn dash-tone-red" disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Cancel appointment
              </button>
            )}
          </form.Subscribe>
        </DialogActions>
      </form>
    </BlogDialog>
  )
}

export function AppointmentDetailPanel({ id, onBack }: { id: string; onBack: () => void }) {
  const appointment = useAppointment(id)
  const invite = useSendInvitation()
  const outcome = useSetOutcome()
  const join = useJoinVideo()
  const end = useEndVideo()
  const [dialog, setDialog] = useState<'move' | 'cancel' | null>(null)
  const [videoNote, setVideoNote] = useState<string | null>(null)

  if (appointment.isPending) {
    return (
      <Panel className="gap-3 p-5" aria-busy="true">
        <span className="dash-skeleton h-6 w-1/2 rounded" />
        <span className="dash-skeleton h-40 w-full rounded" />
      </Panel>
    )
  }

  if (appointment.isError) {
    return (
      <Panel>
        <LoadFailure title="This appointment could not be opened" message={messageFromError(appointment.error)} onRetry={() => void appointment.refetch()} />
      </Panel>
    )
  }

  const a = appointment.data
  const started = Date.parse(a.startsAt) <= Date.now()
  const confirmed = a.status === 'confirmed'
  const visitorTold = a.source === 'public' || Boolean(a.invitationSentAt)
  const visitorSees =
    a.visitorTimeZone !== 'Europe/Berlin'
      ? new Date(a.startsAt).toLocaleString('en-GB', { timeZone: a.visitorTimeZone, weekday: 'short', hour: '2-digit', minute: '2-digit' })
      : null

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn()
      notify.success(done)
    } catch (error) {
      notify.error(messageFromError(error))
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Panel className="gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="dash-btn dash-btn-ghost h-8 px-1 text-[12px]" onClick={onBack}>
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Calendar
          </button>
          <span className="ms-auto flex gap-1.5">
            {a.outsideHours ? <StatusChip tone="outline">Outside your hours</StatusChip> : null}
            <AppointmentStatusChip status={a.status} />
          </span>
        </div>
        <h2 className="dash-title text-[21px]" dir="auto">{a.visitorName} · {a.typeName}</h2>

        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-5 gap-y-2 text-[13px]">
          <dt className="text-[var(--dash-quiet)]">When</dt>
          <dd>
            <span className="font-medium">{berlinDateTime(a.startsAt)} – {berlin(a.endsAt).time} Berlin</span>
            {visitorSees ? <span className="block text-[12px] text-[var(--dash-quiet)]">They see {visitorSees} ({a.visitorTimeZone.replace('_', ' ')})</span> : null}
          </dd>
          <dt className="text-[var(--dash-quiet)]">How</dt>
          <dd>{METHOD_WORDS[a.method]} · {a.durationMinutes} min{a.bufferMinutes ? ` + ${a.bufferMinutes} min buffer` : ''}</dd>
          <dt className="text-[var(--dash-quiet)]">Email</dt>
          <dd dir="ltr" className="text-start">{a.visitorEmail}</dd>
          {a.visitorPhone ? (<><dt className="text-[var(--dash-quiet)]">Phone</dt><dd dir="ltr" className="text-start">{a.visitorPhone}</dd></>) : null}
          {a.company ? (<><dt className="text-[var(--dash-quiet)]">Company</dt><dd>{a.company}</dd></>) : null}
          {a.subject || a.budget ? (
            <>
              <dt className="text-[var(--dash-quiet)]">About</dt>
              <dd>{[a.subject ? SUBJECT_LABELS[a.subject as keyof typeof SUBJECT_LABELS] : null, a.budget ? BUDGET_LABELS[a.budget as keyof typeof BUDGET_LABELS] : null].filter(Boolean).join(' · ')}</dd>
            </>
          ) : null}
          {a.note ? (<><dt className="text-[var(--dash-quiet)]">Note</dt><dd className="whitespace-pre-wrap" dir="auto">{a.note}</dd></>) : null}
          <dt className="text-[var(--dash-quiet)]">Reference</dt>
          <dd>{a.reference} · {a.source === 'public' ? 'booked on the website' : 'created by you'}, {LANGUAGE_NAMES[a.language]}</dd>
          {a.cancelReason ? (<><dt className="text-[var(--dash-quiet)]">Reason</dt><dd dir="auto">{a.cancelReason} ({a.cancelledBy === 'owner' ? 'you' : 'the visitor'})</dd></>) : null}
        </dl>

        {confirmed ? (
          <div className="flex flex-wrap gap-1.5">
            {a.method === 'video' && !a.videoEndedAt ? (
              <button
                type="button"
                className="dash-btn dash-btn-primary h-9"
                disabled={join.isPending}
                onClick={async () => {
                  setVideoNote(null)

                  try {
                    await join.mutateAsync(a.id)
                    setVideoNote('Room access issued. The call screen connects once the video service is switched on — until then this is a test room.')
                  } catch (error) {
                    setVideoNote(messageFromError(error))
                  }
                }}
              >
                <Video className="size-4" aria-hidden="true" /> Join video call
              </button>
            ) : null}
            {a.method === 'video' && !a.videoEndedAt && started ? (
              <button type="button" className="dash-btn dash-btn-quiet h-9" onClick={() => void run(() => end.mutateAsync(a.id), 'Call ended. Nobody can join it again.')}>
                End call
              </button>
            ) : null}
            <button type="button" className="dash-btn dash-btn-quiet h-9" onClick={() => setDialog('move')}>Move…</button>
            <button type="button" className="dash-btn dash-btn-ghost h-9 text-[var(--dash-red-ink)]" onClick={() => setDialog('cancel')}>Cancel…</button>
            {a.source === 'manual' && !a.invitationSentAt ? (
              <button type="button" className="dash-btn dash-btn-quiet h-9" disabled={invite.isPending} onClick={() => void run(() => invite.mutateAsync(a.id), `Invitation sent to ${a.visitorEmail}`)}>
                <Mail className="size-4" aria-hidden="true" /> Send invitation
              </button>
            ) : null}
            <button type="button" className="dash-btn dash-btn-ghost h-9" disabled={!started || outcome.isPending} title={started ? undefined : 'Available once it has started'} onClick={() => void run(() => outcome.mutateAsync({ id: a.id, status: 'completed' }), 'Marked completed')}>
              Completed
            </button>
            <button type="button" className="dash-btn dash-btn-ghost h-9" disabled={!started || outcome.isPending} title={started ? undefined : 'Available once it has started'} onClick={() => void run(() => outcome.mutateAsync({ id: a.id, status: 'no_show' }), 'Marked no show')}>
              No show
            </button>
          </div>
        ) : null}
        {videoNote ? <p role="status" className="rounded-[9px] bg-[var(--dash-blue-tint)] px-3 py-2 text-[12.5px] text-[var(--dash-blue-ink)]">{videoNote}</p> : null}
        {a.source === 'manual' && !visitorTold && confirmed ? (
          <p className="text-[12px] text-[var(--dash-quiet)]">Not sent yet: {a.visitorName} has not been told about this appointment, and gets no reminder or change emails until you send the invitation.</p>
        ) : null}
      </Panel>

      <Panel className="gap-3 p-5">
        <h3 className="text-sm font-semibold">Emails</h3>
        <p className="text-[12.5px] text-[var(--dash-quiet)]">
          Reminder: {REMINDER_WORDS[a.reminderState]}
          {a.reminderState === 'pending' && a.reminderDueAt ? ` · ${berlinDateTime(a.reminderDueAt)} Berlin` : ''}
        </p>
        {a.inboxConversationId ? (
          <Link to="/dashboard/inbox" search={{ c: a.inboxConversationId }} className="dash-btn dash-btn-quiet h-9 self-start">
            Open conversation in Inbox →
          </Link>
        ) : (
          <p className="text-[12.5px] text-[var(--dash-quiet)]">No email yet, so there is no conversation.</p>
        )}

        <h3 className="mt-2 text-sm font-semibold">History</h3>
        <ol className="flex flex-col gap-1.5 text-[12.5px]">
          {a.history.map((entry, index) => (
            <li key={index} className="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
              <span className="dash-num text-[var(--dash-quiet)]">{berlinDateTime(entry.at).replace(/ \d{4},/u, ',')}</span>
              <span>
                {HISTORY_WORDS[entry.kind] ?? entry.kind}
                {entry.actor === 'visitor' ? ' by the visitor' : entry.actor === 'owner' ? ' by you' : ''}
              </span>
            </li>
          ))}
        </ol>
      </Panel>

      {dialog === 'move' ? <MoveDialog appointment={a} onClose={() => setDialog(null)} /> : null}
      {dialog === 'cancel' ? <CancelDialog appointment={a} onClose={() => setDialog(null)} /> : null}
    </div>
  )
}
