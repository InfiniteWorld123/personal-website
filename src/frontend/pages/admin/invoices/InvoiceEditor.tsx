import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, FileText, Plus, Stamp, Trash2 } from 'lucide-react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelTitle } from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import { Textarea } from '#/frontend/components/ui/textarea'
import { invoicePdfUrl } from '#/frontend/api/invoice.api'
import { addDays, money, today } from '#/frontend/features/invoices/invoice-format'
import {
  clientsQuery,
  invoiceQuery,
  invoicesQuery,
  sellerQuery,
  useCreateInvoice,
  useDeleteInvoice,
  useIssueInvoice,
  useUpdateInvoice,
} from '#/frontend/features/invoices/invoice-queries'
import { usePrefetch } from '#/frontend/lib/prefetch'
import { cn } from '#/frontend/lib/utils'
import type { Invoice } from '#/shared/types/invoice.types'
import {
  DEFAULT_DUE_DAYS,
  periodLabel,
  periodOf,
  totalsOf,
  VAT_RATES,
  vatConflict,
  type InvoiceLanguage,
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

/**
 * A native select wearing the same clothes as `Input`.
 *
 * The same string as in `ClientsPage`: a select that is a different height
 * from the field beside it is the kind of difference nobody can name and
 * everybody can see. `bg-transparent` lets the panel it sits on show through,
 * so the control reads as part of the surface rather than a hole in it.
 */
const SELECT =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 motion-safe:transition-colors dark:bg-input/30'

/** A pill that is either the chosen answer or one of the others. */
const CHOICE =
  'focus-visible:ring-ring rounded-lg border motion-safe:transition-colors focus-visible:ring-2 focus-visible:outline-none'

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

/**
 * The document arriving, before it is known which of its two shapes it has.
 *
 * Both branches are a header over three stacked panels of roughly these
 * heights, so whichever one lands, nothing below it moves. It sits *above* the
 * keyed `<Draft>` subtree deliberately: it must never be part of what remounts
 * when the invoice identity changes.
 */
function EditorSkeleton() {
  return (
    <AdminPage width="narrow">
      <SkeletonScreen className="flex flex-col gap-6" label="Loading the invoice">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-3.5 w-72" />
        </div>

        <Panel className="grid gap-4 p-6 sm:grid-cols-2">
          {Array.from({ length: 2 }, (_, index) => (
            <div className="flex flex-col gap-1.5" key={index}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-full rounded-lg" />
            </div>
          ))}
        </Panel>

        <Panel className="flex flex-col gap-3 p-6">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 2 }, (_, index) => (
            <Skeleton className="h-28 w-full rounded-2xl" key={index} />
          ))}
          <Skeleton className="h-5 w-36 self-end" />
        </Panel>

        <Panel className="grid gap-4 p-6 sm:grid-cols-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </Panel>
      </SkeletonScreen>
    </AdminPage>
  )
}

export function InvoiceEditor({ invoiceId }: { invoiceId: string }) {
  const navigate = useNavigate()
  const existing = useQuery(invoiceQuery(invoiceId))
  const invoice = existing.data

  if (invoiceId !== '' && existing.isPending) {
    return <EditorSkeleton />
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
  const prefetch = usePrefetch()
  const clients = useQuery(clientsQuery(''))

  const [clientId, setClientId] = useState(invoice?.clientId ?? '')
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
  const [removing, setRemoving] = useState(false)

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

  /*
   * Recomputed from the same rates the totals above use, so the warning and
   * the VAT figure beside it can never disagree.
   *
   * `smallBusiness` is undefined until the seller query lands. Defaulting to
   * `false` while it is in flight keeps the warning from flashing on every
   * invoice for a moment before the answer arrives — the check runs again the
   * instant it does, and the server refuses regardless.
   */
  const vatConflicted = vatConflict(
    lines.map((line) => ({ taxRate: Number(line.taxRate) || 0 })),
    seller.data?.smallBusiness ?? false,
  )

  /*
   * Why **Issue it** cannot be pressed, in words, or null when it can.
   *
   * One value feeding both the `disabled` flag and the sentence printed beside
   * the button, because they were allowed to drift and did: the VAT warning
   * lived up in the lines panel, next to the rate it is about, and he scrolled
   * to the bottom, found a grey button, and had no idea why. A control that
   * refuses has to say so where it refuses — the explanation being *somewhere*
   * on the page is not the same as it being where he is looking.
   *
   * It still says it in the lines panel too. That one is for the moment he
   * types the rate; this one is for the moment he tries to act.
   */
  const blocked = vatConflicted
    ? 'Every rate has to be 0 while you are a Kleinunternehmer — see above.'
    : seller.data && !seller.data.ready
      ? `Your own details are still placeholders: ${seller.data.gaps.join(', ')}.`
      : null

  const setLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))

  const save = async () => {
    setError('')

    const payload = {
      clientId,
      dealId: invoice?.dealId ?? null,
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
        title={invoice ? 'Draft' : 'New invoice'}
        /* Switch 21: a draft has no number, and the reason is worth saying once. */
        description="No number yet — it is reserved when you issue it"
      />

      {/* ── Who and what kind ───────────────────────────────────────── */}
      <Panel className="flex flex-col gap-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invoice-client">Client</Label>
            {/*
              The one control on this screen that waits on the network. Before,
              it rendered as an empty picker — which looks like "you have no
              clients" rather than "not here yet", and those are very different
              pieces of news.
            */}
            {clients.isPending ? (
              <SkeletonScreen label="Loading the clients">
                <Skeleton className="h-8 w-full rounded-lg" />
              </SkeletonScreen>
            ) : (
              <select
                id="invoice-client"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                className={SELECT}
              >
                <option value="">Pick a client…</option>
                {(clients.data ?? []).map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.company || client.contactName}
                  </option>
                ))}
              </select>
            )}
            {chosen && !chosen.street ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                That client has no address yet. §14 UStG needs one on the paper —{' '}
                <Link
                  to="/admin/invoices/clients"
                  className="underline"
                  {...prefetch(clientsQuery(''))}
                >
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
              className={SELECT}
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

      </Panel>

      {/* ── Lines ───────────────────────────────────────────────────── */}
      <Panel className="flex flex-col gap-3 p-6">
        <div className="flex items-center justify-between">
          <PanelTitle>Lines</PanelTitle>
          <Button
            className="rounded-full"
            variant="outline"
            size="sm"
            onClick={() => setLines((current) => [...current, emptyLine(lines[0]?.taxRate ?? '0')])}
          >
            <Plus className="size-4" /> Add a line
          </Button>
        </div>

        {/* Carved into the panel rather than stacked on it: a line is part of
            this document, not a card of its own floating beside it. */}
        {lines.map((line, index) => (
          <div
            key={line.key}
            className="bg-canvas ring-panel-border flex flex-col gap-2 rounded-2xl p-4 ring-1"
          >
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
                  VAT
                </Label>
                {/*
                  The same two options the subscription form offers, and for
                  the same reason: a free box accepted 1,9 for 19, and 15 for
                  a rate Germany does not have. Neither is a typo anything
                  downstream could catch — `issueInvoice` refuses VAT while
                  §19 applies, but a wrong *rate* once it no longer does is a
                  document that looks entirely normal.

                  7 % covers books, food and public transport, not software,
                  so it is not offered: a third option here would be a wrong
                  answer made easy to pick.
                */}
                <select
                  id={`tax-${line.key}`}
                  className={SELECT}
                  value={line.taxRate}
                  onChange={(event) => setLine(line.key, { taxRate: event.target.value })}
                >
                  {VAT_RATES.map((rate) => (
                    <option key={rate} value={String(rate)}>
                      {rate} %
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}

        <div className="flex items-baseline justify-end gap-6 pt-1">
          <span className="text-muted-foreground text-xs">Net {money(totals.netCents)}</span>
          <span className="text-muted-foreground text-xs">VAT {money(totals.taxCents)}</span>
          <span className="font-heading tabular text-primary text-2xl leading-none font-semibold">
            {money(totals.totalCents)}
          </span>
        </div>
        {/*
          Said here, while he is looking at the rate he typed.

          `issueInvoice` refuses this combination outright, and it has to —
          under §14c(2) UStG the VAT printed on an invoice is owed to the
          Finanzamt whether or not it was allowed to be charged, and a
          Kleinunternehmer has no input tax to set against it. But being
          refused at the last step, after writing the whole document, is the
          small cruelty the seller warning above already avoids. So the same
          fact is said twice: here as a sentence, there as a wall.
        */}
        {vatConflicted ? (
          <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <span className="font-medium">
                This charges VAT while you are a Kleinunternehmer.
              </span>{' '}
              It cannot be issued that way: VAT shown on an invoice is owed to the Finanzamt
              either way (§14c UStG). Set every rate to 0, or turn off{' '}
              <code className="bg-muted rounded px-1 py-0.5">smallBusiness</code> in{' '}
              <code className="bg-muted rounded px-1 py-0.5">seller.ts</code>.
            </span>
          </p>
        ) : (
          /* Zero VAT is the §19 default and stays a field, so crossing the
             threshold is a number typed here rather than a migration. */
          <p className="text-muted-foreground text-xs">
            VAT stays at 0 while you are a Kleinunternehmer. The rate lives on the line, so old
            invoices keep the rate they were issued with.
          </p>
        )}
      </Panel>

      {/* ── Dates and the sentence ──────────────────────────────────── */}
      <Panel className="grid gap-4 p-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Payment term</Label>
          <div className="flex gap-2">
            {DUE_CHOICES.map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={dueDays === days}
                onClick={() => setDueDays(days)}
                className={cn(
                  CHOICE,
                  'px-3 py-1.5 text-sm',
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
      </Panel>

      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button className="rounded-full" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save draft'}
        </Button>

        {invoice ? (
          <>
            <Button className="rounded-full" variant="outline" asChild>
              <a href={invoicePdfUrl(invoice.id)} target="_blank" rel="noreferrer">
                <FileText className="size-4" /> See the paper
              </a>
            </Button>

            <Button
              className="rounded-full"
              variant="outline"
              disabled={blocked !== null || issue.isPending}
              title={blocked ?? undefined}
              onClick={() => setConfirming(true)}
            >
              <Stamp className="size-4" /> Issue it
            </Button>

            {/*
              Two clicks, not one.

              A draft is the only document in this system that can be
              destroyed, and until 20 Sep 2026 destroying one took a single
              click beside Save — no question, no undo, and the row gone. For
              a draft he typed himself that is an annoyance. For a draft a
              **subscription** wrote it is worse than that: the subscription
              already moved on to the next month when it wrote this one, so
              deleting it means the month is never billed, silently and for
              ever. The warning saying so sits right below, and a warning
              under a one-click button is a warning nobody reads in time.
            */}
            {removing ? (
              <span className="ms-auto flex items-center gap-2">
                <span className="text-muted-foreground text-xs">Delete it for good?</span>
                <Button
                  className="rounded-full"
                  size="sm"
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => {
                    remove
                      .mutateAsync(invoice.id)
                      .then(() => navigate({ to: '/admin/invoices' }))
                      .catch((caught: unknown) => {
                        setRemoving(false)
                        setError(
                          caught instanceof Error ? caught.message : 'That could not be removed.',
                        )
                      })
                  }}
                >
                  {remove.isPending ? 'Deleting…' : 'Yes, delete it'}
                </Button>
                <Button
                  className="rounded-full"
                  size="sm"
                  variant="ghost"
                  onClick={() => setRemoving(false)}
                >
                  Keep it
                </Button>
              </span>
            ) : (
              <Button
                variant="ghost"
                className="ms-auto rounded-full text-rose-600 dark:text-rose-400"
                disabled={remove.isPending}
                onClick={() => setRemoving(true)}
              >
                <Trash2 className="size-4" /> Delete draft
              </Button>
            )}
          </>
        ) : (
          <span className="text-muted-foreground text-xs">
            Save it first — issuing comes after, and cannot be undone.
          </span>
        )}
      </div>

      {/*
        What deleting THIS draft means, said before the click.

        A hand-written draft is cheap: delete it, type it again. A draft a
        subscription wrote is not — the subscription moved on to the next
        month when it wrote this one, so deleting it skips this month
        permanently and in silence. Verified on 20 Sep: delete the draft,
        re-run the generator, and September is simply never billed, with no
        trace anywhere.

        Skipping a month is a legitimate act (a waived month, goodwill). Doing
        it without knowing is not, and the difference between the two is
        exactly this sentence.
      */}
      {invoice?.fromSubscription && invoice.serviceFrom ? (
        <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            A subscription wrote this draft. Deleting it means{' '}
            <span className="font-medium">
              {periodLabel(periodOf(invoice.serviceFrom), 'en')} is never billed
            </span>{' '}
            for that subscription — it has already moved on to the next month.
          </span>
        </p>
      ) : null}

      {/* Beside the button it explains, not in the panel the rate lives in. */}
      {invoice && blocked ? (
        <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <span className="font-medium">This cannot be issued yet.</span> {blocked}
          </span>
        </p>
      ) : null}

      {/*
        The one irreversible act in the section, so it asks first and says
        exactly what becomes true. Everything else here can be changed or
        thrown away; after this, the only way back is a second document.
      */}
      {confirming && invoice ? (
        <Panel className="flex flex-col gap-3 border border-amber-500/40 bg-amber-500/5 p-6 ring-0">
          <PanelTitle>Issue this invoice?</PanelTitle>
          <ul className="text-muted-foreground list-disc space-y-1 ps-5 text-sm">
            <li>It takes the next number in this year&rsquo;s series, and keeps it.</li>
            <li>The PDF is written once and frozen — later changes never reach it.</li>
            <li>Nothing on it can be edited again. A mistake is fixed by a cancellation.</li>
          </ul>
          <div className="flex gap-2">
            <Button
              className="rounded-full"
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
            <Button className="rounded-full" variant="ghost" onClick={() => setConfirming(false)}>
              Not yet
            </Button>
          </div>
        </Panel>
      ) : null}
    </AdminPage>
  )
}
