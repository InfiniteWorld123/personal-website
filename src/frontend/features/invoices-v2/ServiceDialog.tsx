import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import type { OwnerServiceListItem } from '#/backend2/contracts/service.contract'
import { BlogDialog, DialogActions, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import { priceSummary } from '#/frontend/features/services/service-form'
import { useServices } from '#/frontend/features/services/queries'
import { Pager } from '#/frontend/pages/dashboard/clients/client-parts'

/**
 * "From a service": the owner's catalogue, searched and paged by the server.
 * The name and today's price are copied in once — Services stays independent,
 * and a later catalogue edit never changes this invoice or subscription
 * (`docs/v2/invoices.md`). The owner can still change both afterwards.
 */
export function ServiceDialog({
  title = 'Add from a service',
  onPick,
  onClose,
  period,
}: {
  title?: string
  onPick: (service: OwnerServiceListItem) => void
  onClose: () => void
  /** Subscriptions offer monthly and yearly services first. */
  period?: 'recurring'
}) {
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState<string | null>(null)
  const services = useServices({ search, page, pageSize: 8 })

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(text.trim())
      setPage(1)
    }, 200)

    return () => window.clearTimeout(timer)
  }, [text])

  const items = [...(services.data?.items ?? [])].sort((a, b) =>
    period === 'recurring'
      ? Number(b.price.period === 'monthly' || b.price.period === 'yearly') -
        Number(a.price.period === 'monthly' || a.price.period === 'yearly')
      : 0,
  )
  const chosen = items.find((item) => item.id === picked)

  return (
    <BlogDialog labelledBy="service-title" describedBy="service-text" onClose={onClose}>
      <DialogTitle id="service-title">{title}</DialogTitle>
      <p id="service-text" className="text-[13px] text-[var(--dash-quiet)]">
        The name and today’s price are copied in. You can still change them here; later changes to the service do not
        touch this.
      </p>
      <label className="relative">
        <span className="sr-only">Search services</span>
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--dash-quiet)]"
          aria-hidden="true"
        />
        <input
          className="dash-field h-9 w-full ps-9 pe-3 text-[13px]"
          placeholder="Search services"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <div role="radiogroup" aria-label="Services" className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
        {services.isError ? (
          <p role="alert" className="text-[13px] text-[var(--dash-red-ink)]">
            Services could not be loaded.{' '}
            <button type="button" className="font-semibold underline" onClick={() => void services.refetch()}>
              Try again
            </button>
          </p>
        ) : services.isPending ? (
          <span className="dash-skeleton h-12 w-full rounded-lg" />
        ) : items.length === 0 ? (
          <p className="text-[13px] text-[var(--dash-quiet)]">
            {search ? 'No service matches that.' : 'No services yet. Add a line by hand instead.'}
          </p>
        ) : (
          items.map((service) => (
            <label key={service.id} className="inv-choice">
              <input
                type="radio"
                name="service"
                value={service.id}
                checked={picked === service.id}
                onChange={() => setPicked(service.id)}
              />
              <span className="min-w-0">
                <b className="block truncate">{service.displayName || 'Untitled service'}</b>
                <small className="block text-[12px] text-[var(--dash-quiet)]">
                  {priceSummary(service.price)}
                  {service.state === 'draft' ? ' · not on the website' : ''}
                </small>
              </span>
            </label>
          ))
        )}
      </div>
      {services.data ? (
        <Pager
          page={services.data.page}
          pageCount={services.data.pageCount}
          total={services.data.total}
          noun={['service', 'services']}
          onPage={setPage}
        />
      ) : null}
      <DialogActions>
        <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="dash-btn dash-btn-primary"
          disabled={!chosen}
          onClick={() => {
            if (chosen) onPick(chosen)
          }}
        >
          Use this service
        </button>
      </DialogActions>
    </BlogDialog>
  )
}
