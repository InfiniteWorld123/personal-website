import { Building2, ChevronLeft, ChevronRight, User } from 'lucide-react'
import type { ClientKind, ClientStatus } from '#/backend2/contracts/client.contract'
import { StatusChip } from '#/frontend/dashboard/primitives'
import { initialsOf } from '#/frontend/features/clients/client-form'
import { cn } from '#/frontend/lib/utils'

/**
 * The small pieces every Clients screen shares. Approved in the Clients
 * Design Lab (23 Sep 2026): a Company is marked in blue with a building, a
 * Person in grey; Inactive is an outline, never a colour alone.
 */

export function KindChip({ kind }: { kind: ClientKind }) {
  return kind === 'company' ? (
    <StatusChip tone="blue">
      <Building2 className="size-3.5" aria-hidden="true" />
      Company
    </StatusChip>
  ) : (
    <StatusChip tone="grey">
      <User className="size-3.5" aria-hidden="true" />
      Person
    </StatusChip>
  )
}

export function StateChip({ status }: { status: ClientStatus }) {
  return status === 'inactive' ? <StatusChip tone="outline">Inactive</StatusChip> : null
}

export function ClientMark({ kind, name, size = 'md' }: { kind: ClientKind; name: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center font-bold',
        size === 'lg' ? 'size-[46px] rounded-[12px] text-[14px]' : 'size-8 rounded-[9px] text-[11px]',
        kind === 'company' ? 'dash-tone-blue rounded-[7px]' : 'dash-tone-grey',
      )}
    >
      {initialsOf(name)}
    </span>
  )
}

export function RowSkeleton() {
  return (
    <li className="flex items-center gap-3.5 border-t border-[var(--dash-soft)] px-4 py-3 first:border-0 sm:px-5">
      <span className="dash-skeleton size-8 shrink-0 rounded-[9px]" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="dash-skeleton h-3.5 w-44 max-w-full rounded" />
        <span className="dash-skeleton h-2.5 w-28 max-w-full rounded" />
      </span>
      <span className="dash-skeleton hidden h-3 w-40 rounded md:block" />
      <span className="dash-skeleton h-5 w-16 rounded" />
    </li>
  )
}

export function LoadFailure({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 p-8">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="max-w-[52ch] text-[13px] text-[var(--dash-quiet)]">{message}</p>
      <button type="button" className="dash-btn dash-btn-quiet" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-3 p-8">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="max-w-[56ch] text-[13px] text-[var(--dash-quiet)]">{children}</p>
      {action}
    </div>
  )
}

/** Pages of a server-paginated list. The server clamps a page past the end. */
export function Pager({
  page,
  pageCount,
  total,
  noun,
  onPage,
}: {
  page: number
  pageCount: number
  total: number
  noun: [string, string]
  onPage: (page: number) => void
}) {
  if (pageCount <= 1) return null

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 text-[12px]">
      <span className="text-[var(--dash-quiet)]">
        Page <span className="dash-num font-semibold text-[var(--dash-ink)]">{page}</span> of{' '}
        <span className="dash-num font-semibold text-[var(--dash-ink)]">{pageCount}</span> ·{' '}
        <span className="dash-num font-semibold text-[var(--dash-ink)]">{total}</span> {total === 1 ? noun[0] : noun[1]}
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          className="dash-btn dash-btn-quiet h-8 text-[12px]"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Previous
        </button>
        <button
          type="button"
          className="dash-btn dash-btn-quiet h-8 text-[12px]"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </span>
    </nav>
  )
}
