import { useEffect, useState } from 'react'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import { Eye, EyeOff, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { NICHE_LIMITS, type OwnerNiche } from '#/backend2/contracts/niche.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { StatusChip } from '#/frontend/dashboard/primitives'
import { BlogDialog, DialogActions, DialogAlert, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import { useCreateNiche, useDeleteNiche, useNiches, usePatchNiche } from '#/frontend/features/clients/queries'
import { notify } from '#/frontend/lib/notify'
import { Pager } from './client-parts'

/**
 * The owner's niche list — salon, plumbers, roofers — shared by Clients and
 * Leads. Added on the owner's request, 23 Sep 2026.
 *
 * A niche can be added, renamed (every record shows the new name at once),
 * hidden from new choices, or deleted while nothing uses it.
 */

const nameError = (name: string): string | undefined => {
  const trimmed = name.trim()

  if (trimmed === '') return 'Enter a name for the niche'
  if (trimmed.length > NICHE_LIMITS.name) return `Keep it under ${NICHE_LIMITS.name} characters`

  return undefined
}

/** One name field, for adding and for renaming. */
function NameForm({
  id,
  initial,
  submitLabel,
  onSave,
  onCancel,
}: {
  id: string
  initial: string
  submitLabel: string
  onSave: (name: string) => Promise<void>
  onCancel?: () => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { name: initial },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const error = nameError(value.name)

        return error ? { fields: { name: error } } : undefined
      },
    },
    onSubmitInvalid: () => document.getElementById(id)?.focus(),
    onSubmit: async ({ value, formApi }) => {
      setServerError(null)

      try {
        await onSave(value.name.trim())
        if (!onCancel) formApi.reset({ name: '' })
      } catch (caught) {
        setServerError(caught instanceof ApiRequestError ? caught.message : 'That did not save. Try again.')
        document.getElementById(id)?.focus()
      }
    },
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {(field) => {
          const error = (field.state.meta.errors[0] as string | undefined) ?? serverError ?? undefined

          return (
            <>
              <div className="flex items-center gap-2">
                <label htmlFor={id} className="sr-only">
                  Niche name
                </label>
                <input
                  id={id}
                  className="dash-field h-9 min-w-0 flex-1 px-3 text-[13px]"
                  placeholder="Salon, plumbers, roofers…"
                  value={field.state.value}
                  autoFocus={Boolean(onCancel)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  onChange={(event) => {
                    setServerError(null)
                    field.handleChange(event.target.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && onCancel) {
                      event.stopPropagation()
                      onCancel()
                    }
                  }}
                />
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(submitting) => (
                    <button type="submit" className="dash-btn dash-btn-quiet h-9 text-[12.5px]" disabled={submitting}>
                      {submitting ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : onCancel ? null : (
                        <Plus className="size-3.5" aria-hidden="true" />
                      )}
                      {submitLabel}
                    </button>
                  )}
                </form.Subscribe>
                {onCancel ? (
                  <button type="button" className="dash-btn dash-btn-ghost h-9 text-[12.5px]" onClick={onCancel}>
                    Cancel
                  </button>
                ) : null}
              </div>
              {error ? (
                <span id={`${id}-error`} className="text-[12px] text-[var(--dash-red-ink)]">
                  {error}
                </span>
              ) : null}
            </>
          )
        }}
      </form.Field>
    </form>
  )
}

function NicheRow({ niche }: { niche: OwnerNiche }) {
  const patch = usePatchNiche()
  const remove = useDeleteNiche()
  const [renaming, setRenaming] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  if (renaming) {
    return (
      <li className="border-t border-[var(--dash-soft)] px-1 py-2.5 first:border-0">
        <NameForm
          id={`niche-rename-${niche.id}`}
          initial={niche.name}
          submitLabel="Save"
          onCancel={() => setRenaming(false)}
          onSave={async (name) => {
            await patch.mutateAsync({ id: niche.id, name })
            notify.success('Niche renamed everywhere')
            setRenaming(false)
          }}
        />
      </li>
    )
  }

  return (
    <li className="flex flex-col gap-1.5 border-t border-[var(--dash-soft)] px-1 py-2.5 first:border-0">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{niche.name}</span>
          <span className="text-[11.5px] text-[var(--dash-quiet)]">
            {niche.clientCount === 0
              ? 'Not used yet'
              : `${niche.clientCount} ${niche.clientCount === 1 ? 'client' : 'clients'}`}
          </span>
        </span>
        {niche.hidden ? <StatusChip tone="outline">Hidden</StatusChip> : null}
        <button
          type="button"
          className="dash-btn dash-btn-ghost h-8 px-2"
          aria-label={`Rename ${niche.name}`}
          onClick={() => setRenaming(true)}
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="dash-btn dash-btn-ghost h-8 px-2"
          aria-label={niche.hidden ? `Show ${niche.name} in choices again` : `Hide ${niche.name} from new choices`}
          title={niche.hidden ? 'Show in choices again' : 'Hide from new choices'}
          disabled={patch.isPending}
          onClick={() =>
            patch.mutate({ id: niche.id, hidden: !niche.hidden }, { onError: (error) => setFailure(error.message) })
          }
        >
          {niche.hidden ? (
            <Eye className="size-3.5" aria-hidden="true" />
          ) : (
            <EyeOff className="size-3.5" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="dash-btn dash-btn-ghost h-8 px-2"
          aria-label={`Delete ${niche.name}`}
          title={niche.clientCount > 0 ? 'In use — hide it instead' : 'Delete'}
          disabled={remove.isPending || niche.clientCount > 0}
          onClick={() =>
            remove.mutate(niche.id, {
              onSuccess: () => notify.success(`${niche.name} deleted`),
              onError: (error) => setFailure(error.message),
            })
          }
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {failure ? (
        <span role="alert" className="text-[12px] text-[var(--dash-red-ink)]">
          {failure}
        </span>
      ) : null}
    </li>
  )
}

export function NicheManager({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const create = useCreateNiche()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search.trim())
      setPage(1)
    }, 200)

    return () => window.clearTimeout(timer)
  }, [search])

  const niches = useNiches({ page, pageSize: 20, search: debounced })

  return (
    <BlogDialog labelledBy="niches-title" describedBy="niches-lead" onClose={onClose}>
      <DialogTitle id="niches-title">Niches</DialogTitle>
      <p id="niches-lead" className="text-[13px] leading-relaxed text-[var(--dash-quiet)]">
        The kind of business a client or lead is in. Renaming changes it everywhere. Hiding keeps it on the clients that
        have it but takes it out of new choices. Only an unused niche can be deleted.
      </p>

      <NameForm
        id="niche-new"
        initial=""
        submitLabel="Add"
        onSave={async (name) => {
          await create.mutateAsync(name)
          notify.success(`${name} added`)
        }}
      />

      <label className="relative">
        <span className="sr-only">Search niches</span>
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--dash-quiet)]"
          aria-hidden="true"
        />
        <input
          className="dash-field h-9 w-full ps-9 pe-3 text-[13px]"
          placeholder="Search niches"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>

      {niches.isError ? (
        <DialogAlert>The niches could not be loaded. Close this and try again.</DialogAlert>
      ) : niches.isPending ? (
        <p className="text-[13px] text-[var(--dash-quiet)]" aria-busy="true">
          Loading…
        </p>
      ) : niches.data.items.length === 0 ? (
        <p className="text-[13px] text-[var(--dash-quiet)]">
          {debounced ? 'No niche matches that.' : 'No niches yet. Add the first one above.'}
        </p>
      ) : (
        <ul className="max-h-[22rem] overflow-y-auto">
          {niches.data.items.map((niche) => (
            <NicheRow key={niche.id} niche={niche} />
          ))}
        </ul>
      )}

      {niches.data ? (
        <Pager
          page={niches.data.page}
          pageCount={niches.data.pageCount}
          total={niches.data.total}
          noun={['niche', 'niches']}
          onPage={setPage}
        />
      ) : null}

      <DialogActions>
        <button type="button" className="dash-btn dash-btn-quiet" onClick={onClose}>
          Done
        </button>
      </DialogActions>
    </BlogDialog>
  )
}
