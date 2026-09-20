import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { AlertTriangle, Plus, Search, Send, Users } from 'lucide-react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelNote } from '#/frontend/components/admin/Panel'
import { StatCard, StatCardSkeleton } from '#/frontend/components/admin/StatCard'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import {
  SETTLEMENT_CLASS,
  SETTLEMENT_WEIGHT,
  day,
  lateLabel,
  money,
  monthName,
} from '#/frontend/features/invoices/invoice-format'
import {
  clientsQuery,
  invoiceQuery,
  invoicesQuery,
  sellerQuery,
  sentLettersQuery,
} from '#/frontend/features/invoices/invoice-queries'
import { usePrefetch } from '#/frontend/lib/prefetch'
import { cn } from '#/frontend/lib/utils'
import type { InvoiceRow, InvoiceSummary } from '#/shared/types/invoice.types'
import {
  INVOICE_KIND_LABEL,
  SETTLEMENT_LABEL,
  type Settlement,
} from '#/shared/validation/invoice.validation'

/**
 * Invoices — the section that replaced the disabled **Revenue** entry.
 *
 * It opens on one screen answering all three of the questions he asked for:
 * who has not paid (the figures, and overdue rows first), what came in this
 * month, and a button that starts the next invoice.
 *
 * Every figure on top is computed from the rows beneath it in the same
 * request. Nothing here is stored or cached, so there is no number on this
 * page he cannot follow to a document.
 */

type Filter = Settlement | 'ALL'

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'ALL', label: 'Everything' },
  { value: 'OVERDUE', label: 'Overdue' },
  // "Unpaid", not "Sent". An invoice lands in this group the moment it is
  // issued, whether or not a letter ever left — and the section now has a
  // Sent register a click away, where the word means an outgoing message
  // exists. One word, two facts, is how a screen starts lying quietly.
  { value: 'OPEN', label: 'Unpaid' },
  { value: 'PART', label: 'Part paid' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'PAID', label: 'Paid' },
]

/**
 * The figures.
 *
 * Four now. There was a fifth — "Put aside for tax", a flat 30 % of what
 * arrived — and on 20 Sep 2026 he said it should not be there. He was right,
 * for a sharper reason than the one he gave: `§19` frees him from **VAT**,
 * not from income tax, so the card was not describing a tax he does not owe.
 * It was describing one he might, on the wrong basis. Income tax is charged
 * on profit, not on money in — after expenses, and nothing at all below the
 * Grundfreibetrag — so 30 % of receipts could be far too much or far too
 * little, and this code cannot know which.
 *
 * A figure that looks like advice and is not is the one thing this admin must
 * never do, and a caption reading "an estimate, not advice" did not make it
 * one. Deleted rather than reworded. It comes back the day he has a
 * Steuerberater and real expenses to compute it from.
 *
 * Two of the four carry a second line saying what the number actually counts —
 * because "this month" and "recurring" are the two that a person could
 * otherwise read as meaning something they do not.
 *
 * The one filled card is what arrived, not what is late. Late is the alarm and
 * it earns its colour only when it is above zero; what arrived is the figure he
 * opens the section to see, whatever it says.
 */
function Figures({ summary }: { summary: InvoiceSummary }) {
  return (
    <section aria-label="Figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        className="sm:col-span-2 xl:row-span-2"
        foot="By the day it reached the bank"
        label={`Arrived in ${monthName(summary.month)}`}
        tone="brand"
        value={money(summary.thisMonthCents, summary.currency)}
      />

      <StatCard
        foot={
          summary.overdueCount === 0
            ? 'Nothing is late'
            : `${summary.overdueCount} ${summary.overdueCount === 1 ? 'invoice' : 'invoices'}`
        }
        label="Overdue"
        tone={summary.overdueCents > 0 ? 'alert' : 'plain'}
        value={money(summary.overdueCents, summary.currency)}
      />

      <StatCard
        foot="Issued, still owed"
        label="Not paid yet"
        value={money(summary.openCents, summary.currency)}
      />

      <StatCard
        foot="Subscriptions only — no build money"
        label="Every month"
        value={money(summary.recurringCents, summary.currency)}
      />

    </section>
  )
}

function FiguresSkeleton() {
  return (
    <SkeletonScreen
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      label="Loading the figures"
    >
      <StatCardSkeleton className="sm:col-span-2 xl:row-span-2" />
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
    </SkeletonScreen>
  )
}

function Row({ row }: { row: InvoiceRow }) {
  const prefetch = usePrefetch()
  const owed = row.totalCents - row.paidCents

  return (
    <Link
      to="/admin/invoices/$invoiceId"
      params={{ invoiceId: row.id }}
      // The document this row opens, fetched while the pointer is still on it.
      {...prefetch(invoiceQuery(row.id))}
      className="hover:bg-accent/50 focus-visible:ring-ring border-border/60 flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0 motion-safe:transition-colors focus-visible:ring-2 focus-visible:-outline-offset-2 focus-visible:outline-none"
    >
      <span
        className={cn(
          'rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
          SETTLEMENT_CLASS[row.settlement],
        )}
      >
        {SETTLEMENT_LABEL[row.settlement]}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{row.clientName}</span>
        <span className="text-muted-foreground block truncate text-xs">
          {row.kind === 'INVOICE' ? row.title || 'No lines yet' : INVOICE_KIND_LABEL[row.kind]}
          {row.number ? <span className="tabular"> · {row.number}</span> : null}
          {row.issuedOn ? ` · ${day(row.issuedOn)}` : ' · not issued'}
          {/* Switch 17: one day late and thirty days late are different facts. */}
          {row.daysLate > 0 ? (
            <span className="text-rose-600 dark:text-rose-400"> · {lateLabel(row.daysLate)}</span>
          ) : null}
        </span>
      </span>

      <span className="text-end">
        <span className="tabular block text-sm font-semibold">
          {money(row.totalCents, row.currency)}
        </span>
        {row.paidCents > 0 && owed > 0 ? (
          <span className="tabular text-muted-foreground block text-[11px]">
            {money(owed, row.currency)} left
          </span>
        ) : null}
      </span>
    </Link>
  )
}

/** The same rows, not yet arrived: pill, two lines, a figure at the end. */
function RowsSkeleton() {
  return (
    <SkeletonScreen label="Loading the invoices">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          className="border-border/60 flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0"
          key={index}
        >
          <Skeleton className="h-5 w-16 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="mt-2 h-3 w-64" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </SkeletonScreen>
  )
}

export function InvoicesPage() {
  const prefetch = usePrefetch()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')

  const list = useQuery(invoicesQuery(filter, search))
  const seller = useQuery(sellerQuery())

  // Switch 16 — overdue first. Sorted here rather than in SQL because the
  // settlement it sorts by is derived from today's date and the payments, and
  // expressing that twice is how a list and its own order start to disagree.
  const rows = [...(list.data?.rows ?? [])].sort((a, b) => {
    const byState = SETTLEMENT_WEIGHT[a.settlement] - SETTLEMENT_WEIGHT[b.settlement]

    if (byState !== 0) return byState

    // Newest first inside a group. A draft has no issue date, so it sorts as
    // "not yet" rather than as the year 1970.
    return (b.issuedOn ?? '9999-99-99').localeCompare(a.issuedOn ?? '9999-99-99')
  })

  return (
    <AdminPage>
      <PageHeader
        title="Invoices"
        description="What has been billed, what has been paid, and what is late."
        actions={
          <>
            {/*
              What he is holding, rather than what he is owed.
              Its own screen and not a filter here, because a row there is a
              *letter* and a row here is a document: an invoice sent, chased,
              then sent again after a client lost it is three rows there and
              one row here, and folding them together would mean picking one
              of those two truths to tell.
            */}
            <Button asChild className="rounded-full" size="sm" variant="outline">
              <Link to="/admin/invoices/sent" {...prefetch(sentLettersQuery())}>
                <Send className="size-4" /> Sent
              </Link>
            </Button>
            <Button asChild className="rounded-full" size="sm" variant="outline">
              <Link to="/admin/invoices/clients" {...prefetch(clientsQuery(''))}>
                <Users className="size-4" /> Clients
              </Link>
            </Button>
            <Button asChild className="rounded-full" size="sm">
              <Link to="/admin/invoices/new" {...prefetch(clientsQuery(''), sellerQuery())}>
                <Plus className="size-4" /> New invoice
              </Link>
            </Button>
          </>
        }
      />

      {/*
        Said before he starts, not when he presses Issue.
        `seller.ts` still holding placeholders means no invoice can go out, and
        finding that out at the last step — after writing the whole document —
        is the kind of small cruelty this admin is supposed to avoid.
      */}
      {seller.data && !seller.data.ready ? (
        <Panel className="flex items-start gap-3 border border-amber-500/40 bg-amber-500/5 p-4 ring-0">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm">
            <span className="font-medium">Your own details are still placeholders.</span>{' '}
            <span className="text-muted-foreground">
              Fill in {seller.data.gaps.join(', ')} in{' '}
              <code className="bg-muted rounded px-1 py-0.5 text-xs">
                src/backend/modules/invoices/seller.ts
              </code>{' '}
              and deploy. Drafts work; nothing can be issued until then.
            </span>
          </p>
        </Panel>
      ) : seller.data?.isTest ? (
        /*
          The other half of the same warning, and the more dangerous half.
          Everything works here — invoices issue, take numbers, land in the
          register — and the account at the foot of every one of them does not
          exist. Without this line he could spend an evening believing he had
          billed somebody. Said once, at the top, rather than at the moment he
          presses Issue, because by then he has already written the document.
        */
        <Panel className="flex items-start gap-3 border border-amber-500/40 bg-amber-500/5 p-4 ring-0">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm">
            <span className="font-medium">You are on invented details.</span>{' '}
            <span className="text-muted-foreground">
              Your real address, tax number and bank account are still{' '}
              <code className="bg-muted rounded px-1 py-0.5 text-xs">TODO</code> in{' '}
              <code className="bg-muted rounded px-1 py-0.5 text-xs">
                src/backend/modules/invoices/seller.ts
              </code>
              , so this machine prints a test set instead. Everything works and
              every page is stamped <span className="font-medium">TEST</span> — nobody
              could pay one. The live site refuses to issue at all until you fill
              yours in.
            </span>
          </p>
        </Panel>
      ) : null}

      {list.isPending ? <FiguresSkeleton /> : list.data ? <Figures summary={list.data.summary} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Client, number, or a line"
            className="bg-panel ps-8"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs motion-safe:transition-colors',
                filter === option.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-panel text-muted-foreground hover:border-primary/50',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <Panel className="overflow-hidden">
        {list.isPending ? (
          <RowsSkeleton />
        ) : list.isError ? (
          /*
            Said, rather than shown as an empty list.
            A failed request and "you have no invoices" look identical to a
            person, and on a money screen the wrong one of those is the kind of
            quiet lie this admin exists not to tell.
          */
          <PanelNote tone="error">
            <div>
              <p className="font-medium">The invoices could not be loaded.</p>
              <p className="text-muted-foreground mt-1">
                {list.error instanceof Error ? list.error.message : 'Something went wrong.'}
              </p>
            </div>
            <Button onClick={() => void list.refetch()} size="sm" variant="outline">
              Try again
            </Button>
          </PanelNote>
        ) : rows.length === 0 ? (
          <PanelNote>
            <div>
              <p className="text-foreground font-medium">
                {search || filter !== 'ALL' ? 'Nothing matches that.' : 'No invoices yet.'}
              </p>
              <p className="mt-1">
                {search || filter !== 'ALL'
                  ? 'Try a different filter.'
                  : 'The first one starts with a client and a line.'}
              </p>
            </div>
          </PanelNote>
        ) : (
          rows.map((row) => <Row key={row.id} row={row} />)
        )}
      </Panel>
    </AdminPage>
  )
}
