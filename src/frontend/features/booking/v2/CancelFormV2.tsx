import { useRef, useState } from 'react'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import { CalendarClock, CalendarX } from 'lucide-react'
import type { CancelReason } from '#/backend2/contracts/booking.contract'
import { Button } from '#/frontend/components/ui/button'
import { Label } from '#/frontend/components/ui/label'
import { Textarea } from '#/frontend/components/ui/textarea'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { cn } from '#/frontend/lib/utils'
import { CANCEL_REASON_KEYS, getBookingV2Copy } from './booking-v2-copy'

/** The server's limit for the typed reason (`BOOKING_LIMITS.cancelText`). */
export const CANCEL_TEXT_LIMIT = 1_000

/**
 * Cancelling from the private link: one of five reasons, and a few typed
 * words when the reason is "Other" (approved choice 2A). Moving the time is
 * offered first, because a moved appointment is still an appointment.
 *
 * Checked on the first press of "Cancel booking", then as the visitor changes
 * the choice; the server requires the same again.
 */
export function CancelFormV2({
  pending,
  failure,
  onCancel,
  onKeep,
  onMoveInstead,
}: {
  pending: boolean
  failure: string | null
  onCancel: (input: { reason: CancelReason; text: string }) => Promise<void>
  onKeep: () => void
  onMoveInstead: (() => void) | null
}) {
  const { language } = useLanguage()
  const copy = getBookingV2Copy(language).manage
  const formRef = useRef<HTMLFormElement>(null)
  const [inFlight, setInFlight] = useState(false)

  const form = useForm({
    defaultValues: { reason: '' as CancelReason | '', text: '' },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Partial<Record<'reason' | 'text', string>> = {}

        if (value.reason === '') fields.reason = copy.errReason
        else if (value.reason === 'other' && value.text.trim() === '') fields.text = copy.errOther
        if (value.text.trim().length > CANCEL_TEXT_LIMIT) fields.text = getBookingV2Copy(language).form.errTooLong

        return Object.keys(fields).length > 0 ? { fields } : undefined
      },
    },
    onSubmitInvalid: () =>
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()),
    onSubmit: async ({ value }) => {
      if (inFlight || value.reason === '') return

      setInFlight(true)

      try {
        await onCancel({ reason: value.reason, text: value.reason === 'other' ? value.text.trim() : '' })
      } finally {
        setInFlight(false)
      }
    },
  })

  const reason = useStore(form.store, (state) => state.values.reason)
  const busy = pending || inFlight

  return (
    <form
      ref={formRef}
      noValidate
      className="border-border flex flex-col gap-5 border-t pt-6"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="flex flex-col gap-1">
        <p className="text-foreground m-0 text-base font-semibold">{copy.cancelTitle}</p>
        <p className="text-foreground/58 m-0 text-sm leading-7">{copy.cancelBody}</p>
      </div>

      {onMoveInstead ? (
        <div className="cancel-offer flex flex-wrap items-center gap-3 rounded-[1.2rem] p-4">
          <p className="text-foreground/70 m-0 flex-1 text-sm leading-7">{copy.rescheduleInstead}</p>
          <Button type="button" variant="outline" className="rounded-full" onClick={onMoveInstead}>
            <CalendarClock aria-hidden="true" className="size-4" />
            {copy.move}
          </Button>
        </div>
      ) : null}

      <form.Field name="reason">
        {(field) => {
          const error = typeof field.state.meta.errors[0] === 'string' ? field.state.meta.errors[0] : undefined

          return (
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="text-foreground mb-2 text-sm font-medium">{copy.reasonLegend}</legend>
              {CANCEL_REASON_KEYS.map((key) => (
                <label
                  key={key}
                  className={cn(
                    'border-border hover:border-primary/40 flex cursor-pointer items-center gap-3 rounded-[1rem] border px-4 py-3 text-sm',
                    field.state.value === key && 'border-primary/60 bg-primary/5',
                  )}
                >
                  <input
                    type="radio"
                    name="cancel-reason"
                    value={key}
                    checked={field.state.value === key}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'cancel-reason-error' : undefined}
                    onChange={() => field.handleChange(key)}
                    className="accent-primary size-4"
                  />
                  {copy.reasons[key]}
                </label>
              ))}
              {error ? (
                <p id="cancel-reason-error" className="text-destructive m-0 text-xs">
                  {error}
                </p>
              ) : null}
            </fieldset>
          )
        }}
      </form.Field>

      {reason === 'other' ? (
        <form.Field name="text">
          {(field) => {
            const error = typeof field.state.meta.errors[0] === 'string' ? field.state.meta.errors[0] : undefined

            return (
              <div className="flex flex-col gap-2">
                <Label htmlFor="cancel-other" className="text-sm font-medium">
                  {copy.otherLabel}
                </Label>
                <Textarea
                  id="cancel-other"
                  rows={3}
                  value={field.state.value}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'cancel-other-error' : undefined}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                {error ? (
                  <p id="cancel-other-error" className="text-destructive m-0 text-xs">
                    {error}
                  </p>
                ) : null}
              </div>
            )
          }}
        </form.Field>
      ) : null}

      {failure ? (
        <p role="alert" className="text-destructive m-0 text-sm">
          {failure}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="outline"
          disabled={busy}
          aria-busy={busy}
          className="text-destructive border-destructive/40 hover:bg-destructive/5 hover:text-destructive rounded-full"
        >
          <CalendarX aria-hidden="true" className="size-4" />
          {busy ? copy.cancelling : copy.cancelConfirm}
        </Button>
        <Button type="button" variant="ghost" className="rounded-full" disabled={busy} onClick={onKeep}>
          {copy.keep}
        </Button>
      </div>
    </form>
  )
}
