import { useState } from 'react'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import { AlertTriangle, CalendarClock, Loader2 } from 'lucide-react'
import {
  type OwnerBlogPost,
  SCHEDULE_HORIZON_DAYS,
  berlinWallTimeToInstant,
} from '#/backend2/contracts/blog.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { BlogDialog, DialogAlert, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import {
  berlinLong,
  berlinShort,
  berlinTomorrow,
  localTimeIfNotBerlin,
  nextBerlinWeekday,
} from '#/frontend/features/blog-v2/blog-time'
import { useCancelSchedule, useScheduleArticle } from '#/frontend/features/blog-v2/queries'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'

/**
 * Schedule the first publication, or change a schedule — on the clock in
 * Berlin (`docs/v2/blog.md`), whatever zone the laptop is in.
 *
 * Scheduling freezes what is saved. Changing the time keeps that frozen
 * version unless the owner explicitly replaces it with the draft saved now.
 * A time the clocks skip in spring is refused here with the server's own
 * sentence, because the arithmetic is the contract's.
 */

type Values = { date: string; time: string; snapshot: 'draft' | 'keep' }

/** What is wrong with a chosen time, or nothing. */
export const scheduleProblem = (date: string, time: string, now: number = Date.now()): string | null => {
  if (date === '') return 'Choose a date'
  if (time === '') return 'Choose a time'

  const at = berlinWallTimeToInstant(date, time)

  if (!at) return 'That time does not exist in Berlin: the clocks go forward that night. Choose another time.'
  if (at.getTime() <= now) return 'Choose a time in the future'
  if (at.getTime() > now + SCHEDULE_HORIZON_DAYS * 24 * 60 * 60 * 1000) return 'Choose a time within the next year'

  return null
}

export function ScheduleDialog({
  article,
  unsaved,
  onPublishNow,
  onClose,
}: {
  article: OwnerBlogPost
  /** Typed but not saved on the editor: it is not part of any schedule. */
  unsaved: boolean
  /** "Publish now instead": cancels the schedule, then publishes the saved draft. */
  onPublishNow: () => Promise<void>
  onClose: () => void
}) {
  const schedule = useScheduleArticle()
  const cancel = useCancelSchedule()
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState<'cancel' | 'now' | null>(null)
  const current = article.schedule
  const draftDiffers = current !== null && !current.matchesDraft
  const draftReady = article.publishIssues.length === 0

  const form = useForm({
    defaultValues: {
      date: current ? current.publishAtBerlin.date : nextBerlinWeekday(2),
      time: current ? current.publishAtBerlin.time : '09:00',
      snapshot: current ? 'keep' : 'draft',
    } as Values,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const problem = scheduleProblem(value.date, value.time)

        if (!problem) return undefined

        // A day that is missing, or in the past, is the date's fault; everything else is the time's.
        return { fields: problem === 'Choose a date' ? { date: problem } : { time: problem } }
      },
    },
    onSubmitInvalid: () => {
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('#schedule-form [aria-invalid="true"]')?.focus())
    },
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        const saved = await schedule.mutateAsync({
          id: article.id,
          draftRevision: article.draftRevision,
          date: value.date,
          time: value.time,
          snapshot: value.snapshot,
        })

        notify.success(`Scheduled for ${berlinShort(new Date(saved.schedule!.publishAt))} Berlin`)
        onClose()
      } catch (caught) {
        setFailure(caught instanceof ApiRequestError ? caught.message : 'The schedule could not be saved. Nothing changed.')
      }
    },
  })

  const quick = [
    { label: 'Tomorrow 09:00', date: berlinTomorrow(), time: '09:00' },
    { label: 'Next Monday 09:00', date: nextBerlinWeekday(1), time: '09:00' },
    { label: 'Next Saturday 10:00', date: nextBerlinWeekday(6), time: '10:00' },
  ]

  const handleCancel = async () => {
    setBusy('cancel')
    setFailure(null)

    try {
      await cancel.mutateAsync(article.id)
      notify.success('Schedule cancelled — it is a draft again')
      onClose()
    } catch (caught) {
      setFailure(caught instanceof ApiRequestError ? caught.message : 'The schedule could not be cancelled.')
      setBusy(null)
    }
  }

  const handlePublishNow = async () => {
    setBusy('now')
    setFailure(null)

    try {
      await cancel.mutateAsync(article.id)
      onClose()
      await onPublishNow()
    } catch (caught) {
      setFailure(caught instanceof ApiRequestError ? caught.message : 'That did not work. Nothing was published.')
      setBusy(null)
    }
  }

  return (
    <BlogDialog labelledBy="schedule-title" describedBy="schedule-lead" onClose={onClose}>
      <form
        id="schedule-form"
        noValidate
        className="flex flex-col gap-3.5"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <DialogTitle id="schedule-title">{current ? 'Change the schedule' : 'Schedule the first publication'}</DialogTitle>
        <p id="schedule-lead" className="text-[13px] text-[var(--dash-quiet)]">
          {current
            ? `Now: ${berlinLong(new Date(current.publishAt))} (Berlin).`
            : 'What you have saved is frozen now and published at the time you choose — in all three languages, once.'}
        </p>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick choices">
          {quick.map((choice) => (
            <button
              key={choice.label}
              type="button"
              className="h-7 rounded-full border border-[var(--dash-line)] bg-[var(--dash-input)] px-3 text-[12px] font-semibold text-[var(--dash-quiet)] hover:border-[var(--dash-brand)] hover:text-[var(--dash-ink)]"
              onClick={() => {
                form.setFieldValue('date', choice.date)
                form.setFieldValue('time', choice.time)
              }}
            >
              {choice.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <form.Field name="date">
            {(field) => {
              const error = field.state.meta.errors[0] as string | undefined

              return (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="schedule-date" className="text-[12px] font-semibold">
                    Date
                  </label>
                  <input
                    id="schedule-date"
                    type="date"
                    className="dash-field h-9 px-3 text-[13px]"
                    value={field.state.value}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'schedule-date-error' : undefined}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                  {error ? (
                    <p id="schedule-date-error" className="text-[11.5px] font-medium text-[var(--dash-red-ink)]">
                      {error}
                    </p>
                  ) : null}
                </div>
              )
            }}
          </form.Field>

          <form.Field name="time">
            {(field) => {
              const error = field.state.meta.errors[0] as string | undefined

              return (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="schedule-time" className="text-[12px] font-semibold">
                    Time in Berlin
                  </label>
                  <input
                    id="schedule-time"
                    type="time"
                    step={300}
                    className="dash-field h-9 px-3 text-[13px]"
                    value={field.state.value}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'schedule-time-error' : undefined}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                  {error ? (
                    <p id="schedule-time-error" className="flex items-start gap-1.5 text-[11.5px] font-medium text-[var(--dash-red-ink)]">
                      <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                      {error}
                    </p>
                  ) : null}
                </div>
              )
            }}
          </form.Field>
        </div>

        <form.Subscribe selector={(state) => [state.values.date, state.values.time] as const}>
          {([date, time]) => {
            const at = scheduleProblem(date, time) ? null : berlinWallTimeToInstant(date, time)
            const local = at ? localTimeIfNotBerlin(at) : null

            return at ? (
              <p className="flex items-start gap-2 rounded-[9px] bg-[var(--dash-blue-tint)] px-3 py-2 text-[12.5px] text-[var(--dash-blue-ink)]" aria-live="polite">
                <CalendarClock className="mt-px size-4 shrink-0" aria-hidden="true" />
                <span>
                  Goes live <strong>{berlinLong(at)}</strong> in Berlin{local ? ` — ${local} where you are now` : ''}.
                </span>
              </p>
            ) : null
          }}
        </form.Subscribe>

        {current ? (
          <form.Field name="snapshot">
            {(field) => (
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-1.5 p-0 text-[12px] font-semibold">What goes live</legend>
                {(
                  [
                    ['keep', 'Keep the frozen version', 'Only the time changes. Your later saves stay unpublished.', false],
                    [
                      'draft',
                      'Replace it with what you saved now',
                      draftDiffers
                        ? 'Freezes your saved draft instead. It must pass every publication check.'
                        : 'Your saved draft is the same as the frozen version.',
                      !draftDiffers,
                    ],
                  ] as const
                ).map(([value, label, note, disabled]) => (
                  <label
                    key={value}
                    className={cn(
                      'flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5',
                      disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                      field.state.value === value ? 'border-[var(--dash-brand)] bg-[var(--dash-blue-tint)]' : 'border-[var(--dash-line)] bg-[var(--dash-input)]',
                    )}
                  >
                    <input
                      type="radio"
                      name="schedule-snapshot"
                      className="mt-0.5 size-4"
                      checked={field.state.value === value}
                      disabled={disabled}
                      onChange={() => field.handleChange(value)}
                    />
                    <span>
                      <span className="block text-[13px] font-semibold">{label}</span>
                      <span className="block text-[11.5px] text-[var(--dash-quiet)]">{note}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
          </form.Field>
        ) : (
          <ul className="flex list-disc flex-col gap-1 ps-5 text-[12px] text-[var(--dash-quiet)]">
            <li>Saving later changes only your draft, not the frozen version.</li>
            <li>You can change the time or cancel until then.</li>
            <li>If the server is down at that moment, it publishes once it is back, and tells you it was late.</li>
          </ul>
        )}

        {unsaved ? (
          <p className="rounded-[9px] border border-[var(--dash-line)] px-3 py-2 text-[12px] text-[var(--dash-quiet)]">
            You have unsaved changes on the editor. They are not part of any schedule until you save them.
          </p>
        ) : null}

        {failure ? <DialogAlert>{failure}</DialogAlert> : null}

        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap gap-2">
            {current ? (
              <>
                <button type="button" className="dash-btn dash-tone-red h-8 text-[12px]" disabled={busy !== null} onClick={() => void handleCancel()}>
                  {busy === 'cancel' ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                  Cancel schedule
                </button>
                <button
                  type="button"
                  className="dash-btn dash-btn-ghost h-8 text-[12px]"
                  disabled={busy !== null || !draftReady}
                  title={
                    draftReady
                      ? 'Cancels the schedule and publishes your saved draft now'
                      : 'Your saved draft is not ready to publish — see the checklist'
                  }
                  onClick={() => void handlePublishNow()}
                >
                  {busy === 'now' ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                  Publish now instead
                </button>
              </>
            ) : null}
          </span>
          <span className="flex gap-2">
            <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>
              Close
            </button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(submitting) => (
                <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting || busy !== null}>
                  {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  {submitting ? 'Scheduling…' : current ? 'Save schedule' : 'Schedule'}
                </button>
              )}
            </form.Subscribe>
          </span>
        </div>
        {current && !draftReady ? (
          <p className="text-[11.5px] text-[var(--dash-quiet)]">
            “Publish now instead” publishes your saved draft, which is not ready yet: {article.publishIssues.length}{' '}
            {article.publishIssues.length === 1 ? 'thing' : 'things'} on the checklist.
          </p>
        ) : null}
      </form>
    </BlogDialog>
  )
}
