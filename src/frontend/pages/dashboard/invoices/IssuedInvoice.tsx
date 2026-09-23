import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CreditCard,
  Download,
  FileText,
  FlaskConical,
  Landmark,
  Link2,
  Loader2,
  Receipt,
  Send,
  Undo2,
} from 'lucide-react'
import { berlinToday } from '#/backend2/contracts/invoice-dates.contract'
import type { DocumentLanguage, InvoiceInstallment, OwnerInvoice, PaymentMethod } from '#/backend2/contracts/invoice.contract'
import { DashboardPage, PageHead, StatusChip } from '#/frontend/dashboard/primitives'
import { BlogDialog, DialogActions, DialogAlert, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import {
  cancelInvoice,
  correctInvoice,
  documentPdf,
  paymentLink,
  receiptPdf,
  recordPayment,
  recordRefund,
  saveBlob,
  sendInvoice,
  voidPayment,
} from '#/frontend/features/invoices-v2/api'
import { formatAmount, formatDate, formatMoment, minorToText, parseMoney } from '#/frontend/features/invoices-v2/money'
import { useInvoiceMutation } from '#/frontend/features/invoices-v2/queries'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { Banner, FieldError, Hint, InvoiceStateChip, Label, TestBar, TestChip, errorId, newIdempotencyKey, stripeFailure } from './invoice-parts'

/**
 * An issued invoice, approved in the Invoices Design Lab (24 Sep 2026): what
 * matters at the top — total, paid, still open — then the payment plan, the
 * payments and a plain history. Nothing here rewrites the document: sending
 * opens an Inbox draft the owner sends, payments and refunds are records the
 * owner makes, and a mistake is cancelled or corrected with a linked document.
 */

const METHOD: Record<PaymentMethod, string> = {
  bank: 'Bank transfer',
  stripe: 'Card (Stripe)',
  cash: 'Cash',
  other: 'Other',
}

const LANGUAGE: Record<DocumentLanguage, string> = { de: 'German', en: 'English' }

const other = (language: DocumentLanguage): DocumentLanguage => (language === 'de' ? 'en' : 'de')

function PlanState({ part }: { part: InvoiceInstallment }) {
  if (part.state === 'paid') return <StatusChip tone="outline">Paid</StatusChip>
  if (part.state === 'overdue') return <StatusChip tone="red">Overdue</StatusChip>
  if (part.state === 'partially_paid') return <StatusChip tone="blue">Partly paid</StatusChip>

  return <StatusChip tone="grey">Open</StatusChip>
}

type Event = { at: string; tone: 'ok' | 'bad' | 'blue' | 'grey'; title: string; detail?: string; amount?: string }

const historyOf = (invoice: OwnerInvoice): Event[] => {
  const events: Event[] = [{ at: invoice.createdAt, tone: 'grey', title: 'Draft started', detail: formatMoment(invoice.createdAt) }]

  if (invoice.issuedAt) {
    events.push({
      at: invoice.issuedAt,
      tone: 'blue',
      title: 'Issued and locked',
      detail: `${formatMoment(invoice.issuedAt)} · number ${invoice.number}`,
    })
  }

  if (invoice.sentAt) {
    events.push({
      at: invoice.sentAt,
      tone: 'blue',
      title: 'Email draft prepared in Inbox',
      detail: `${formatMoment(invoice.sentAt)} · with the PDF attached, for you to send`,
    })
  }

  for (const payment of invoice.payments) {
    events.push({
      at: payment.createdAt,
      tone: payment.voided ? 'grey' : 'ok',
      title: `${payment.voided ? 'Payment voided' : 'Payment recorded'} — ${METHOD[payment.method].toLowerCase()}`,
      detail: [
        `Received ${formatDate(payment.paidOn)}`,
        payment.reference ? `reference “${payment.reference}”` : '',
        payment.voided ? `voided: ${payment.voidReason}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      amount: formatAmount(payment.amountMinor, payment.currency),
    })
  }

  for (const refund of invoice.refunds) {
    events.push({
      at: refund.createdAt,
      tone: 'bad',
      title: `Refund recorded — ${METHOD[refund.method].toLowerCase()}`,
      detail: `Sent back ${formatDate(refund.refundedOn)}${refund.note ? ` · ${refund.note}` : ''}`,
      amount: `−${formatAmount(refund.amountMinor, refund.currency)}`,
    })
  }

  if (invoice.cancelledAt) {
    events.push({
      at: invoice.cancelledAt,
      tone: 'bad',
      title: invoice.cancelledBy?.number ? `Cancelled by ${invoice.cancelledBy.number}` : 'Cancelled',
      detail: `${formatMoment(invoice.cancelledAt)}${invoice.cancelReason ? ` · ${invoice.cancelReason}` : ''}`,
    })
  }

  return events.sort((a, b) => b.at.localeCompare(a.at))
}

/* ------------------------------------------------------------------ dialogs */

function LanguageChoice({
  name,
  value,
  original,
  onChange,
}: {
  name: string
  value: DocumentLanguage
  original: DocumentLanguage
  onChange: (value: DocumentLanguage) => void
}) {
  return (
    <div role="radiogroup" aria-label="Language" className="flex flex-col gap-2">
      {[original, other(original)].map((language) => (
        <label key={language} className="inv-choice">
          <input type="radio" name={name} checked={value === language} onChange={() => onChange(language)} />
          <span>
            <b>{language === original ? `${LANGUAGE[language]} (original)` : `${LANGUAGE[language]} copy`}</b>
            <small className="block text-[12px] text-[var(--dash-quiet)]">
              {language === original ? 'The invoice as issued' : 'Same number, marked as a copy — not a second bill'}
            </small>
          </span>
        </label>
      ))}
      <label className="inv-choice cursor-not-allowed opacity-60">
        <input type="radio" name={name} disabled />
        <span>
          <b>Arabic copy</b>
          <small className="block text-[12px] text-[var(--dash-quiet)]">Not available yet — the PDF needs a working Arabic font first</small>
        </span>
      </label>
    </div>
  )
}

function SendDialog({ invoice, onClose }: { invoice: OwnerInvoice; onClose: () => void }) {
  const navigate = useNavigate()
  const [language, setLanguage] = useState<DocumentLanguage>(invoice.language)
  const send = useInvoiceMutation(() => sendInvoice(invoice.id, language), (result) => result.invoice)
  const [failure, setFailure] = useState<string | null>(null)

  return (
    <BlogDialog labelledBy="send-title" describedBy="send-text" onClose={onClose} size="sm">
      <DialogTitle id="send-title">Send from Inbox</DialogTitle>
      <p id="send-text" className="text-[13px] leading-relaxed text-[var(--dash-quiet)]">
        This opens an Inbox draft to <b className="text-[var(--dash-ink)]">{invoice.recipient.email || 'the client’s email'}</b> with the PDF attached.
        You read it and press Send yourself.
        {invoice.allowStripe ? ' A card payment link for what is still owed goes into the text.' : ''}
      </p>
      <LanguageChoice name="send-language" value={language} original={invoice.language} onChange={setLanguage} />
      {invoice.mode === 'test' ? (
        <Banner tone="warn" icon={<FlaskConical className="size-4 shrink-0" aria-hidden="true" />}>
          In test mode the draft goes to your test address when one is set in Seller &amp; tax, and its subject starts with [TEST].
        </Banner>
      ) : null}
      {failure ? <DialogAlert>{failure}</DialogAlert> : null}
      <DialogActions>
        <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="dash-btn dash-btn-primary"
          disabled={send.isPending}
          onClick={async () => {
            setFailure(null)

            try {
              const result = await send.mutateAsync(undefined)

              if (result.paymentLinkError) notify.error(`The payment link was left out: ${result.paymentLinkError}`)
              notify.success(`Inbox draft ready for ${result.draft.toEmail}`)
              void navigate({ to: '/dashboard/inbox', search: { view: 'drafts', draft: result.draft.id } })
            } catch (caught) {
              setFailure(caught instanceof Error ? caught.message : 'The draft could not be prepared.')
            }
          }}
        >
          {send.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
          {send.isPending ? 'Preparing…' : 'Open Inbox draft'}
        </button>
      </DialogActions>
    </BlogDialog>
  )
}

function DownloadDialog({ invoice, onClose }: { invoice: OwnerInvoice; onClose: () => void }) {
  const [language, setLanguage] = useState<DocumentLanguage>(invoice.language)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  return (
    <BlogDialog labelledBy="download-title" onClose={onClose} size="sm">
      <DialogTitle id="download-title">Download PDF</DialogTitle>
      <LanguageChoice name="download-language" value={language} original={invoice.language} onChange={setLanguage} />
      {failure ? <DialogAlert>{failure}</DialogAlert> : null}
      <DialogActions>
        <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="dash-btn dash-btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setFailure(null)

            try {
              const file = await documentPdf(invoice.id, language)

              saveBlob(file.blob, file.fileName)
              onClose()
            } catch (caught) {
              setFailure(caught instanceof Error ? caught.message : 'The PDF could not be downloaded.')
              setBusy(false)
            }
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
          Download
        </button>
      </DialogActions>
    </BlogDialog>
  )
}

const focusIn = (formId: string) =>
  window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`#${formId} [aria-invalid="true"]`)?.focus())

type PaymentValues = { amount: string; paidOn: string; method: 'bank' | 'cash' | 'other'; reference: string; note: string }

export const paymentErrors = (values: PaymentValues, due: number, currency: OwnerInvoice['currency'], today: string) => {
  const errors: Partial<Record<keyof PaymentValues, string>> = {}
  const amount = parseMoney(values.amount)

  if (amount === null || amount <= 0) errors.amount = 'Enter the amount received'
  else if (amount > due) errors.amount = `That is more than the ${formatAmount(due, currency)} still open`
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(values.paidOn)) errors.paidOn = 'Choose the day the money arrived'
  else if (values.paidOn > today) errors.paidOn = 'A payment cannot be in the future'
  if (values.reference.trim().length > 200) errors.reference = 'The reference is too long'
  if (values.note.trim().length > 1000) errors.note = 'The note is too long'

  return errors
}

export function PaymentDialog({ invoice, onClose }: { invoice: OwnerInvoice; onClose: () => void }) {
  const today = berlinToday()
  const due = invoice.money.amountDueMinor
  // One key per dialog: a double click or a retried request records once.
  const [idempotencyKey] = useState(newIdempotencyKey)
  const [failure, setFailure] = useState<string | null>(null)
  const pay = useInvoiceMutation(
    (input: PaymentValues) =>
      recordPayment(invoice.id, {
        idempotencyKey,
        method: input.method,
        amountMinor: parseMoney(input.amount) ?? 0,
        paidOn: input.paidOn,
        reference: input.reference.trim(),
        note: input.note.trim(),
      }),
    (result) => result.invoice,
  )

  const form = useForm({
    defaultValues: { amount: minorToText(due), paidOn: today, method: 'bank', reference: '', note: '' } as PaymentValues,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields = paymentErrors(value, due, invoice.currency, today)

        return Object.keys(fields).length === 0 ? undefined : { fields }
      },
    },
    onSubmitInvalid: () => focusIn('payment-form'),
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        const result = await pay.mutateAsync(value)

        notify.success(
          result.duplicate
            ? 'That payment was already recorded'
            : `Payment of ${formatAmount(result.payment.amountMinor, invoice.currency)} recorded`,
        )
        onClose()
      } catch (caught) {
        setFailure(caught instanceof Error ? caught.message : 'The payment could not be recorded.')
      }
    },
  })
  const submitting = useStore(form.store, (state) => state.isSubmitting)

  return (
    <BlogDialog labelledBy="payment-title" describedBy="payment-text" onClose={onClose} size="sm">
      <form
        id="payment-form"
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <DialogTitle id="payment-title">Record a payment</DialogTitle>
        <p id="payment-text" className="text-[13px] text-[var(--dash-quiet)]">
          For money that already arrived. Card payments record themselves when Stripe confirms them.
        </p>
        <form.Field name="amount">
          {(api) => {
            const error = api.state.meta.errors[0] as string | undefined

            return (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-amount">Amount ({invoice.currency})</Label>
                <input
                  id="pay-amount"
                  inputMode="decimal"
                  className="dash-field dash-num h-10 px-3 text-[13px]"
                  value={api.state.value}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={cn(error && errorId('pay-amount'), 'pay-amount-hint')}
                  onChange={(event) => api.handleChange(event.target.value)}
                  onBlur={api.handleBlur}
                />
                <FieldError id="pay-amount" message={error} />
                <Hint id="pay-amount-hint">{formatAmount(due, invoice.currency)} still open. A part payment is fine.</Hint>
              </div>
            )
          }}
        </form.Field>
        <div className="grid grid-cols-2 gap-3">
          <form.Field name="paidOn">
            {(api) => {
              const error = api.state.meta.errors[0] as string | undefined

              return (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="pay-date">Date received</Label>
                  <input
                    id="pay-date"
                    type="date"
                    max={today}
                    className="dash-field h-10 px-2.5 text-[13px]"
                    value={api.state.value}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId('pay-date') : undefined}
                    onChange={(event) => api.handleChange(event.target.value)}
                  />
                  <FieldError id="pay-date" message={error} />
                </div>
              )
            }}
          </form.Field>
          <form.Field name="method">
            {(api) => (
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="pay-method">How</Label>
                <select
                  id="pay-method"
                  className="dash-field h-10 px-2.5 text-[13px]"
                  value={api.state.value}
                  onChange={(event) => api.handleChange(event.target.value as PaymentValues['method'])}
                >
                  <option value="bank">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </div>
            )}
          </form.Field>
        </div>
        <form.Field name="reference">
          {(api) => {
            const error = api.state.meta.errors[0] as string | undefined

            return (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-reference" optional>
                  Reference
                </Label>
                <input
                  id="pay-reference"
                  className="dash-field h-10 px-3 text-[13px]"
                  placeholder="Bank reference"
                  value={api.state.value}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId('pay-reference') : undefined}
                  onChange={(event) => api.handleChange(event.target.value)}
                />
                <FieldError id="pay-reference" message={error} />
              </div>
            )
          }}
        </form.Field>
        {failure ? <DialogAlert>{failure}</DialogAlert> : null}
        <DialogActions>
          <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {submitting ? 'Recording…' : 'Record payment'}
          </button>
        </DialogActions>
      </form>
    </BlogDialog>
  )
}

/** One required sentence, for voiding a payment or cancelling an invoice. */
function ReasonField({ form, id, label, placeholder }: { form: ReasonForm; id: string; label: string; placeholder: string }) {
  return (
    <form.Field name="reason">
      {(api) => {
        const error = api.state.meta.errors[0] as string | undefined

        return (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <textarea
              id={id}
              className="dash-field min-h-[70px] resize-y px-3 py-2 text-[13px]"
              placeholder={placeholder}
              value={api.state.value}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId(id) : undefined}
              onChange={(event) => api.handleChange(event.target.value)}
            />
            <FieldError id={id} message={error} />
          </div>
        )
      }}
    </form.Field>
  )
}

const reasonRule = (message: string) => ({
  onDynamic: ({ value }: { value: { reason: string } }) => {
    if (value.reason.trim() === '') return { fields: { reason: message } }
    if (value.reason.trim().length > 1000) return { fields: { reason: 'Keep it under 1000 characters' } }

    return undefined
  },
})

const useReasonForm = (message: string, formId: string, onSubmit: (reason: string) => Promise<void>) =>
  useForm({
    defaultValues: { reason: '' },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: reasonRule(message),
    onSubmitInvalid: () => focusIn(formId),
    onSubmit: ({ value }) => onSubmit(value.reason.trim()),
  })

type ReasonForm = ReturnType<typeof useReasonForm>

function VoidDialog({ invoice, paymentId, onClose }: { invoice: OwnerInvoice; paymentId: string; onClose: () => void }) {
  const payment = invoice.payments.find((entry) => entry.id === paymentId)
  const [failure, setFailure] = useState<string | null>(null)
  const voiding = useInvoiceMutation((reason: string) => voidPayment(invoice.id, paymentId, reason), (result) => result)
  const form = useReasonForm('Say why this payment is being voided', 'void-form', async (reason) => {
    setFailure(null)

    try {
      await voiding.mutateAsync(reason)
      notify.success('Payment voided — it stays in the history')
      onClose()
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : 'The payment could not be voided.')
    }
  })
  const submitting = useStore(form.store, (state) => state.isSubmitting)

  return (
    <BlogDialog labelledBy="void-title" onClose={onClose} role="alertdialog" size="sm">
      <form
        id="void-form"
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <DialogTitle id="void-title">Void this payment?</DialogTitle>
        <p className="text-[13px] text-[var(--dash-quiet)]">
          {payment ? `${formatAmount(payment.amountMinor, payment.currency)} on ${formatDate(payment.paidOn)}` : 'This payment'} stops
          counting towards the invoice. It is kept, crossed out, with your reason — never deleted.
        </p>
        <ReasonField form={form} id="void-reason" label="Why" placeholder="e.g. Entered twice by mistake" />
        {failure ? <DialogAlert>{failure}</DialogAlert> : null}
        <DialogActions>
          <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>
            Keep it
          </button>
          <button type="submit" className="dash-btn dash-tone-red" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Void payment
          </button>
        </DialogActions>
      </form>
    </BlogDialog>
  )
}

type RefundValues = { amount: string; refundedOn: string; method: 'bank' | 'stripe' | 'cash' | 'other'; note: string }

function RefundDialog({ invoice, onClose }: { invoice: OwnerInvoice; onClose: () => void }) {
  const today = berlinToday()
  const refundable = invoice.money.refundableMinor
  const [idempotencyKey] = useState(newIdempotencyKey)
  const [failure, setFailure] = useState<string | null>(null)
  const refund = useInvoiceMutation(
    (input: RefundValues) =>
      recordRefund(invoice.id, {
        idempotencyKey,
        method: input.method,
        amountMinor: parseMoney(input.amount) ?? 0,
        refundedOn: input.refundedOn,
        note: input.note.trim(),
      }),
    (result) => result.invoice,
  )
  const form = useForm({
    defaultValues: { amount: minorToText(refundable), refundedOn: today, method: 'bank', note: '' } as RefundValues,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Partial<Record<keyof RefundValues, string>> = {}
        const amount = parseMoney(value.amount)

        if (amount === null || amount <= 0) fields.amount = 'Enter the amount you sent back'
        else if (amount > refundable) fields.amount = `At most ${formatAmount(refundable, invoice.currency)} can go back`
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(value.refundedOn)) fields.refundedOn = 'Choose the day'
        else if (value.refundedOn > today) fields.refundedOn = 'A refund cannot be in the future'

        return Object.keys(fields).length === 0 ? undefined : { fields }
      },
    },
    onSubmitInvalid: () => focusIn('refund-form'),
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        await refund.mutateAsync(value)
        notify.success('Refund recorded')
        onClose()
      } catch (caught) {
        setFailure(caught instanceof Error ? caught.message : 'The refund could not be recorded.')
      }
    },
  })
  const submitting = useStore(form.store, (state) => state.isSubmitting)

  return (
    <BlogDialog labelledBy="refund-title" onClose={onClose} size="sm">
      <form
        id="refund-form"
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <DialogTitle id="refund-title">Record a refund</DialogTitle>
        <p className="text-[13px] text-[var(--dash-quiet)]">
          Only once you have actually sent the money back. Up to {formatAmount(refundable, invoice.currency)} can go back.
        </p>
        <form.Field name="amount">
          {(api) => {
            const error = api.state.meta.errors[0] as string | undefined

            return (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="refund-amount">Amount ({invoice.currency})</Label>
                <input
                  id="refund-amount"
                  inputMode="decimal"
                  className="dash-field dash-num h-10 px-3 text-[13px]"
                  value={api.state.value}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId('refund-amount') : undefined}
                  onChange={(event) => api.handleChange(event.target.value)}
                />
                <FieldError id="refund-amount" message={error} />
              </div>
            )
          }}
        </form.Field>
        <div className="grid grid-cols-2 gap-3">
          <form.Field name="refundedOn">
            {(api) => {
              const error = api.state.meta.errors[0] as string | undefined

              return (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="refund-date">Date</Label>
                  <input
                    id="refund-date"
                    type="date"
                    max={today}
                    className="dash-field h-10 px-2.5 text-[13px]"
                    value={api.state.value}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId('refund-date') : undefined}
                    onChange={(event) => api.handleChange(event.target.value)}
                  />
                  <FieldError id="refund-date" message={error} />
                </div>
              )
            }}
          </form.Field>
          <form.Field name="method">
            {(api) => (
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="refund-method">How</Label>
                <select
                  id="refund-method"
                  className="dash-field h-10 px-2.5 text-[13px]"
                  value={api.state.value}
                  onChange={(event) => api.handleChange(event.target.value as RefundValues['method'])}
                >
                  <option value="bank">Bank transfer</option>
                  <option value="stripe">Stripe</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </div>
            )}
          </form.Field>
        </div>
        {failure ? <DialogAlert>{failure}</DialogAlert> : null}
        <DialogActions>
          <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Record refund
          </button>
        </DialogActions>
      </form>
    </BlogDialog>
  )
}

function CancelDialog({ invoice, onClose }: { invoice: OwnerInvoice; onClose: () => void }) {
  const navigate = useNavigate()
  const [choice, setChoice] = useState<'correct' | 'cancel'>('correct')
  const [failure, setFailure] = useState<string | null>(null)
  const cancel = useInvoiceMutation((reason: string) => cancelInvoice(invoice.id, reason), (result) => [result.invoice, result.cancellation])
  const correct = useInvoiceMutation(
    (reason: string) => correctInvoice(invoice.id, reason),
    (result) => [result.invoice, result.cancellation, result.draft],
  )
  const paid = invoice.money.paidMinor - invoice.money.refundedMinor
  const form = useReasonForm('Say why the invoice is cancelled', 'cancel-form', async (reason) => {
    setFailure(null)

    try {
      if (choice === 'correct') {
        const result = await correct.mutateAsync(reason)

        notify.success(`Cancellation ${result.cancellation.number} created; a correction draft is open`)
        void navigate({ to: '/dashboard/invoices/$invoiceId', params: { invoiceId: result.draft.id } })
      } else {
        const result = await cancel.mutateAsync(reason)

        notify.success(`Cancellation ${result.cancellation.number} created`)
        onClose()
      }
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : 'Nothing was cancelled. Try again.')
    }
  })
  const submitting = useStore(form.store, (state) => state.isSubmitting)

  return (
    <BlogDialog labelledBy="cancel-title" describedBy="cancel-text" onClose={onClose} role="alertdialog" size="sm">
      <form
        id="cancel-form"
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <DialogTitle id="cancel-title">Cancel or correct {invoice.number}</DialogTitle>
        <p id="cancel-text" className="text-[13px] leading-relaxed text-[var(--dash-quiet)]">
          The original stays as it is. A cancellation document with its own number reverses it, and both are kept for the tax
          archive.
        </p>
        <div role="radiogroup" aria-label="What to do" className="flex flex-col gap-2">
          <label className="inv-choice">
            <input type="radio" name="cancel-choice" checked={choice === 'correct'} onChange={() => setChoice('correct')} />
            <span>
              <b>Correct it</b>
              <small className="block text-[12px] text-[var(--dash-quiet)]">Cancel this one and open a new draft with the same lines to fix.</small>
            </span>
          </label>
          <label className="inv-choice">
            <input type="radio" name="cancel-choice" checked={choice === 'cancel'} onChange={() => setChoice('cancel')} />
            <span>
              <b>Cancel it</b>
              <small className="block text-[12px] text-[var(--dash-quiet)]">Reverse it completely. Nothing replaces it.</small>
            </span>
          </label>
        </div>
        {paid > 0 ? (
          <Banner tone="warn" icon={<AlertTriangle className="size-4 shrink-0" aria-hidden="true" />} title={`${formatAmount(paid, invoice.currency)} was already paid`}>
            Cancelling does not refund it. Record the refund once you have actually sent the money back.
          </Banner>
        ) : null}
        <ReasonField form={form} id="cancel-reason" label="Reason" placeholder="e.g. Wrong amount on line 2" />
        {failure ? <DialogAlert>{failure}</DialogAlert> : null}
        <DialogActions>
          <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>
            Keep it
          </button>
          <button type="submit" className="dash-btn dash-tone-red" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Create cancellation
          </button>
        </DialogActions>
      </form>
    </BlogDialog>
  )
}

/* --------------------------------------------------------------------- page */

type Dialog = 'send' | 'download' | 'pay' | 'refund' | 'cancel' | { void: string } | null

export function IssuedInvoice({ invoice }: { invoice: OwnerInvoice }) {
  const [dialog, setDialog] = useState<Dialog>(null)
  const [link, setLink] = useState<{ url: string; busy: boolean; error: string | null }>({
    url: invoice.stripeCheckoutUrl ?? '',
    busy: false,
    error: null,
  })
  const money = invoice.money
  const cancellation = invoice.kind === 'cancellation'
  const cancelled = invoice.status === 'cancelled'
  const canPay = !cancellation && !cancelled && money.amountDueMinor > 0
  const year = (invoice.issueDate ?? '').slice(0, 4)
  const name = invoice.client.displayName || invoice.recipient.company || invoice.recipient.name

  return (
    <DashboardPage className="inv gap-4">
      <PageHead
        eyebrow={cancellation ? 'MONEY · CANCELLATION' : 'MONEY · INVOICE'}
        title={name}
        actions={
          <Link to="/dashboard/invoices" className="dash-btn dash-btn-ghost">
            <ArrowLeft className="size-4" aria-hidden="true" />
            All invoices
          </Link>
        }
      />
      <TestBar mode={invoice.mode} />

      {invoice.collectionFailed ? (
        <Banner tone="bad" role="alert" icon={<AlertTriangle className="size-4 shrink-0" aria-hidden="true" />} title="The card charge failed">
          This period is overdue, not paid. Stripe tries again up to two more times and the client gets up to three reminders
          over 14 days, prepared in Inbox for you. Nothing is cancelled automatically — you decide.
        </Banner>
      ) : null}
      {cancelled ? (
        <Banner tone="info" icon={<Undo2 className="size-4 shrink-0" aria-hidden="true" />} title={`Cancelled${invoice.cancelledAt ? ` on ${formatMoment(invoice.cancelledAt)}` : ''}`}>
          {invoice.cancelReason ? `“${invoice.cancelReason}”. ` : ''}
          {invoice.cancelledBy ? (
            <>
              Reversed by{' '}
              <Link to="/dashboard/invoices/$invoiceId" params={{ invoiceId: invoice.cancelledBy.id }} className="font-semibold underline">
                {invoice.cancelledBy.number}
              </Link>
              .{' '}
            </>
          ) : null}
          {invoice.replacedBy ? (
            <>
              Corrected by{' '}
              <Link to="/dashboard/invoices/$invoiceId" params={{ invoiceId: invoice.replacedBy.id }} className="font-semibold underline">
                {invoice.replacedBy.number ?? 'a new draft'}
              </Link>
              .
            </>
          ) : null}
        </Banner>
      ) : null}
      {cancellation && invoice.cancels ? (
        <Banner tone="info" icon={<Undo2 className="size-4 shrink-0" aria-hidden="true" />} title="A cancellation document">
          It reverses{' '}
          <Link to="/dashboard/invoices/$invoiceId" params={{ invoiceId: invoice.cancels.id }} className="font-semibold underline">
            {invoice.cancels.number}
          </Link>{' '}
          line by line. It is kept for the tax archive and cannot be paid or cancelled.
        </Banner>
      ) : null}
      {money.refundableMinor > 0 ? (
        <Banner tone="warn" icon={<AlertTriangle className="size-4 shrink-0" aria-hidden="true" />} title={`${formatAmount(money.refundableMinor, invoice.currency)} could go back to the client`}>
          {cancelled ? 'The invoice was cancelled after money arrived.' : 'More was paid than the total.'} Nothing is refunded
          automatically.
          <span className="mt-2 block">
            <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12px]" onClick={() => setDialog('refund')}>
              Record a refund
            </button>
          </span>
        </Banner>
      ) : null}

      <div className="inv-side">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="dash-panel">
            <div className="flex flex-col gap-3.5 border-b border-[var(--dash-line)] px-5 py-4.5">
              <h2 className="flex flex-wrap items-center gap-2.5">
                <span className="inv-mono text-[15px] font-semibold">{invoice.number}</span>
                <TestChip mode={invoice.mode} />
                <InvoiceStateChip invoice={invoice} />
              </h2>
              <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
                {[
                  ['TOTAL', formatAmount(money.totalMinor, invoice.currency), false],
                  ...(cancellation
                    ? []
                    : ([
                        ['PAID', formatAmount(money.paidMinor - money.refundedMinor, invoice.currency), false],
                        ['STILL OPEN', formatAmount(money.amountDueMinor, invoice.currency), money.amountDueMinor === 0],
                      ] as Array<[string, string, boolean]>)),
                ].map(([label, value, quiet]) => (
                  <div key={label as string}>
                    <span className="dash-eyebrow-quiet block text-[10.5px]">{label}</span>
                    <b className={cn('dash-figure mt-1 block text-[22px] sm:text-[24px]', quiet && 'text-[var(--dash-quiet)]')}>{value}</b>
                  </div>
                ))}
                <div className="text-[12.5px] text-[var(--dash-quiet)]">
                  Issued {formatDate(invoice.issueDate)}
                  {invoice.dueDate && !cancellation ? ` · due ${formatDate(invoice.dueDate)}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="dash-btn dash-btn-primary" onClick={() => setDialog('send')}>
                  <Send className="size-4" aria-hidden="true" />
                  Send
                </button>
                <button type="button" className="dash-btn dash-btn-quiet" onClick={() => setDialog('download')}>
                  <Download className="size-4" aria-hidden="true" />
                  Download PDF
                </button>
                {cancellation ? null : (
                  <>
                    <button type="button" className="dash-btn dash-btn-quiet" disabled={!canPay} onClick={() => setDialog('pay')}>
                      <Banknote className="size-4" aria-hidden="true" />
                      Record payment
                    </button>
                    <button
                      type="button"
                      className="dash-btn dash-btn-quiet text-[var(--dash-red-ink)]"
                      disabled={cancelled}
                      onClick={() => setDialog('cancel')}
                    >
                      <Undo2 className="size-4" aria-hidden="true" />
                      Cancel or correct
                    </button>
                  </>
                )}
              </div>
            </div>

            {invoice.installments.length > 0 ? (
              <div className="border-b border-[var(--dash-soft)] px-5 py-4">
                <h3 className="inv-sec-title mb-2">PAYMENT PLAN</h3>
                <div className="overflow-x-auto">
                  <table className="inv-table">
                    <thead>
                      <tr>
                        <th>PART</th>
                        <th>DUE</th>
                        <th className="inv-r">AMOUNT</th>
                        <th className="inv-r">STATE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.installments.map((part, index) => (
                        <tr key={part.position}>
                          <td>{part.label || index + 1}</td>
                          <td className="whitespace-nowrap">{formatDate(part.dueDate)}</td>
                          <td className="inv-r">
                            {formatAmount(part.amountMinor, invoice.currency)}
                            {part.state === 'partially_paid' ? (
                              <span className="block text-[11.5px] text-[var(--dash-quiet)]">
                                {formatAmount(part.paidMinor, invoice.currency)} paid
                              </span>
                            ) : null}
                          </td>
                          <td className="inv-r">
                            {cancelled ? <StatusChip tone="outline">Cancelled</StatusChip> : <PlanState part={part} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {invoice.payments.length > 0 ? (
              <div className="border-b border-[var(--dash-soft)] px-5 py-4">
                <h3 className="inv-sec-title mb-1">PAYMENTS</h3>
                <ul className="inv-timeline">
                  {invoice.payments.map((payment) => (
                    <li key={payment.id}>
                      <span className="inv-dot" data-tone={payment.voided ? undefined : 'ok'} />
                      <span className="min-w-0">
                        <span className={cn(payment.voided && 'line-through')}>
                          {METHOD[payment.method]} · {formatDate(payment.paidOn)}
                        </span>
                        <small className="block text-[12px] text-[var(--dash-quiet)]">
                          {payment.voided ? `Voided: ${payment.voidReason}` : payment.reference || payment.note || 'No reference'}
                        </small>
                        {!payment.voided && payment.method !== 'stripe' ? (
                          <span className="mt-1.5 flex flex-wrap gap-1.5">
                            {payment.receiptAvailable ? (
                              <button
                                type="button"
                                className="dash-btn dash-btn-quiet h-7 px-2.5 text-[12px]"
                                onClick={async () => {
                                  try {
                                    const file = await receiptPdf(invoice.id, payment.id)

                                    saveBlob(file.blob, file.fileName)
                                  } catch (caught) {
                                    notify.error(caught instanceof Error ? caught.message : 'The receipt could not be made.')
                                  }
                                }}
                              >
                                <Receipt className="size-3.5" aria-hidden="true" />
                                Cash receipt
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="dash-btn dash-btn-ghost h-7 px-2.5 text-[12px]"
                              onClick={() => setDialog({ void: payment.id })}
                            >
                              Void
                            </button>
                          </span>
                        ) : null}
                      </span>
                      <span className={cn('dash-num font-semibold', payment.voided && 'text-[var(--dash-quiet)] line-through')}>
                        {formatAmount(payment.amountMinor, payment.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="px-5 py-4">
              <h3 className="inv-sec-title mb-1">WHAT HAPPENED</h3>
              <ul className="inv-timeline">
                {historyOf(invoice).map((event, index) => (
                  <li key={`${event.at}-${index}`}>
                    <span className="inv-dot" data-tone={event.tone === 'grey' ? undefined : event.tone} />
                    <span className="min-w-0">
                      {event.title}
                      {event.detail ? <small className="block text-[12px] text-[var(--dash-quiet)]">{event.detail}</small> : null}
                    </span>
                    <span className="dash-num font-semibold">{event.amount ?? ''}</span>
                  </li>
                ))}
              </ul>
              {invoice.inboxDraftId ? (
                <Link
                  to="/dashboard/inbox"
                  search={{ view: 'drafts', draft: invoice.inboxDraftId }}
                  className="mt-2 inline-flex text-[12.5px] font-semibold text-[var(--dash-blue-ink)] hover:underline"
                >
                  Open the email draft in Inbox
                </Link>
              ) : null}
            </div>
          </section>

          <section className="dash-panel px-5 py-4" aria-labelledby="billed-title">
            <h3 id="billed-title" className="inv-sec-title mb-2">
              WHAT WAS BILLED
            </h3>
            <div className="overflow-x-auto">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>DESCRIPTION</th>
                    <th className="inv-r">QTY</th>
                    <th className="inv-r">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr key={line.position}>
                      <td>{line.description}</td>
                      <td className="inv-r">{line.quantityMilli / 1000}</td>
                      <td className="inv-r">{formatAmount(line.netMinor, invoice.currency)}</td>
                    </tr>
                  ))}
                  {money.discountMinor > 0 ? (
                    <tr>
                      <td colSpan={2}>Discount</td>
                      <td className="inv-r">−{formatAmount(money.discountMinor, invoice.currency)}</td>
                    </tr>
                  ) : null}
                  {money.taxMinor > 0 ? (
                    <tr>
                      <td colSpan={2}>VAT</td>
                      <td className="inv-r">{formatAmount(money.taxMinor, invoice.currency)}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <section className="dash-panel px-5 py-4">
            <h3 className="inv-sec-title mb-2.5">THE DOCUMENT</h3>
            <div className="flex items-center gap-2.5 rounded-[10px] bg-[var(--dash-furniture)] px-3 py-2.5 text-[12.5px]">
              <FileText className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <b className="block truncate">{invoice.number}.pdf</b>
                <small className="block text-[var(--dash-quiet)]">
                  Media › Invoices › {year} · kept for the tax archive, cannot be deleted
                </small>
              </span>
            </div>
            <p className="mt-2.5 text-[12.5px] text-[var(--dash-quiet)]">
              {invoice.documents.length > 0
                ? `Stored: ${invoice.documents.map((doc) => (doc.language === invoice.language ? `${LANGUAGE[doc.language]} (original)` : `${LANGUAGE[doc.language]} copy`)).join(' · ')}. Each has the same number.`
                : 'The PDF is stored on first download.'}
            </p>
            <Link to="/dashboard/media" className="mt-1.5 inline-flex text-[12.5px] font-semibold text-[var(--dash-blue-ink)] hover:underline">
              Open Media
            </Link>
          </section>

          <section className="dash-panel px-5 py-4">
            <h3 className="inv-sec-title mb-2.5">BILLED TO</h3>
            <p className="text-[13px] leading-relaxed">
              <b className="block">{invoice.recipient.company || invoice.recipient.name}</b>
              {invoice.recipient.company && invoice.recipient.name ? <span className="block">{invoice.recipient.name}</span> : null}
              <span className="block whitespace-pre-line text-[var(--dash-quiet)]">{invoice.recipient.address}</span>
              {invoice.recipient.email ? <span className="block text-[var(--dash-quiet)]">{invoice.recipient.email}</span> : null}
            </p>
            <Link
              to="/dashboard/clients"
              search={{ client: invoice.client.id }}
              className="mt-1.5 inline-flex text-[12.5px] font-semibold text-[var(--dash-blue-ink)] hover:underline"
            >
              Open {invoice.client.displayName} in Clients
            </Link>
          </section>

          {cancellation ? null : (
            <section className="dash-panel px-5 py-4">
              <h3 className="inv-sec-title mb-2.5">PAYMENT OPTIONS ON IT</h3>
              <ul className="flex flex-col gap-1.5 text-[12.5px]">
                <li className="flex items-center gap-2">
                  <Landmark className="size-3.5" aria-hidden="true" />
                  {invoice.allowBank ? 'Bank transfer' : <span className="text-[var(--dash-quiet)] line-through">Bank transfer</span>}
                </li>
                <li className="flex items-center gap-2">
                  <CreditCard className="size-3.5" aria-hidden="true" />
                  {invoice.allowStripe ? 'Card through Stripe' : <span className="text-[var(--dash-quiet)] line-through">Card through Stripe</span>}
                </li>
              </ul>
              {invoice.allowStripe && canPay ? (
                <div className="mt-3 flex flex-col gap-1.5">
                  {link.url ? (
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="break-all text-[12.5px] text-[var(--dash-blue-ink)] underline">
                      {link.url}
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="dash-btn dash-btn-quiet h-8 self-start text-[12px]"
                    disabled={link.busy}
                    onClick={async () => {
                      setLink((current) => ({ ...current, busy: true, error: null }))

                      try {
                        const made = await paymentLink(invoice.id)

                        setLink({ url: made.url, busy: false, error: null })
                        await navigator.clipboard?.writeText(made.url).catch(() => {})
                        notify.success('Payment link ready and copied')
                      } catch (caught) {
                        setLink((current) => ({
                          ...current,
                          busy: false,
                          error: stripeFailure(caught),
                        }))
                      }
                    }}
                  >
                    {link.busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Link2 className="size-3.5" aria-hidden="true" />}
                    {link.url ? 'Refresh and copy the link' : 'Create a payment link'}
                  </button>
                  {link.error ? <FieldError id="pay-link" message={link.error} /> : null}
                </div>
              ) : null}
            </section>
          )}
        </aside>
      </div>

      {dialog === 'send' ? <SendDialog invoice={invoice} onClose={() => setDialog(null)} /> : null}
      {dialog === 'download' ? <DownloadDialog invoice={invoice} onClose={() => setDialog(null)} /> : null}
      {dialog === 'pay' ? <PaymentDialog invoice={invoice} onClose={() => setDialog(null)} /> : null}
      {dialog === 'refund' ? <RefundDialog invoice={invoice} onClose={() => setDialog(null)} /> : null}
      {dialog === 'cancel' ? <CancelDialog invoice={invoice} onClose={() => setDialog(null)} /> : null}
      {dialog && typeof dialog === 'object' ? (
        <VoidDialog invoice={invoice} paymentId={dialog.void} onClose={() => setDialog(null)} />
      ) : null}
    </DashboardPage>
  )
}
