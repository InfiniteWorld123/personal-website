import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { AlertTriangle, Plus, Search, Users } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import {
  SETTLEMENT_CLASS,
  SETTLEMENT_WEIGHT,
  day,
  lateLabel,
  money,
  monthName,
} from '#/frontend/features/invoices/invoice-format'
import { invoicesQuery, sellerQuery } from '#/frontend/features/invoices/invoice-queries'
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
  { value: 'OPEN', label: 'Sent' },
  { value: 'PART', label: 'Part paid' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'PAID', label: 'Paid' },
]

/**
 * The figures.
 *
 * Six cards, which is what his answers came to: the five he picked from the
 * list plus the tax estimate he switched on. Three of them carry a second line
 * saying what the number actually counts — because "this month" and "recurring"
 * are the two that a person could otherwise read as meaning something they do
 * not.
 */
function Figures({ summary }: { summary: InvoiceSummary }) {
  const cards = [
    {
      key: 'overdue',
      label: 'Overdue',
      value: money(summary.overdueCents, summary.currency),
      note:
        summary.overdueCount === 0
          ? 'Nothing is late'
          : `${summary.overdueCount} ${summary.overdueCount === 1 ? 'invoice' : 'invoices'}`,
      tone: summary.overdueCents > 0 ? 'bad' : 'plain',
    },
    {
      key: 'open',
      label: 'Not paid yet',
      value: money(summary.openCents, summary.currency),
      note: 'Sent, still owed',
      tone: 'plain',
    },
    {
      key: 'count',
      label: 'Open invoices',
      value: String(summary.openCount),
      note: summary.openCount === 0 ? 'All settled' : 'Waiting on a client',
      tone: 'plain',
    },
    {
      key: 'month',
      label: `Arrived in ${monthName(summary.month)}`,
      value: money(summary.thisMonthCents, summary.currency),
      // Named rather than implied. It is counted by the day the money landed,
      // which is also how his own tax return counts it.
      note: 'By the day it reached the bank',
      tone: 'plain',
    },
    {
      key: 'mrr',
      label: 'Every month',
      value: money(summary.recurringCents, summary.currency),
      note: 'Subscriptions only — no build money',
      tone: 'accent',
    },
    {
      key: 'tax',
      label: 'Put aside for tax',
      value: money(summary.taxPotCents, summary.currency),
      // Said on the card itself, because a figure that looks like advice and
      // is not is the one thing this admin must never do.
      note: '30 % of what arrived — an estimate, not advice',
      tone: 'warn',
    },
  ] as const

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.key}
          className={cn(
            'rounded-xl border p-3',
            card.tone === 'bad' && 'border-rose-500/40 bg-rose-500/5',
            card.tone === 'accent' && 'border-primary/40 bg-primary/5',
            card.tone === 'warn' && 'border-amber-500/40 bg-amber-500/5',
            card.tone === 'plain' && 'border-border bg-card',
          )}
        >
          <p className="text-muted-foreground text-xs">{card.label}</p>
          <p
            className={cn(
              'tabular mt-0.5 text-xl font-semibold',
              card.tone === 'bad' && 'text-rose-600 dark:text-rose-400',
              card.tone === 'accent' && 'text-primary',
              card.tone === 'warn' && 'text-amber-700 dark:text-amber-400',
            )}
          >
            {card.value}
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">{card.note}</p>
        </div>
      ))}
    </div>
  )
}

function Row({ row }: { row: InvoiceRow }) {
  const owed = row.totalCents - row.paidCents

  return (
    <Link
      to="/admin/invoices/$invoiceId"
      params={{ invoiceId: row.id }}
      className="hover:bg-muted/60 flex items-center gap-3 border-b px-3 py-3 transition-colors last:border-b-0"
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
        <span className="tabular block text-sm font-semibold">{money(row.totalCents, row.currency)}</span>
        {row.paidCents > 0 && owed > 0 ? (
          <span className="tabular text-muted-foreground block text-[11px]">
            {money(owed, row.currency)} left
          </span>
        ) : null}
      </span>
    </Link>
  )
}

export function InvoicesPage() {
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
    <div className="flex w-full flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>

        <div className="ms-auto flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/invoices/clients">
              <Users className="size-4" /> Clients
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/admin/invoices/new">
              <Plus className="size-4" /> New invoice
            </Link>
          </Button>
        </div>
      </header>

      {/*
        Said before he starts, not when he presses Issue.
        `seller.ts` still holding placeholders means no invoice can go out, and
        finding that out at the last step — after writing the whole document —
        is the kind of small cruelty this admin is supposed to avoid.
      */}
      {seller.data && !seller.data.ready ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
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
        </div>
      ) : null}

      {list.data ? <Figures summary={list.data.summary} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Client, number, or a line"
            className="ps-8"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                filter === option.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/50',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        {list.isPending ? (
          <p className="text-muted-foreground p-6 text-sm">Loading…</p>
        ) : list.isError ? (
          /*
            Said, rather than shown as an empty list.
            A failed request and "you have no invoices" look identical to a
            person, and on a money screen the wrong one of those is the kind of
            quiet lie this admin exists not to tell.
          */
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
              The invoices could not be loaded.
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {list.error instanceof Error ? list.error.message : 'Something went wrong.'}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void list.refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium">
              {search || filter !== 'ALL' ? 'Nothing matches that.' : 'No invoices yet.'}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {search || filter !== 'ALL'
                ? 'Try a different filter.'
                : 'The first one starts with a client and a line.'}
            </p>
          </div>
        ) : (
          rows.map((row) => <Row key={row.id} row={row} />)
        )}
      </div>
    </div>
  )
}
