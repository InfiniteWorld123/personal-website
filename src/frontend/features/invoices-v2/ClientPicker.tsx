import { useEffect, useId, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import type { OwnerClientListItem } from '#/backend2/contracts/client.contract'
import { useClients } from '#/frontend/features/clients/queries'
import { cn } from '#/frontend/lib/utils'

/**
 * Who an invoice or subscription is for: a search over the Client directory,
 * eight at a time from the server, with "New client" as the last row. What is
 * stored is only ever a Client id — never the typed text — because every
 * invoice belongs to a Client (`docs/v2/invoices.md`).
 *
 * An ARIA combobox: type to narrow, arrows to move, Enter to choose, Escape
 * to close.
 */
export function ClientPicker({
  id,
  onPick,
  onCreate,
  invalid,
  describedBy,
  autoFocus,
}: {
  id: string
  onPick: (client: OwnerClientListItem) => void
  onCreate?: (typed: string) => void
  invalid?: boolean
  describedBy?: string
  autoFocus?: boolean
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(text.trim()), 200)

    return () => window.clearTimeout(timer)
  }, [text])

  const clients = useClients({ search: debounced, pageSize: 8, status: 'all' })
  const options = clients.data?.items ?? []
  const rows = options.length + (onCreate ? 1 : 0)

  const choose = (index: number) => {
    if (index < options.length) {
      onPick(options[index]!)
      setOpen(false)
    } else if (onCreate) {
      onCreate(text.trim())
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && rows > 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        autoFocus={autoFocus}
        className="dash-field h-10 w-full px-3 text-[13px]"
        placeholder="Search your clients by name, company or email"
        value={text}
        onFocus={() => {
          setActive(0)
          setOpen(true)
        }}
        onChange={(event) => {
          setText(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) return setOpen(true)
            if (rows === 0) return
            setActive((current) => (current + (event.key === 'ArrowDown' ? 1 : -1) + rows) % rows)
          } else if (event.key === 'Enter' && open) {
            event.preventDefault()
            if (rows > 0) choose(active)
          } else if (event.key === 'Escape' && open) {
            event.stopPropagation()
            setOpen(false)
          }
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {clients.isFetching ? (
        <Loader2
          className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-[var(--dash-quiet)]"
          aria-hidden="true"
        />
      ) : null}
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Clients"
          className="absolute inset-x-0 top-[calc(100%+4px)] z-30 max-h-72 overflow-y-auto rounded-[10px] border border-[var(--dash-line)] bg-[var(--dash-surface)] p-1 shadow-[var(--dash-shadow)]"
        >
          {options.map((client, index) => (
            <li
              key={client.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-3 rounded-[7px] px-2.5 py-2 text-[13px]',
                index === active && 'bg-[var(--dash-hover)]',
              )}
              onMouseDown={(event) => {
                event.preventDefault()
                choose(index)
              }}
              onMouseEnter={() => setActive(index)}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{client.displayName}</span>
                <span className="block truncate text-[12px] text-[var(--dash-quiet)]">
                  {[client.kind === 'company' ? client.name : client.companyName, client.email].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="shrink-0 text-[11px] text-[var(--dash-quiet)]">
                {client.status === 'inactive' ? 'Inactive · ' : ''}
                {client.country.name}
              </span>
            </li>
          ))}
          {clients.isError ? (
            <li className="px-2.5 py-2 text-[13px] text-[var(--dash-red-ink)]" aria-disabled="true">
              Clients could not be loaded. Type again to retry.
            </li>
          ) : options.length === 0 && !clients.isFetching ? (
            <li className="px-2.5 py-2 text-[13px] text-[var(--dash-quiet)]" aria-disabled="true">
              {debounced ? 'No client matches that.' : 'No clients yet.'}
            </li>
          ) : null}
          {onCreate ? (
            <li
              id={`${listId}-${options.length}`}
              role="option"
              aria-selected={active === options.length}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-[7px] px-2.5 py-2 text-[13px] font-semibold text-[var(--dash-blue-ink)]',
                active === options.length && 'bg-[var(--dash-hover)]',
              )}
              onMouseDown={(event) => {
                event.preventDefault()
                choose(options.length)
              }}
              onMouseEnter={() => setActive(options.length)}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              {text.trim() ? `New client “${text.trim()}”` : 'New client'}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
