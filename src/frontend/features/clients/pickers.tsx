import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { COUNTRIES, countryName, countryRank } from '#/backend2/contracts/country.contract'
import type { OwnerNiche } from '#/backend2/contracts/niche.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { cn } from '#/frontend/lib/utils'
import { useCreateNiche, useNiches } from './queries'

/**
 * The two searchable choices on a Client (and, later, a Lead): the country
 * from the one worldwide list, and a niche from the owner's own list.
 *
 * Both are ARIA comboboxes: type to narrow, arrows to move, Enter to choose,
 * Escape to close. What is stored is only ever a known value — a country code
 * or a niche id — never the text that was typed.
 */

type Option = { value: string; label: string; hint?: string }

function Combobox({
  id,
  value,
  selectedLabel,
  options,
  onQuery,
  onPick,
  invalid,
  describedBy,
  placeholder,
  emptyText,
  extra,
  busy,
  onBlur,
}: {
  id: string
  value: string
  selectedLabel: string
  options: Option[]
  onQuery: (text: string) => void
  onPick: (option: Option) => void
  invalid?: boolean
  describedBy?: string
  placeholder: string
  emptyText: string
  /** A last row that is an action, not a value — "Add “Salon”". */
  extra?: { label: string; run: () => void } | null
  busy?: boolean
  onBlur?: () => void
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(selectedLabel)
  const [active, setActive] = useState(0)
  const rows = extra ? options.length + 1 : options.length

  // A value set from outside (a reset, a reload) shows its own label.
  useEffect(() => {
    if (!open) setText(selectedLabel)
  }, [selectedLabel, open])

  const choose = (index: number) => {
    if (index < options.length) {
      const option = options[index]!
      onPick(option)
      setText(option.label)
      setOpen(false)
    } else if (extra) {
      extra.run()
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
        className="dash-field h-10 w-full px-3 text-[13px]"
        placeholder={placeholder}
        value={text}
        onFocus={(event) => {
          event.currentTarget.select()
          onQuery('')
          setActive(0)
          setOpen(true)
        }}
        onChange={(event) => {
          setText(event.target.value)
          onQuery(event.target.value)
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
            setText(selectedLabel)
          }
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false)
            setText(selectedLabel)
            onBlur?.()
          }, 120)
        }}
      />
      {busy ? (
        <Loader2
          className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-[var(--dash-quiet)]"
          aria-hidden="true"
        />
      ) : null}
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+4px)] z-30 max-h-60 overflow-y-auto rounded-[10px] border border-[var(--dash-line)] bg-[var(--dash-surface)] p-1 shadow-[var(--dash-shadow)]"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === value}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-3 rounded-[7px] px-2.5 py-2 text-[13px]',
                index === active && 'bg-[var(--dash-hover)]',
                option.value === value && 'font-semibold',
              )}
              onMouseDown={(event) => {
                event.preventDefault()
                choose(index)
              }}
              onMouseEnter={() => setActive(index)}
            >
              <span className="min-w-0 truncate">{option.label}</span>
              {option.hint ? (
                <span className="shrink-0 text-[11px] text-[var(--dash-quiet)]">{option.hint}</span>
              ) : null}
            </li>
          ))}
          {extra ? (
            <li
              id={`${listId}-${options.length}`}
              role="option"
              aria-selected={false}
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
              {extra.label}
            </li>
          ) : null}
          {options.length === 0 && !extra ? (
            <li className="px-2.5 py-2 text-[13px] text-[var(--dash-quiet)]" aria-disabled="true">
              {emptyText}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------- country */

export function CountryPicker({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  onBlur,
}: {
  id: string
  value: string
  onChange: (code: string) => void
  invalid?: boolean
  describedBy?: string
  onBlur?: () => void
}) {
  const [query, setQuery] = useState('')

  const options = useMemo(() => {
    // Best matches first; the list's own A–Z order breaks ties.
    const matches = COUNTRIES.map((country) => ({ country, rank: countryRank(country.code, query) }))
      .filter((entry): entry is { country: (typeof COUNTRIES)[number]; rank: number } => entry.rank !== null)
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => entry.country)

    return matches.slice(0, 60).map((country) => ({
      value: country.code,
      label: country.name,
      hint: country.code,
    }))
  }, [query])

  return (
    <Combobox
      id={id}
      value={value}
      selectedLabel={value ? countryName(value) : ''}
      options={options}
      onQuery={setQuery}
      onPick={(option) => onChange(option.value)}
      invalid={invalid}
      describedBy={describedBy}
      placeholder="Type to search — Germany, Deutschland, DE"
      emptyText="No country matches that"
      onBlur={onBlur}
    />
  )
}

/* ------------------------------------------------------------------ niche */

export function NichePicker({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id: string
  value: { id: string; name: string } | null
  onChange: (niche: { id: string; name: string } | null) => void
  invalid?: boolean
  describedBy?: string
}) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const create = useCreateNiche()

  useEffect(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setDebounced(query.trim()), 200)

    return () => window.clearTimeout(timer.current)
  }, [query])

  const niches = useNiches({ search: debounced, hidden: 'exclude', pageSize: 20 })
  const items: OwnerNiche[] = niches.data?.items ?? []
  const exact = items.some((niche) => niche.name.toLowerCase() === query.trim().toLowerCase())
  const typed = query.trim()

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Combobox
            id={id}
            value={value?.id ?? ''}
            selectedLabel={value?.name ?? ''}
            options={items.map((niche) => ({ value: niche.id, label: niche.name }))}
            onQuery={setQuery}
            onPick={(option) => onChange({ id: option.value, name: option.label })}
            invalid={invalid}
            describedBy={describedBy}
            placeholder="Salon, plumbers, roofers…"
            emptyText={niches.isPending ? 'Loading…' : 'No niches yet — type one to add it'}
            busy={create.isPending}
            extra={
              typed !== '' && !exact
                ? {
                    label: `Add “${typed}” as a niche`,
                    run: () => {
                      setFailure(null)
                      create.mutate(typed, {
                        onSuccess: (niche) => onChange({ id: niche.id, name: niche.name }),
                        onError: (error) =>
                          setFailure(
                            error instanceof ApiRequestError ? error.message : 'The niche could not be added.',
                          ),
                      })
                    },
                  }
                : null
            }
          />
        </div>
        {value ? (
          <button
            type="button"
            className="dash-btn dash-btn-ghost h-10 px-2.5"
            aria-label={`Remove the niche ${value.name}`}
            onClick={() => onChange(null)}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {failure ? (
        <span role="alert" className="text-[12px] text-[var(--dash-red-ink)]">
          {failure}
        </span>
      ) : null}
    </div>
  )
}
