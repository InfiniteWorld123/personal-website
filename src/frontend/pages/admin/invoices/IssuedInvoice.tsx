import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowLeft, Ban, BellRing, FileText, Mail, Receipt, Trash2 } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { invoicePdfUrl } from '#/frontend/api/invoice.api'
import {
  SETTLEMENT_CLASS,
  day,
  lateLabel,
  money,
  today,
} from '#/frontend/features/invoices/invoice-format'
import {
  letterQuery,
  useAddPayment,
  useCorrectInvoice,
  useDeletePayment,
} from '#/frontend/features/invoices/invoice-queries'
import { cn } from '#/frontend/lib/utils'
import type { Invoice } from '#/shared/types/invoice.types'
import {
  INVOICE_KIND_LABEL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  SETTLEMENT_LABEL,
  type LetterKind,
  type PaymentMethod,
} from '#/shared/validation/invoice.validation'

/**
 * An invoice that has been issued.
 *
 * There is no edit here, and that absence is the feature. The document has a
 * number in a gapless series and a file frozen in the bucket; the only honest
 * ways to change what it says are a cancellation, which voids it whole, and a
 * credit note, which gives part of it back. Both are buttons at the bottom,
 * and both make a new document rather than touching this one.
 *
 * **Nothing on this screen sends anything.** The send buttons prepare a letter
 * and hand it to the inbox, where he reads it before it goes and where it is
 * recorded afterwards. His own design, and the fix for the fault the first
 * version had: a letter sent past the inbox left no trace in the conversation
 * with the person who received it.
 */

export function IssuedInvoice({ invoice }: { invoice: Invoice }) {
  const [panel, setPanel] = useState<'none' | 'payment' | 'cancel' | 'credit'>('none')
  const [error, setError] = useState('')
  const [handing, setHanding] = useState<LetterKind | null>(null)

  const navigate = useNavigate()
  const client = useQueryClient()
  const owed = invoice.totalCents - invoice.paidCents

  /**
   * Hands the letter to the inbox and goes there.
   *
   * `fetchQuery`, not a mutation: preparing the letter is idempotent, and the
   * composer asks for the same thing a moment later — sharing one cached
   * request means the PDF is copied once rather than twice.
   */
  const handOver = async (kind: LetterKind) => {
    setError('')
    setHanding(kind)

    try {
      const letter = await client.fetchQuery(letterQuery(invoice.id, kind))

      await navigate({
        to: '/admin/inbox/$personId',
        params: { personId: letter.personId },
        search: { invoice: invoice.id, letter: kind },
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The letter could not be prepared.')
    } finally {
      setHanding(null)
    }
  }

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/invoices">
            <ArrowLeft className="size-4" /> Invoices
          </Link>
        </Button>

        <h1 className="tabular text-2xl font-semibold tracking-tight">
          {invoice.kind === 'INVOICE' ? 'Invoice' : INVOICE_KIND_LABEL[invoice.kind]}{' '}
          <span className="text-primary">{invoice.number}</span>
        </h1>

        <span
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs font-medium',
            SETTLEMENT_CLASS[invoice.settlement],
          )}
        >
          {SETTLEMENT_LABEL[invoice.settlement]}
          {invoice.daysLate > 0 ? ` · ${lateLabel(invoice.daysLate)}` : ''}
        </span>
      </header>

      {/* ── The facts ───────────────────────────────────────────────── */}
      <section className="bg-card grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground text-xs">To</p>
          <p className="mt-0.5 text-sm font-medium">
            {invoice.client.company || invoice.client.contactName}
          </p>
          <p className="text-muted-foreground text-sm">
            {[invoice.client.street, `${invoice.client.postcode} ${invoice.client.city}`.trim()]
              .filter((part) => part.trim() !== '')
              .join(' · ') || 'No address on file'}
          </p>
          {invoice.client.email ? (
            <p className="text-muted-foreground text-xs">{invoice.client.email}</p>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Issued</dt>
          <dd className="tabular text-end">{day(invoice.issuedOn)}</dd>
          {invoice.dueOn ? (
            <>
              <dt className="text-muted-foreground">Due</dt>
              <dd className="tabular text-end">{day(invoice.dueOn)}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Total</dt>
          <dd className="tabular text-end font-semibold">
            {money(invoice.totalCents, invoice.currency)}
          </dd>
          {invoice.paidCents > 0 ? (
            <>
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="tabular text-end">{money(invoice.paidCents, invoice.currency)}</dd>
            </>
          ) : null}
          {owed > 0 && invoice.status === 'ISSUED' && invoice.kind === 'INVOICE' ? (
            <>
              <dt className="text-muted-foreground">Still owed</dt>
              <dd className="tabular text-end font-semibold">
                {money(owed, invoice.currency)}
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      {/* ── What was billed ─────────────────────────────────────────── */}
      <section className="bg-card overflow-hidden rounded-xl border">
        {invoice.lines.map((line) => (
          <div key={line.id} className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0">
            <span className="text-muted-foreground tabular w-5 pt-0.5 text-xs">
              {line.position}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm">{line.description}</span>
              {line.detail ? (
                <span className="text-muted-foreground block text-xs">{line.detail}</span>
              ) : null}
            </span>
            <span className="tabular text-muted-foreground text-xs">
              {line.quantity} × {money(line.unitCents, invoice.currency)}
            </span>
            <span className="tabular w-24 text-end text-sm font-medium">
              {money(line.netCents, invoice.currency)}
            </span>
          </div>
        ))}
      </section>

      {/* ── Money that arrived ──────────────────────────────────────── */}
      {invoice.kind === 'INVOICE' ? (
        <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Payments</h2>
            {invoice.status === 'ISSUED' ? (
              <Button
                size="sm"
                variant={owed > 0 ? 'default' : 'outline'}
                onClick={() => setPanel(panel === 'payment' ? 'none' : 'payment')}
              >
                <Receipt className="size-4" /> Record a payment
              </Button>
            ) : null}
          </div>

          {invoice.payments.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing has arrived yet.</p>
          ) : (
            invoice.payments.map((payment) => (
              <PaymentRow key={payment.id} invoice={invoice} payment={payment} onError={setError} />
            ))
          )}

          {panel === 'payment' ? (
            <PaymentForm invoice={invoice} owed={owed} onDone={() => setPanel('none')} onError={setError} />
          ) : null}
        </section>
      ) : null}

      {/* ── Corrections ─────────────────────────────────────────────── */}
      {invoice.correctsNumber ? (
        <p className="text-muted-foreground text-sm">
          This {INVOICE_KIND_LABEL[invoice.kind].toLowerCase()} relates to invoice{' '}
          <span className="tabular">{invoice.correctsNumber}</span>.
        </p>
      ) : null}

      {invoice.correctedBy.length > 0 ? (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          {invoice.correctedBy.map((correction) => (
            <p key={correction.id}>
              {INVOICE_KIND_LABEL[correction.kind]}{' '}
              <Link
                to="/admin/invoices/$invoiceId"
                params={{ invoiceId: correction.id }}
                className="tabular underline"
              >
                {correction.number}
              </Link>{' '}
              was written against this invoice.
            </p>
          ))}
        </section>
      ) : null}

      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

      {/* ── What he can do ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" asChild>
          <a href={invoicePdfUrl(invoice.id)} target="_blank" rel="noreferrer">
            <FileText className="size-4" /> Open the PDF
          </a>
        </Button>

        {/*
          Goes to the inbox, it does not send. The label says so, because a
          button called "Send" that opens an editor instead is a small lie he
          would only fall for once.
        */}
        <Button
          variant="outline"
          disabled={handing !== null || !invoice.client.email}
          title={invoice.client.email ? undefined : 'That client has no email address'}
          onClick={() => void handOver('INVOICE')}
        >
          <Mail className="size-4" />
          {handing === 'INVOICE'
            ? 'Preparing…'
            : invoice.letterCount > 0
              ? 'Write again'
              : 'Write the letter'}
        </Button>

        {/* Switch 22 — the first nudge is a reminder, not a Mahnung. */}
        {invoice.settlement === 'OVERDUE' || invoice.settlement === 'PART' ? (
          <Button
            variant="outline"
            disabled={handing !== null || !invoice.client.email}
            onClick={() => void handOver('REMINDER')}
          >
            <BellRing className="size-4" />
            {handing === 'REMINDER' ? 'Preparing…' : 'Remind'}
          </Button>
        ) : null}

        {invoice.status === 'ISSUED' && invoice.kind === 'INVOICE' ? (
          <>
            <Button
              variant="ghost"
              className="text-rose-600 dark:text-rose-400"
              onClick={() => setPanel(panel === 'cancel' ? 'none' : 'cancel')}
            >
              <Ban className="size-4" /> Cancel it
            </Button>
            <Button variant="ghost" onClick={() => setPanel(panel === 'credit' ? 'none' : 'credit')}>
              Credit note
            </Button>
          </>
        ) : null}

      </div>

      {/*
        Letters that really went.
        Not "he pressed send" — an outgoing message in the thread carrying this
        document. `sent_at` was a column until 18 Sep 2026 and nothing wrote it
        once sending moved to the inbox, so this replaced it: a list of the
        times it was actually posted, each one a conversation he can open.
      */}
      {invoice.letters.length > 0 ? (
        <section className="bg-card rounded-xl border p-4">
          <h2 className="text-sm font-semibold">Letters sent</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {invoice.letters.map((letter) => (
              <li key={letter.messageId} className="text-muted-foreground text-sm">
                {new Date(letter.sentAt).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
                {letter.subject ? ` · ${letter.subject}` : ''}
              </li>
            ))}
          </ul>
          {invoice.client.leadId ? (
            <Link
              to="/admin/inbox/$personId"
              params={{ personId: invoice.client.leadId }}
              className="text-primary mt-2 inline-block text-sm underline"
            >
              Open the conversation
            </Link>
          ) : null}
        </section>
      ) : null}

      {panel === 'cancel' ? (
        <CorrectionPanel invoice={invoice} kind="CANCELLATION" onError={setError} />
      ) : null}
      {panel === 'credit' ? (
        <CorrectionPanel invoice={invoice} kind="CREDIT_NOTE" onError={setError} />
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function PaymentRow({
  invoice,
  payment,
  onError,
}: {
  invoice: Invoice
  payment: Invoice['payments'][number]
  onError: (message: string) => void
}) {
  const remove = useDeletePayment(invoice.id)

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="tabular w-24 font-medium">{money(payment.amountCents, invoice.currency)}</span>
      <span className="text-muted-foreground">{day(payment.receivedOn)}</span>
      <span className="text-muted-foreground text-xs">{PAYMENT_METHOD_LABEL[payment.method]}</span>
      {payment.reference ? (
        <span className="text-muted-foreground truncate text-xs">{payment.reference}</span>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        className="ms-auto"
        aria-label="Remove this payment"
        disabled={remove.isPending}
        onClick={() => {
          remove
            .mutateAsync(payment.id)
            .catch((caught: unknown) =>
              onError(caught instanceof Error ? caught.message : 'That could not be removed.'),
            )
        }}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

function PaymentForm({
  invoice,
  owed,
  onDone,
  onError,
}: {
  invoice: Invoice
  owed: number
  onDone: () => void
  onError: (message: string) => void
}) {
  const add = useAddPayment(invoice.id)

  const [amount, setAmount] = useState((Math.max(owed, 0) / 100).toFixed(2))
  // Deliberately **not** defaulted to today's date being final: the transfer he
  // records on Thursday usually arrived on Tuesday, and which month it counts
  // in follows this field, not the day he typed it in.
  const [receivedOn, setReceivedOn] = useState(today())
  const [method, setMethod] = useState<PaymentMethod>('TRANSFER')
  const [reference, setReference] = useState('')

  return (
    <div className="border-border/70 grid gap-3 rounded-lg border p-3 sm:grid-cols-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="pay-amount" className="text-xs">
          Amount, €
        </Label>
        <Input
          id="pay-amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="pay-date" className="text-xs">
          Arrived on
        </Label>
        <Input
          id="pay-date"
          type="date"
          value={receivedOn}
          onChange={(event) => setReceivedOn(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="pay-method" className="text-xs">
          How
        </Label>
        <select
          id="pay-method"
          value={method}
          onChange={(event) => setMethod(event.target.value as PaymentMethod)}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          {PAYMENT_METHODS.map((option) => (
            <option key={option} value={option}>
              {PAYMENT_METHOD_LABEL[option]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="pay-ref" className="text-xs">
          Reference
        </Label>
        <Input
          id="pay-ref"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="From the statement"
        />
      </div>

      <div className="sm:col-span-4">
        <Button
          size="sm"
          disabled={add.isPending}
          onClick={() => {
            add
              .mutateAsync({
                amountEuros: Number(amount) || 0,
                method,
                receivedOn,
                reference,
                note: '',
              })
              .then(onDone)
              .catch((caught: unknown) =>
                onError(caught instanceof Error ? caught.message : 'That could not be recorded.'),
              )
          }}
        >
          {add.isPending ? 'Recording…' : 'Record it'}
        </Button>
        <span className="text-muted-foreground ms-3 text-xs">
          The date is when the money reached your account — that is what “arrived this month”
          counts.
        </span>
      </div>
    </div>
  )
}

function CorrectionPanel({
  invoice,
  kind,
  onError,
}: {
  invoice: Invoice
  kind: 'CANCELLATION' | 'CREDIT_NOTE'
  onError: (message: string) => void
}) {
  const correct = useCorrectInvoice(invoice.id)
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const cancelling = kind === 'CANCELLATION'

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-rose-500/40 bg-rose-500/5 p-4">
      <h2 className="text-sm font-semibold">
        {cancelling ? `Cancel ${invoice.number}` : `Credit note against ${invoice.number}`}
      </h2>
      <p className="text-muted-foreground text-sm">
        {cancelling
          ? 'This writes a new, numbered cancellation carrying the same lines, and marks this invoice void. Neither document can be deleted afterwards.'
          : 'This writes a new, numbered credit note. The original stays exactly as it was sent; what is still owed goes down by the amount below.'}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="correct-reason" className="text-xs">
            Why
          </Label>
          <Input
            id="correct-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={cancelling ? 'Wrong client' : 'Agreed discount on the booking system'}
          />
        </div>
        {cancelling ? null : (
          <div className="flex flex-col gap-1">
            <Label htmlFor="correct-amount" className="text-xs">
              Amount, €
            </Label>
            <Input
              id="correct-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
        )}
      </div>

      <div>
        <Button
          variant={cancelling ? 'destructive' : 'default'}
          size="sm"
          disabled={correct.isPending || reason.trim() === '' || (!cancelling && !Number(amount))}
          onClick={() => {
            correct
              .mutateAsync({
                kind,
                reason,
                lines: cancelling
                  ? []
                  : [
                      {
                        description: reason,
                        detail: `Credit against invoice ${invoice.number}`,
                        quantity: 1,
                        unitEuros: Number(amount) || 0,
                        taxRate: invoice.lines[0]?.taxRate ?? 0,
                      },
                    ],
              })
              .catch((caught: unknown) =>
                onError(caught instanceof Error ? caught.message : 'That could not be issued.'),
              )
          }}
        >
          {correct.isPending ? 'Issuing…' : cancelling ? 'Cancel this invoice' : 'Issue the credit note'}
        </Button>
      </div>
    </section>
  )
}
