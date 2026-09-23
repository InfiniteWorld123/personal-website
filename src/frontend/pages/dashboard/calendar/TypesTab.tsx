import { useState } from 'react'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  BOOKING_LANGUAGES,
  BOOKING_LIMITS,
  BOOKING_METHODS,
  type BookingMethod,
  type BookingType,
  type TypeTexts,
} from '#/backend2/contracts/booking.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { Panel, PanelHead, StatusChip } from '#/frontend/dashboard/primitives'
import { BlogDialog, ConfirmDialog, DialogActions, DialogAlert, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import { useCreateType, useDeleteType, usePatchType, useTypes } from '#/frontend/features/booking-v2/queries'
import { messageFromError, notify } from '#/frontend/lib/notify'
import { EmptyState, LoadFailure, Pager } from '../blog/blog-parts'
import { FieldError, LANGUAGE_NAMES, METHOD_WORDS } from './calendar-parts'

/**
 * Appointment types. Each has a name and short text in DE, EN and AR, a
 * duration, an optional buffer after it, how often start times are offered,
 * and which ways to meet it allows. It can be offered on the website only
 * once a visitor could read it in every language. Editing a type never
 * changes an appointment already booked.
 */

const emptyTexts = (): TypeTexts => ({ de: { name: '', description: '' }, en: { name: '', description: '' }, ar: { name: '', description: '' } })

function TypeDialog({ type, onClose }: { type: BookingType | null; onClose: () => void }) {
  const create = useCreateType()
  const patch = usePatchType()
  const [failure, setFailure] = useState<string | null>(null)

  const form = useForm({
    defaultValues: {
      slug: type?.slug ?? '',
      enabled: type?.enabled ?? false,
      durationMinutes: type?.durationMinutes ?? 30,
      bufferMinutes: type?.bufferMinutes ?? 0,
      slotStepMinutes: type?.slotStepMinutes ?? 30,
      methods: type?.methods ?? (['video'] as BookingMethod[]),
      texts: type?.texts ?? emptyTexts(),
    },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Record<string, string> = {}

        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/u.test(value.slug)) fields.slug = 'Use lowercase letters, numbers and single hyphens'
        if (!(value.durationMinutes >= 5 && value.durationMinutes <= 480)) fields.durationMinutes = 'Between 5 and 480 minutes'
        if (!(value.bufferMinutes >= 0 && value.bufferMinutes <= 240)) fields.bufferMinutes = 'Between 0 and 240 minutes'
        if (!(value.slotStepMinutes >= 5 && value.slotStepMinutes <= 240)) fields.slotStepMinutes = 'Between 5 and 240 minutes'
        if (value.methods.length === 0) fields.methods = 'Allow at least one way to meet'

        if (value.enabled) {
          for (const language of BOOKING_LANGUAGES) {
            if (value.texts[language].name.trim() === '') fields[`texts.${language}.name`] = `A visitor reading ${LANGUAGE_NAMES[language]} needs a name`
          }
        }

        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmitInvalid: () => window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-type-form] [aria-invalid="true"]')?.focus()),
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        if (type) await patch.mutateAsync({ id: type.id, ...value })
        else await create.mutateAsync(value)

        notify.success(type ? 'Type saved' : 'Type created')
        onClose()
      } catch (error) {
        setFailure(error instanceof ApiRequestError && error.code === 'CONFLICT' ? 'Another type already uses that web address.' : messageFromError(error))
      }
    },
  })

  const number = (name: 'durationMinutes' | 'bufferMinutes' | 'slotStepMinutes', label: string) => (
    <form.Field name={name}>
      {(field) => (
        <label className="flex flex-col gap-1 text-[12px] text-[var(--dash-quiet)]">
          {label}
          <input type="number" inputMode="numeric" className="dash-field h-9 px-2.5 text-[13px] text-[var(--dash-ink)]" value={field.state.value} aria-invalid={field.state.meta.errors.length > 0} aria-describedby={`${name}-err`} onChange={(event) => field.handleChange(Number(event.target.value))} />
          <FieldError id={`${name}-err`} error={field.state.meta.errors[0]} />
        </label>
      )}
    </form.Field>
  )

  return (
    <BlogDialog labelledBy="type-title" size="lg" onClose={onClose}>
      <DialogTitle id="type-title">{type ? 'Edit appointment type' : 'New appointment type'}</DialogTitle>
      <form
        noValidate
        data-type-form
        className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pe-1"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {BOOKING_LANGUAGES.map((language) => (
            <fieldset key={language} className="flex flex-col gap-2 rounded-[10px] border border-[var(--dash-line)] p-3 sm:col-span-1" dir={language === 'ar' ? 'rtl' : 'ltr'}>
              <legend className="px-1 text-[12px] font-semibold">{LANGUAGE_NAMES[language]}</legend>
              <form.Field name={`texts.${language}.name`}>
                {(field) => (
                  <label className="flex flex-col gap-1 text-[12px] text-[var(--dash-quiet)]">
                    Name
                    <input maxLength={BOOKING_LIMITS.typeName} className="dash-field h-9 px-2.5 text-[13px] text-[var(--dash-ink)]" value={field.state.value} aria-invalid={field.state.meta.errors.length > 0} aria-describedby={`${language}-name-err`} onChange={(event) => field.handleChange(event.target.value)} />
                    <FieldError id={`${language}-name-err`} error={field.state.meta.errors[0]} />
                  </label>
                )}
              </form.Field>
              <form.Field name={`texts.${language}.description`}>
                {(field) => (
                  <label className="flex flex-col gap-1 text-[12px] text-[var(--dash-quiet)]">
                    Short text (optional)
                    <textarea rows={2} maxLength={BOOKING_LIMITS.typeDescription} className="dash-field px-2.5 py-2 text-[13px] text-[var(--dash-ink)]" value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} />
                  </label>
                )}
              </form.Field>
            </fieldset>
          ))}

          <div className="flex flex-col gap-2.5">
            <form.Field name="slug">
              {(field) => (
                <label className="flex flex-col gap-1 text-[12px] text-[var(--dash-quiet)]">
                  Web address
                  <input dir="ltr" className="dash-field h-9 px-2.5 text-[13px] text-[var(--dash-ink)]" placeholder="intro-call" value={field.state.value} aria-invalid={field.state.meta.errors.length > 0} aria-describedby="slug-err" onChange={(event) => field.handleChange(event.target.value.toLowerCase())} />
                  <FieldError id="slug-err" error={field.state.meta.errors[0]} />
                </label>
              )}
            </form.Field>
            <div className="grid grid-cols-3 gap-2">
              {number('durationMinutes', 'Minutes')}
              {number('bufferMinutes', 'Buffer after')}
              {number('slotStepMinutes', 'Starts every')}
            </div>
            <form.Field name="methods">
              {(field) => (
                <fieldset className="flex flex-col gap-1.5" aria-describedby="methods-err">
                  <legend className="text-[12px] text-[var(--dash-quiet)]">Ways to meet</legend>
                  <div className="flex flex-wrap gap-3">
                    {BOOKING_METHODS.map((method) => (
                      <label key={method} className="inline-flex items-center gap-1.5 text-[13px]">
                        <input
                          type="checkbox"
                          checked={field.state.value.includes(method)}
                          aria-invalid={field.state.meta.errors.length > 0}
                          onChange={(event) =>
                            field.handleChange(event.target.checked ? [...field.state.value, method] : field.state.value.filter((item) => item !== method))
                          }
                        />
                        {METHOD_WORDS[method]}
                      </label>
                    ))}
                  </div>
                  <FieldError id="methods-err" error={field.state.meta.errors[0]} />
                </fieldset>
              )}
            </form.Field>
            <form.Field name="enabled">
              {(field) => (
                <label className="inline-flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={field.state.value} onChange={(event) => field.handleChange(event.target.checked)} />
                  Offer it on the website
                </label>
              )}
            </form.Field>
          </div>
        </div>

        {failure ? <DialogAlert>{failure}</DialogAlert> : null}
        <DialogActions>
          <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>Cancel</button>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(submitting) => (
              <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {type ? 'Save type' : 'Create type'}
              </button>
            )}
          </form.Subscribe>
        </DialogActions>
      </form>
    </BlogDialog>
  )
}

export function TypesTab() {
  const [page, setPage] = useState(1)
  const types = useTypes(page, 25)
  const remove = useDeleteType()
  const [editing, setEditing] = useState<BookingType | 'new' | null>(null)
  const [deleting, setDeleting] = useState<BookingType | null>(null)

  return (
    <Panel>
      <PanelHead
        title="Appointment types"
        count={types.data?.total}
        action={
          <button type="button" className="dash-btn dash-btn-primary h-9" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden="true" /> New type
          </button>
        }
      />
      {types.isPending ? (
        <div className="px-5 pb-5"><span className="dash-skeleton block h-24 rounded" /></div>
      ) : types.isError ? (
        <LoadFailure title="Types could not load" message={messageFromError(types.error)} onRetry={() => void types.refetch()} />
      ) : types.data.items.length === 0 ? (
        <EmptyState title="No appointment types yet" action={<button type="button" className="dash-btn dash-btn-quiet" onClick={() => setEditing('new')}>Create the first type</button>}>
          A type is what a visitor books — for example a 30-minute intro call by video, in person or by phone.
        </EmptyState>
      ) : (
        <ul>
          {types.data.items.map((type) => (
            <li key={type.id} className="flex flex-wrap items-center gap-3 border-t border-[var(--dash-line)] px-5 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold">{type.texts.en.name || type.slug}</span>
                <span className="block text-[12px] text-[var(--dash-quiet)]">
                  {type.durationMinutes} min · {type.methods.map((method) => METHOD_WORDS[method]).join(', ')}
                  {type.bufferMinutes ? ` · buffer ${type.bufferMinutes} min` : ''} · starts every {type.slotStepMinutes} min
                </span>
              </span>
              {type.upcomingCount ? <StatusChip tone="grey">{type.upcomingCount} upcoming</StatusChip> : null}
              {type.enabled ? (
                <StatusChip tone="blue">On website</StatusChip>
              ) : (
                <StatusChip tone="outline">{type.enableBlockers[0] ? `Hidden — ${type.enableBlockers[0].toLowerCase()}` : 'Hidden'}</StatusChip>
              )}
              <button type="button" className="dash-btn dash-btn-ghost h-8 px-2" aria-label={`Edit ${type.texts.en.name || type.slug}`} onClick={() => setEditing(type)}>
                <Pencil className="size-3.5" aria-hidden="true" />
              </button>
              <button type="button" className="dash-btn dash-btn-ghost h-8 px-2 text-[var(--dash-red-ink)]" aria-label={`Delete ${type.texts.en.name || type.slug}`} onClick={() => setDeleting(type)}>
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {types.data ? <div className="px-5 py-3"><Pager page={types.data.page} pageCount={types.data.pageCount} onPage={setPage} /></div> : null}

      {editing ? <TypeDialog type={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete “${deleting.texts.en.name || deleting.slug}”?`}
          confirmLabel="Delete type"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await remove.mutateAsync(deleting.id)
            } catch (error) {
              if (error instanceof ApiRequestError && error.code === 'TYPE_IN_USE') {
                throw new Error('This type still has upcoming appointments. Switch it off instead, or move them first.')
              }

              throw error
            }

            setDeleting(null)
            notify.success('Type deleted')
          }}
        >
          <p>Appointments already booked keep their own copy of its name and length.</p>
        </ConfirmDialog>
      ) : null}
    </Panel>
  )
}
