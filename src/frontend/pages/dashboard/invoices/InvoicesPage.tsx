import { useState } from 'react'
import { money } from '#/frontend/dashboard/format'
import {
  DashboardPage,
  NotSpecifiedBadge,
  PageHead,
  Panel,
  SampleBadge,
  StatusChip,
} from '#/frontend/dashboard/primitives'
import { sampleInvoices } from '#/frontend/dashboard/sample-data'
import { cn } from '#/frontend/lib/utils'

type Filter = 'all' | 'open' | 'overdue' | 'paid'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
]

/**
 * What has been billed, what has been paid, and what is late.
 *
 * The filter is real — it narrows the rows and the total follows them — and
 * that is the whole of it. Issuing, sending, reminding, crediting and every
 * legal rule around a German invoice belong to a specification that does not
 * exist yet, so no button here claims to do any of them.
 *
 * The total is summed from the rows on screen and nowhere else. It is the one
 * arithmetic this page does, and it is visible: filter to Overdue and the
 * figure has to match the Overview's overdue card, or one of them is wrong.
 */
export function InvoicesPage() {
  const [filter, setFilter] = useState<Filter>('all')

  const rows = filter === 'all' ? sampleInvoices : sampleInvoices.filter((row) => row.group === filter)
  const total = rows.reduce((sum, row) => sum + row.cents, 0)

  const countFor = (value: Filter) =>
    value === 'all' ? sampleInvoices.length : sampleInvoices.filter((row) => row.group === value).length

  return (
    <DashboardPage>
      <PageHead
        eyebrow="INVOICES"
        title="Invoices"
        description="What you have billed, what has been paid, and what is late."
        aside={<SampleBadge />}
        actions={<NotSpecifiedBadge />}
        className="dash-rise dash-rise-1"
      />

      <div
        role="tablist"
        aria-label="Filter invoices"
        className="dash-rise dash-rise-2 mt-5 flex w-fit gap-1 rounded-[10px] p-1"
        style={{ background: 'var(--dash-chip)' }}
      >
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={filter === option.value}
            data-on={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={cn('dash-seg h-[30px] rounded-[7px] px-3.5 text-xs text-[var(--dash-quiet)]')}
          >
            {option.label} {countFor(option.value)}
          </button>
        ))}
      </div>

      <Panel className="dash-rise dash-rise-3 mt-4 overflow-hidden">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Invoices, filtered by {FILTERS.find((option) => option.value === filter)?.label}
          </caption>
          <thead>
            <tr className="border-b border-[var(--dash-line)] bg-[var(--dash-furniture)] text-[11px] font-bold tracking-[0.1em] text-[var(--dash-quiet)]">
              <th scope="col" className="px-5 py-3">CLIENT</th>
              <th scope="col" className="hidden px-3 py-3 sm:table-cell">INVOICE</th>
              <th scope="col" className="hidden px-3 py-3 lg:table-cell">ISSUED</th>
              <th scope="col" className="hidden px-3 py-3 md:table-cell">DUE</th>
              <th scope="col" className="px-3 py-3">STATUS</th>
              <th scope="col" className="px-5 py-3 text-right">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="dash-row border-b border-[var(--dash-soft)]">
                <th scope="row" className="px-5 py-4 text-[13px] font-semibold">
                  {row.client}
                </th>
                <td className="dash-num hidden px-3 py-4 text-xs text-[var(--dash-quiet)] sm:table-cell">
                  {row.number}
                </td>
                <td className="dash-num hidden px-3 py-4 text-xs text-[var(--dash-quiet)] lg:table-cell">
                  {row.issued}
                </td>
                <td className="dash-num hidden px-3 py-4 text-xs text-[var(--dash-quiet)] md:table-cell">
                  {row.due}
                </td>
                <td className="px-3 py-4">
                  <StatusChip tone={row.tone}>{row.status}</StatusChip>
                </td>
                <td className="dash-num px-5 py-4 text-right text-sm font-semibold">
                  {money(row.cents)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[var(--dash-furniture)]">
              <td colSpan={4} className="px-5 py-3.5 text-xs text-[var(--dash-quiet)]">
                {filter === 'all'
                  ? 'Every invoice issued this month'
                  : 'Filtered — choose All to see the rest'}
              </td>
              <td className="px-3 py-3.5 text-right text-xs text-[var(--dash-quiet)]">Total</td>
              <td className="dash-num px-5 py-3.5 text-right text-[15px] font-semibold">
                {money(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </Panel>
    </DashboardPage>
  )
}
