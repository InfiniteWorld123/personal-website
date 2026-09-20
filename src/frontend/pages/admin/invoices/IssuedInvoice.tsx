import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  BellRing,
  CreditCard,
  FileText,
  Mail,
  Receipt,
  Trash2,
} from 'lucide-react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelTitle } from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { invoicePdfUrl } from '#/frontend/api/invoice.api'
import { personQuery, settingsQuery } from '#/frontend/features/inbox/inbox-queries'
import {
  SETTLEMENT_CLASS,
  day,
  lateLabel,
  money,
  today,
} from '#/frontend/features/invoices/invoice-format'
import {
  invoiceQuery,
  invoicesQuery,
  letterQuery,
  sellerQuery,
  useAddPayment,
  useCorrectInvoice,
  useDeletePayment,
} from '#/frontend/features/invoices/invoice-queries'
import { usePrefetch } from '#/frontend/lib/prefetch'
import { cn } from '#/frontend/lib/utils'
import type { Invoice } from '#/shared/types/invoice.types'
import {
  INVOICE_KIND_LABEL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  SETTLEMENT_LABEL,
  balanceOf,
  payLinkUsable,
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

/**
 * A native select wearing the same clothes as `Input`.
 *
 * The same string as in `ClientsPage` and `InvoiceEditor`, so the three
 * hand-styled selects of this section are finally one control.
 */
const SELECT =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 motion-safe:transition-colors dark:bg-input/30'

export function IssuedInvoice({ invoice }: { invoice: Invoice }) {
  const [panel, setPanel] = useState<'none' | 'payment' | 'cancel' | 'credit'>('none')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [handing, setHanding] = useState<LetterKind | null>(null)

  const prefetch = usePrefetch()
  const navigate = useNavigate()
  const client = useQueryClient()
  const { owed, over } = balanceOf(invoice)

  /**
   * The conversation every letter button lands in, warmed on the way to it.
   *
   * Only `personQuery` and `settingsQuery` — the two reads the inbox screen
   * actually performs on mount. The letter itself is deliberately *not*
   * prefetched: `letterQuery` resolves the person, may create them, and
   * attaches the PDF to the thread, so hovering a button would write to the
   * database. A prefetch must never do anything a click has not been asked
   * for yet.
   *
   * Undefined when the client has no conversation yet, because the person the
   * letter will land in is chosen by the server and there is no id to warm.
   */
  const conversation = invoice.client.leadId
    ? prefetch(personQuery(invoice.client.leadId), settingsQuery())
    : undefined

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
    <AdminPage width="narrow">
      <PageHeader
        back={
          <Button asChild className="-ms-2 w-fit rounded-full" size="sm" variant="ghost">
            {/* The list he came from, fetched while he is still deciding to go back. */}
            <Link to="/admin/invoices" {...prefetch(invoicesQuery('ALL', ''), sellerQuery())}>
              <ArrowLeft className="size-4" /> Invoices
            </Link>
          </Button>
        }
        title={
          <span className="tabular">
            {invoice.kind === 'INVOICE' ? 'Invoice' : INVOICE_KIND_LABEL[invoice.kind]}{' '}
            <span className="text-primary">{invoice.number}</span>
          </span>
        }
        actions={
          <span
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs font-medium',
              SETTLEMENT_CLASS[invoice.settlement],
            )}
          >
            {SETTLEMENT_LABEL[invoice.settlement]}
            {invoice.daysLate > 0 ? ` · ${lateLabel(invoice.daysLate)}` : ''}
          </span>
        }
      />

      {/* ── The facts ───────────────────────────────────────────────── */}
      <Panel className="grid gap-4 p-6 sm:grid-cols-2">
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
          {/*
            Named separately from Paid, because they are different facts: money
            that arrived, and money given back. Merging them would say "paid
            400 €" about money nobody ever sent.
          */}
          {invoice.creditedCents > 0 ? (
            <>
              <dt className="text-muted-foreground">Credited</dt>
              <dd className="tabular text-end">
                −{money(invoice.creditedCents, invoice.currency)}
              </dd>
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
          {/*
            The other direction, which had no name at all. A client who
            transfers twice leaves him believing he has been paid when he owes
            a refund — and nothing on any screen said so.
          */}
          {over > 0 ? (
            <>
              <dt className="text-amber-700 dark:text-amber-400">Overpaid by</dt>
              <dd className="tabular text-end font-semibold text-amber-700 dark:text-amber-400">
                {money(over, invoice.currency)}
              </dd>
            </>
          ) : null}
        </dl>
      </Panel>

      {/*
        The card link, where he can copy it.

        It is already on the paper and already in the letter, so this is for
        the third case: a client on the phone who wants it now. Shown only
        while the invoice can still be paid — on a cancelled or settled
        document it is an offer that leads nowhere.
      */}
      {payLinkUsable(invoice) ? (
        <Panel className="flex flex-wrap items-center gap-3 p-4">
          <CreditCard className="text-primary size-4 shrink-0" aria-hidden="true" />
          <span className="text-sm">
            <span className="font-medium">Pay by card</span>{' '}
            <span className="text-muted-foreground">— in the letter already.</span>
          </span>
          <span className="ms-auto flex gap-2">
            <Button
              className="rounded-full"
              size="sm"
              variant="outline"
              onClick={() => {
                try {
                  void navigator.clipboard?.writeText(invoice.payUrl ?? '')
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1800)
                } catch {
                  // A browser that refuses the clipboard is not an error worth
                  // a red panel: the link is a click away below.
                  setCopied(false)
                }
              }}
            >
              {copied ? 'Copied' : 'Copy the link'}
            </Button>
            <Button className="rounded-full" size="sm" variant="ghost" asChild>
              <a href={invoice.payUrl} target="_blank" rel="noreferrer">
                Open
              </a>
            </Button>
          </span>
        </Panel>
      ) : null}

      {/*
        A link that exists but no longer works, said so.

        After a partial payment or a credit note the link is switched off at
        Stripe — it charged the whole total, and that is no longer what is
        owed. Nothing on the screen said so; this row used to offer "Copy the
        link" on exactly that invoice.
      */}
      {invoice.payUrl && !payLinkUsable(invoice) && owed > 0 && invoice.status === 'ISSUED' ? (
        <p className="text-muted-foreground text-xs">
          The card link is switched off: it charged the full amount, and that is no longer what
          is owed. The rest comes by bank transfer.
        </p>
      ) : null}

      {/* ── What was billed ─────────────────────────────────────────── */}
      <Panel className="overflow-hidden">
        {invoice.lines.map((line) => (
          <div
            key={line.id}
            className="border-border/60 flex items-start gap-3 border-b px-5 py-3.5 last:border-b-0"
          >
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
      </Panel>

      {/* ── Money that arrived ──────────────────────────────────────── */}
      {invoice.kind === 'INVOICE' ? (
        <Panel className="flex flex-col gap-3 p-6">
          <div className="flex items-center justify-between gap-4">
            <PanelTitle>Payments</PanelTitle>
            {invoice.status === 'ISSUED' ? (
              <Button
                className="rounded-full"
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
        </Panel>
      ) : null}

      {/* ── Corrections ─────────────────────────────────────────────── */}
      {invoice.correctsNumber ? (
        <p className="text-muted-foreground text-sm">
          This {INVOICE_KIND_LABEL[invoice.kind].toLowerCase()} relates to invoice{' '}
          <span className="tabular">{invoice.correctsNumber}</span>.
        </p>
      ) : null}

      {invoice.correctedBy.length > 0 ? (
        <Panel className="border border-amber-500/40 bg-amber-500/5 p-6 text-sm ring-0">
          {invoice.correctedBy.map((correction) => (
            <p key={correction.id}>
              {INVOICE_KIND_LABEL[correction.kind]}{' '}
              <Link
                to="/admin/invoices/$invoiceId"
                params={{ invoiceId: correction.id }}
                // The document this number opens, fetched on the way to it.
                {...prefetch(invoiceQuery(correction.id))}
                className="tabular underline"
              >
                {correction.number}
              </Link>{' '}
              was written against this invoice.
            </p>
          ))}
        </Panel>
      ) : null}

      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

      {/* ── What he can do ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button className="rounded-full" variant="outline" asChild>
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
          className="rounded-full"
          variant="outline"
          disabled={handing !== null || !invoice.client.email}
          title={invoice.client.email ? undefined : 'That client has no email address'}
          onClick={() => void handOver('INVOICE')}
          {...conversation}
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
            className="rounded-full"
            variant="outline"
            disabled={handing !== null || !invoice.client.email}
            onClick={() => void handOver('REMINDER')}
            {...conversation}
          >
            <BellRing className="size-4" />
            {handing === 'REMINDER' ? 'Preparing…' : 'Remind'}
          </Button>
        ) : null}

        {invoice.status === 'ISSUED' && invoice.kind === 'INVOICE' ? (
          <>
            <Button
              className="rounded-full text-rose-600 dark:text-rose-400"
              variant="ghost"
              onClick={() => setPanel(panel === 'cancel' ? 'none' : 'cancel')}
            >
              <Ban className="size-4" /> Cancel it
            </Button>
            <Button
              className="rounded-full"
              variant="ghost"
              onClick={() => setPanel(panel === 'credit' ? 'none' : 'credit')}
            >
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
        <Panel className="p-6">
          <PanelTitle>Letters sent</PanelTitle>
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
              // The conversation itself, warmed before he reaches it.
              {...conversation}
              className="text-primary mt-2 inline-block text-sm underline"
            >
              Open the conversation
            </Link>
          ) : null}
        </Panel>
      ) : null}

      {panel === 'cancel' ? (
        <CorrectionPanel invoice={invoice} kind="CANCELLATION" onError={setError} />
      ) : null}
      {panel === 'credit' ? (
        <CorrectionPanel invoice={invoice} kind="CREDIT_NOTE" onError={setError} />
      ) : null}
    </AdminPage>
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

  /*
   * More than is left to pay, said before it is recorded.
   *
   * Not a refusal: a client really does transfer twice, or round 990 up to
   * 1000, and a system that refused the truth would push him into not
   * recording it at all. But it was accepted in complete silence, which left
   * him believing he had been paid when he owed a refund — so the number is
   * named here, while he can still check the statement, and again on the
   * invoice afterwards.
   */
  const excess = Math.round((Number(amount) || 0) * 100) - owed

  return (
    // Carved into the panel rather than raised on it: this belongs to the
    // payments above it, and a second floating card would say otherwise.
    <div className="bg-canvas ring-panel-border grid gap-3 rounded-2xl p-4 ring-1 sm:grid-cols-4">
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
          className={SELECT}
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

      {excess > 0 && owed > 0 ? (
        <p className="flex items-start gap-2 text-xs text-amber-700 sm:col-span-4 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            That is <span className="font-medium">{money(excess, invoice.currency)}</span> more
            than is left to pay. Record it if that is what really arrived — the invoice will
            show the difference as overpaid, and you owe it back.
          </span>
        </p>
      ) : null}

      <div className="sm:col-span-4">
        <Button
          className="rounded-full"
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
    <Panel className="flex flex-col gap-3 border border-rose-500/40 bg-rose-500/5 p-6 ring-0">
      <PanelTitle>
        {cancelling ? `Cancel ${invoice.number}` : `Credit note against ${invoice.number}`}
      </PanelTitle>
      <p className="text-muted-foreground text-sm">
        {cancelling
          ? 'This writes a new, numbered cancellation carrying the same lines, and marks this invoice void. Neither document can be deleted afterwards.'
          : 'This writes a new, numbered credit note. The original stays exactly as it was sent; what is still owed goes down by the amount below.'}
      </p>

      {/*
        The consequence the sentence above does not carry: money already
        arrived on this invoice. Voiding the document does not void the
        transfer — the payment rows stay, the month's figures still count
        them, and the client is now owed that money back. Cancelling a paid
        invoice is sometimes exactly right (paid, then the deal fell through);
        doing it while believing the money question disappears with the
        document is how a refund gets forgotten for a quarter.
      */}
      {cancelling && invoice.paidCents > 0 ? (
        <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">
              {money(invoice.paidCents, invoice.currency)} has already arrived on this invoice.
            </span>{' '}
            Cancelling does not undo that — you will owe it back to {invoice.clientName}.
          </span>
        </p>
      ) : null}

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
          className="rounded-full"
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
    </Panel>
  )
}
