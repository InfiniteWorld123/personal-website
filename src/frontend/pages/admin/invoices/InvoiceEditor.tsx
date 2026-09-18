import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { ArrowLeft, FileText, Plus, Stamp, Trash2 } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { Textarea } from '#/frontend/components/ui/textarea'
import { invoicePdfUrl } from '#/frontend/api/invoice.api'
import { addDays, money, today } from '#/frontend/features/invoices/invoice-format'
import {
  clientsQuery,
  invoiceQuery,
  sellerQuery,
  useCreateInvoice,
  useDeleteInvoice,
  useIssueInvoice,
  useUpdateInvoice,
} from '#/frontend/features/invoices/invoice-queries'
import { cn } from '#/frontend/lib/utils'
import type { Invoice } from '#/shared/types/invoice.types'
import {
  DEFAULT_DUE_DAYS,
  MONEY_KINDS,
  MONEY_KIND_LABEL,
  totalsOf,
  type InvoiceLanguage,
  type MoneyKind,
} from '#/shared/validation/invoice.validation'
import { IssuedInvoice } from './IssuedInvoice'

/**
 * Writing an invoice, and reading one that has been issued.
 *
 * One route, two screens, because they are the same document in its two
 * states and splitting them would let him arrive at an editor for something
 * that can no longer be edited. A draft is a form. An issued invoice is a
 * record with actions beside it — and `IssuedInvoice` draws that half.
 */

type LineDraft = {
  key: string
  description: string
  detail: string
  quantity: string
  unitEuros: string
  taxRate: string
}

const emptyLine = (taxRate: string): LineDraft => ({
  key: crypto.randomUUID(),
  description: '',
  detail: '',
  quantity: '1',
  unitEuros: '',
  taxRate,
})

const linesFrom = (invoice: Invoice | undefined, fallbackRate: string): LineDraft[] =>
  invoice && invoice.lines.length > 0
    ? invoice.lines.map((line) => ({
        key: line.id,
        description: line.description,
        detail: line.detail,
        quantity: String(line.quantity),
        unitEuros: (line.unitCents / 100).toFixed(2),
        taxRate: String(line.taxRate),
      }))
    : [emptyLine(fallbackRate)]

const DUE_CHOICES = [7, DEFAULT_DUE_DAYS, 30]

export function InvoiceEditor({ invoiceId }: { invoiceId: string }) {
  const navigate = useNavigate()
  const existing = useQuery(invoiceQuery(invoiceId))
  const invoice = existing.data

  if (invoiceId !== '' && existing.isPending) {
    return <p className="text-muted-foreground p-6 text-sm">Loading…</p>
  }

  if (invoice && invoice.status !== 'DRAFT') {
    return <IssuedInvoice invoice={invoice} />
  }

  return <Draft key={invoice?.id ?? 'new'} invoice={invoice} navigate={navigate} />
}

function Draft({
  invoice,
  navigate,
}: {
  invoice: Invoice | undefined
  navigate: ReturnType<typeof useNavigate>
}) {
  const clients = useQuery(clientsQuery(''))

  const [clientId, setClientId] = useState(invoice?.clientId ?? '')
  const [moneyKind, setMoneyKind] = useState<MoneyKind>(invoice?.moneyKind ?? 'BUILD')
  const [language, setLanguage] = useState<InvoiceLanguage>(invoice?.language ?? 'de')
  const [dueDays, setDueDays] = useState(DEFAULT_DUE_DAYS)
  const [serviceFrom, setServiceFrom] = useState(invoice?.serviceFrom ?? '')
  const [serviceTo, setServiceTo] = useState(invoice?.serviceTo ?? '')
  const [note, setNote] = useState(invoice?.note ?? '')
  const [lines, setLines] = useState<LineDraft[]>(() => linesFrom(invoice, '0'))
  const [error, setError] = useState('')

  const create = useCreateInvoice()
  const update = useUpdateInvoice(invoice?.id ?? '')
  const issue = useIssueInvoice()
  const remove = useDeleteInvoice()
  const seller = useQuery(sellerQuery())
  const saving = create.isPending || update.isPending
  const [confirming, setConfirming] = useState(false)

  /**
   * The running total, from the same function the server and the paper use.
   *
   * Imported rather than reimplemented: a second rounding rule on the client
   * is a second answer, and the one place it would show up is a client asking
   * why the screen said something the PDF does not.
   */
  const totals = useMemo(
    () =>
      totalsOf(
        lines.map((line) => ({
          quantity: Number(line.quantity) || 0,
          unitEuros: Math.round((Number(line.unitEuros) || 0) * 100),
          taxRate: Number(line.taxRate) || 0,
        })),
      ),
    [lines],
  )

  const setLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))

  const save = async () => {
    setError('')

    const payload = {
      clientId,
      dealId: invoice?.dealId ?? null,
      moneyKind,
      language,
      dueDays,
      serviceFrom: serviceFrom || null,
      serviceTo: serviceTo || null,
      note,
      lines: lines
        .filter((line) => line.description.trim() !== '')
        .map((line) => ({
          description: line.description,
          detail: line.detail,
          quantity: Number(line.quantity) || 1,
          unitEuros: Number(line.unitEuros) || 0,
          taxRate: Number(line.taxRate) || 0,
        })),
    }

    if (!payload.clientId) {
      setError('Pick a client first.')

      return
    }

    if (payload.lines.length === 0) {
      setError('An invoice needs at least one line with a description.')

      return
    }

    try {
      const saved = invoice
        ? await update.mutateAsync(payload)
        : await create.mutateAsync(payload)

      await navigate({ to: '/admin/invoices/$invoiceId', params: { invoiceId: saved.id } })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That could not be saved.')
    }
  }

  const chosen = clients.data?.find((client) => client.id === clientId)

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/invoices">
            <ArrowLeft className="size-4" /> Invoices
          </Link>
        </Button>

        <h1 className="text-2xl font-semibold tracking-tight">
          {invoice ? 'Draft' : 'New invoice'}
        </h1>

        <span className="text-muted-foreground ms-auto text-xs">
          {/* Switch 21: a draft has no number, and the reason is worth saying once. */}
          No number yet — it is reserved when you issue it
        </span>
      </header>

      {/* ── Who and what kind ───────────────────────────────────────── */}
      <section className="bg-card flex flex-col gap-4 rounded-xl border p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invoice-client">Client</Label>
            <select
              id="invoice-client"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="">Pick a client…</option>
              {(clients.data ?? []).map((client) => (
                <option key={client.id} value={client.id}>
                  {client.company || client.contactName}
                </option>
              ))}
            </select>
            {chosen && !chosen.street ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                That client has no address yet. §14 UStG needs one on the paper —{' '}
                <Link to="/admin/invoices/clients" className="underline">
                  add it
                </Link>
                .
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invoice-language">Language of the paper</Label>
            <select
              id="invoice-language"
              value={language}
              onChange={(event) => setLanguage(event.target.value as InvoiceLanguage)}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        {/*
          The rule the whole business rests on, made a choice he has to make.
          A build invoice and a subscription invoice are two documents — never
          two lines on one — and this is where that is decided.
        */}
        <div className="flex flex-col gap-1.5">
          <Label>What kind of money is this?</Label>
          <div className="flex flex-wrap gap-2">
            {MONEY_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setMoneyKind(kind)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-start text-sm transition-colors',
                  moneyKind === kind
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50',
                )}
              >
                {MONEY_KIND_LABEL[kind]}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            Only subscription invoices reach the “every month” figure. Nothing in this system
            adds the two together.
          </p>
        </div>
      </section>

      {/* ── Lines ───────────────────────────────────────────────────── */}
      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Lines</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLines((current) => [...current, emptyLine(lines[0]?.taxRate ?? '0')])}
          >
            <Plus className="size-4" /> Add a line
          </Button>
        </div>

        {lines.map((line, index) => (
          <div key={line.key} className="border-border/70 flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground tabular w-5 pt-2 text-xs">{index + 1}</span>

              <div className="flex flex-1 flex-col gap-2">
                <Input
                  value={line.description}
                  onChange={(event) => setLine(line.key, { description: event.target.value })}
                  placeholder="Website-Einrichtung"
                  aria-label={`Line ${index + 1} description`}
                />
                <Input
                  value={line.detail}
                  onChange={(event) => setLine(line.key, { detail: event.target.value })}
                  placeholder="The grey line underneath — what the client is actually agreeing to"
                  aria-label={`Line ${index + 1} detail`}
                />
              </div>

              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove line ${index + 1}`}
                disabled={lines.length === 1}
                onClick={() =>
                  setLines((current) => current.filter((other) => other.key !== line.key))
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2 ps-7">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`qty-${line.key}`} className="text-xs">
                  Quantity
                </Label>
                <Input
                  id={`qty-${line.key}`}
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(event) => setLine(line.key, { quantity: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`unit-${line.key}`} className="text-xs">
                  Price, €
                </Label>
                <Input
                  id={`unit-${line.key}`}
                  inputMode="decimal"
                  value={line.unitEuros}
                  onChange={(event) => setLine(line.key, { unitEuros: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`tax-${line.key}`} className="text-xs">
                  VAT %
                </Label>
                <Input
                  id={`tax-${line.key}`}
                  inputMode="decimal"
                  value={line.taxRate}
                  onChange={(event) => setLine(line.key, { taxRate: event.target.value })}
                />
              </div>
            </div>
          </div>
        ))}

        <div className="flex items-baseline justify-end gap-6 pt-1">
          <span className="text-muted-foreground text-xs">Net {money(totals.netCents)}</span>
          <span className="text-muted-foreground text-xs">VAT {money(totals.taxCents)}</span>
          <span className="tabular text-primary text-lg font-semibold">
            {money(totals.totalCents)}
          </span>
        </div>
        {/* Zero VAT is the §19 default and stays a field, so crossing the
            threshold is a number typed here rather than a migration. */}
        <p className="text-muted-foreground text-xs">
          VAT stays at 0 while you are a Kleinunternehmer. The rate lives on the line, so old
          invoices keep the rate they were issued with.
        </p>
      </section>

      {/* ── Dates and the sentence ──────────────────────────────────── */}
      <section className="bg-card grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Payment term</Label>
          <div className="flex gap-2">
            {DUE_CHOICES.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setDueDays(days)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                  dueDays === days
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50',
                )}
              >
                {days} days
              </button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            Due {addDays(today(), dueDays)} if you issue it today.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="service-from">Service from</Label>
            <Input
              id="service-from"
              type="date"
              value={serviceFrom}
              onChange={(event) => setServiceFrom(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="service-to">to</Label>
            <Input
              id="service-to"
              type="date"
              value={serviceTo}
              onChange={(event) => setServiceTo(event.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="invoice-note">Your line, above the signature</Label>
          <Textarea
            id="invoice-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="Ich freue mich auf die weitere Zusammenarbeit."
          />
        </div>
      </section>

      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save draft'}
        </Button>

        {invoice ? (
          <>
            <Button variant="outline" asChild>
              <a href={invoicePdfUrl(invoice.id)} target="_blank" rel="noreferrer">
                <FileText className="size-4" /> See the paper
              </a>
            </Button>

            <Button
              variant="outline"
              disabled={!seller.data?.ready || issue.isPending}
              onClick={() => setConfirming(true)}
            >
              <Stamp className="size-4" /> Issue it
            </Button>

            <Button
              variant="ghost"
              className="ms-auto text-rose-600 dark:text-rose-400"
              disabled={remove.isPending}
              onClick={() => {
                remove
                  .mutateAsync(invoice.id)
                  .then(() => navigate({ to: '/admin/invoices' }))
                  .catch((caught: unknown) =>
                    setError(caught instanceof Error ? caught.message : 'That could not be removed.'),
                  )
              }}
            >
              <Trash2 className="size-4" /> Delete draft
            </Button>
          </>
        ) : (
          <span className="text-muted-foreground text-xs">
            Save it first — issuing comes after, and cannot be undone.
          </span>
        )}
      </div>

      {/*
        The one irreversible act in the section, so it asks first and says
        exactly what becomes true. Everything else here can be changed or
        thrown away; after this, the only way back is a second document.
      */}
      {confirming && invoice ? (
        <section className="flex flex-col gap-3 rounded-xl border border-amber-500/50 bg-amber-500/5 p-4">
          <h2 className="text-sm font-semibold">Issue this invoice?</h2>
          <ul className="text-muted-foreground list-disc space-y-1 ps-5 text-sm">
            <li>It takes the next number in this year&rsquo;s series, and keeps it.</li>
            <li>The PDF is written once and frozen — later changes never reach it.</li>
            <li>Nothing on it can be edited again. A mistake is fixed by a cancellation.</li>
          </ul>
          <div className="flex gap-2">
            <Button
              disabled={issue.isPending}
              onClick={() => {
                issue
                  .mutateAsync(invoice.id)
                  .then(() => setConfirming(false))
                  .catch((caught: unknown) => {
                    setConfirming(false)
                    setError(caught instanceof Error ? caught.message : 'That could not be issued.')
                  })
              }}
            >
              {issue.isPending ? 'Issuing…' : 'Yes, issue it'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Not yet
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
