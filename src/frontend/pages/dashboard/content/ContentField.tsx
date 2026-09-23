import { useEffect, useId, useRef, useState } from 'react'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import { AlertTriangle, ArrowDown, ArrowUp, Check, Clock, Plus, RotateCcw, Trash2 } from 'lucide-react'
import {
  type ContentFieldState,
  type ContentLanguage,
  type ContentSlot,
  type ContentValue,
  checkContentValue,
  sameContentValue,
} from '#/backend2/contracts/content.contract'
import {
  LANGUAGE_NAME,
  asText,
  directionOf,
  fieldLabel,
  slotOf,
  whenText,
} from '#/frontend/features/content-v2/content-words'
import { contentStore, isUnsettled, slotKey, useLocalEntry } from '#/frontend/features/content-v2/content-store'
import { useContentHistory, useContentSaver, useMarkReviewed } from '#/frontend/features/content-v2/queries'
import { cn } from '#/frontend/lib/utils'

/**
 * One field of the website's static copy, in the language being edited.
 *
 * Content is the one module without a draft (`docs/v2/content.md`), so this is
 * where the care goes: nothing is sent per keystroke; leaving the field saves
 * the whole value, and "live" is said only after the server confirms it. A
 * failed or refused save keeps the owner's wording beside a way forward.
 *
 * Each field is its own small TanStack Form, with the repository's pattern:
 * leaving the field is the "submit", so an untouched field never shows an
 * error, and once a save was attempted the rule is checked again on every
 * change. The rule is `checkContentValue` — the very function the server runs.
 */

export type FieldPanel = 'original' | 'history' | null

type Props = {
  field: ContentFieldState
  language: ContentLanguage
  legalOpen: boolean
  initialPanel?: FieldPanel
}

const firstError = (errors: unknown): string | undefined => {
  const first = Array.isArray(errors) ? errors[0] : undefined

  return typeof first === 'string' ? first : undefined
}

/** For a list: which line an error belongs to, from the contract's own issue path. */
const errorLine = (field: ContentFieldState, value: string[]): number | undefined => {
  const checked = checkContentValue(field, value)
  if (checked.ok) return undefined

  const match = checked.issues[0]?.field.match(/^value\.(\d+)$/u)

  return match ? Number(match[1]) : undefined
}

export function ContentField({ field, language, legalOpen, initialPanel = null }: Props) {
  const slot: ContentSlot = slotOf(field, language)
  const id = slotKey(field.key, slot)
  const live = field.slots[slot]!
  const label = fieldLabel(field)
  const entry = useLocalEntry(id)
  const save = useContentSaver()
  const markReviewed = useMarkReviewed()
  const domId = useId().replace(/:/g, '')
  const locked = field.scope === 'legal' && !legalOpen
  const [panel, setPanel] = useState<FieldPanel>(initialPanel)
  /** A list line just added and not typed yet. It is never sent. */
  const [fresh, setFresh] = useState<number | null>(null)

  useEffect(() => contentStore.mount(id), [id])

  const startValue = (): ContentValue => {
    const kept = contentStore.get(id)
    return isUnsettled(kept) && kept?.value !== undefined ? kept.value : live.value
  }

  /** What would be sent: a list without its untouched new line. */
  const toSend = (value: ContentValue): ContentValue =>
    Array.isArray(value) && fresh !== null && (value[fresh] ?? '').trim() === ''
      ? value.filter((_, index) => index !== fresh)
      : value

  const form = useForm({
    defaultValues: { value: startValue() },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const checked = checkContentValue(field, toSend(value.value))

        return checked.ok ? undefined : { fields: { value: checked.issues[0]?.message ?? 'Not allowed' } }
      },
    },
    onSubmitInvalid: ({ value }) => {
      const checked = checkContentValue(field, toSend(value.value))

      contentStore.set(id, {
        status: 'invalid',
        value: value.value,
        error: checked.ok ? undefined : checked.issues[0]?.message,
        label,
      })
    },
    onSubmit: async ({ value }) => {
      const checked = checkContentValue(field, toSend(value.value))
      if (!checked.ok) return

      // Nothing new: the field simply settles, and no request is made.
      if (sameContentValue(checked.value, live.value)) {
        contentStore.set(id, undefined)
        if (!sameContentValue(value.value, live.value) && fresh === null) form.setFieldValue('value', live.value)
        return
      }

      if (fresh !== null && (value.value as string[])[fresh]?.trim() === '') {
        // The empty new line stays on screen, outside what is saved.
      } else setFresh(null)

      await save({ kind: 'edit', key: field.key, slot, label, value: checked.value, legalUnlocked: legalOpen })
    },
  })

  /* When the live value moves — a save from here, Original, history, another
     tab — the field follows it, unless the owner's own wording is waiting. */
  useEffect(() => {
    const kept = contentStore.get(id)
    if (isUnsettled(kept) || kept?.status === 'saving') return

    setFresh(null)
    form.reset({ value: live.value })
  }, [live.revision, live.value, id, form])

  const commit = () => {
    if (locked) return
    void form.handleSubmit()
  }

  const change = (value: ContentValue) => {
    form.setFieldValue('value', value)

    const kept = contentStore.get(id)
    if (kept?.status === 'failed' || kept?.status === 'conflict') {
      contentStore.set(id, { ...kept, value })
      return
    }

    const attempted = form.state.submissionAttempts > 0
    const checked = checkContentValue(field, toSend(value))
    const status = attempted && !checked.ok ? 'invalid' : 'dirty'

    contentStore.set(id, sameContentValue(value, live.value) && fresh === null ? undefined : {
      status,
      value,
      error: checked.ok ? undefined : checked.issues[0]?.message,
      label,
    })
  }

  const retry = () => {
    if (entry?.value === undefined) return
    void save({ kind: 'edit', key: field.key, slot, label, value: entry.value, legalUnlocked: legalOpen })
  }

  const discard = () => {
    contentStore.set(id, undefined)
    setFresh(null)
    form.reset({ value: live.value })
  }

  const edited = !live.isOriginal
  const guidance = field.guidance

  return (
    <div className="cv-fld" data-field={field.key}>
      <form.Field name="value">
        {(item) => {
          const error = firstError(item.state.meta.errors) ?? (entry?.status === 'invalid' ? entry.error : undefined)
          const value = item.state.value
          const inputId = `${domId}-input`
          const errorId = `${domId}-error`
          const badLine = Array.isArray(value) && error ? errorLine(field, toSend(value) as string[]) : undefined
          const direction = directionOf(slot === 'shared' ? 'en' : slot)
          const lang = slot === 'shared' ? 'en' : slot
          const unsettledLook = entry && ['dirty', 'failed', 'conflict'].includes(entry.status)

          return (
            <>
              <div className="cv-fld-top">
                <label className="cv-fld-label" id={`${domId}-label`} htmlFor={Array.isArray(value) ? `${inputId}-0` : inputId}>
                  {label}
                </label>
                {edited ? <span className="cv-chip cv-tone-blue">Edited</span> : null}
                {field.scope === 'seo' ? <span className="cv-chip cv-tone-grey">Google</span> : null}
                {field.shared ? <span className="cv-chip cv-tone-grey">All languages</span> : null}
                <span className="cv-fld-key" dir="ltr">{field.key}</span>
                <span className="cv-fld-tools">
                  {edited ? (
                    <button type="button" className="dash-btn dash-btn-ghost cv-xs" disabled={locked} aria-expanded={panel === 'original'} onClick={() => setPanel(panel === 'original' ? null : 'original')}>
                      <RotateCcw className="size-3.5" aria-hidden="true" /> Original
                    </button>
                  ) : null}
                  <button type="button" className="dash-btn dash-btn-ghost cv-xs" aria-expanded={panel === 'history'} onClick={() => setPanel(panel === 'history' ? null : 'history')}>
                    <Clock className="size-3.5" aria-hidden="true" /> History
                  </button>
                </span>
              </div>

              {Array.isArray(value) ? (
                <ListInput
                  field={field}
                  value={value}
                  inputId={inputId}
                  labelId={`${domId}-label`}
                  errorId={errorId}
                  badLine={badLine}
                  hasError={!!error}
                  fresh={fresh}
                  locked={locked}
                  direction={direction}
                  lang={lang}
                  dirty={!!unsettledLook}
                  onChange={(next) => change(next)}
                  onAdd={() => {
                    setFresh(value.length)
                    change([...value, ''])
                    window.requestAnimationFrame(() => document.getElementById(`${inputId}-${value.length}`)?.focus())
                  }}
                  onMove={(from, to) => {
                    const next = [...value]
                    ;[next[from], next[to]] = [next[to], next[from]]
                    if (fresh === from) setFresh(to)
                    else if (fresh === to) setFresh(from)
                    change(next)
                    window.setTimeout(commit, 0)
                  }}
                  onRemove={(at) => {
                    const next = value.filter((_, index) => index !== at)
                    if (fresh === at) setFresh(null)
                    else if (fresh !== null && fresh > at) setFresh(fresh - 1)
                    change(next)
                    window.setTimeout(commit, 0)
                  }}
                  onLeave={commit}
                />
              ) : field.kind === 'longText' ? (
                <textarea
                  id={inputId}
                  className={cn('dash-field cv-input', unsettledLook && 'cv-dirty')}
                  rows={Math.min(8, Math.max(2, Math.ceil(String(value).length / 70)))}
                  value={value}
                  dir={direction}
                  lang={lang}
                  readOnly={locked}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(event) => change(event.target.value)}
                  onBlur={commit}
                />
              ) : (
                <input
                  id={inputId}
                  className={cn('dash-field cv-input', unsettledLook && 'cv-dirty')}
                  value={value}
                  dir={direction}
                  lang={lang}
                  readOnly={locked}
                  inputMode={field.format === 'email' ? 'email' : field.format === 'url' ? 'url' : field.format === 'phone' ? 'tel' : undefined}
                  placeholder={field.format === 'phone' ? 'Not shown on the website while empty' : undefined}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(event) => change(event.target.value)}
                  onBlur={commit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      event.currentTarget.blur()
                    }
                  }}
                />
              )}

              {error ? (
                <p id={errorId} className="cv-error" role="alert">
                  <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              ) : null}

              <Problem entry={entry} slot={slot} onRetry={retry} onDiscard={discard} onKeepTheirs={discard} onSaveMine={retry} />

              <div className="cv-fld-foot">
                <Status status={entry?.status} updatedAt={live.isOriginal ? null : live.updatedAt} fresh={fresh !== null} />
                {!Array.isArray(value) && guidance > 0 ? (
                  <span className={cn('cv-count', value.length > guidance && 'is-over')}>
                    {value.length} / {guidance}
                    {value.length > guidance ? ' · longer than the design expects' : ''}
                  </span>
                ) : null}
              </div>
            </>
          )
        }}
      </form.Field>

      {!field.shared && live.needsReview ? (
        <ReviewNote field={field} slot={slot} onChecked={() => void markReviewed(field.key, slot, label)} />
      ) : null}

      {!field.shared ? <OtherLanguages field={field} language={language} /> : null}

      {panel === 'original' ? (
        <div className="cv-panel">
          <h4>Restore the original wording?</h4>
          <div className="cv-orig" dir={directionOf(slot)}>{asText(live.original)}</div>
          <p className="cv-quiet">It replaces what visitors read now, at once. The current wording stays in History.</p>
          <div className="cv-row">
            <button
              type="button"
              className="dash-btn dash-btn-primary cv-xs"
              disabled={locked}
              onClick={() => {
                setPanel(null)
                void save({ kind: 'original', key: field.key, slot, label, value: live.original, legalUnlocked: legalOpen })
              }}
            >
              Restore original
            </button>
            <button type="button" className="dash-btn dash-btn-ghost cv-xs" onClick={() => setPanel(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {panel === 'history' ? (
        <FieldHistory field={field} slot={slot} label={label} locked={locked} legalOpen={legalOpen} onClose={() => setPanel(null)} />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------ the parts */

function ListInput(props: {
  field: ContentFieldState
  value: string[]
  inputId: string
  labelId: string
  errorId: string
  badLine: number | undefined
  hasError: boolean
  fresh: number | null
  locked: boolean
  direction: 'rtl' | 'ltr'
  lang: string
  dirty: boolean
  onChange: (value: string[]) => void
  onAdd: () => void
  onMove: (from: number, to: number) => void
  onRemove: (at: number) => void
  onLeave: () => void
}) {
  const group = useRef<HTMLDivElement>(null)
  const { field, value, fresh, locked } = props
  const fixed = field.minEntries === field.maxEntries

  return (
    <div
      ref={group}
      className="cv-list"
      role="group"
      aria-labelledby={props.labelId}
      onBlur={(event) => {
        // Moving between the lines of one list is not leaving the field.
        if (group.current?.contains(event.relatedTarget as Node | null)) return
        props.onLeave()
      }}
    >
      {value.map((line, index) => {
        const invalid = props.hasError && (props.badLine === undefined ? false : props.badLine === index)

        return (
          <div key={index} className={cn('cv-list-row', fresh === index && 'is-new')}>
            <span className="cv-num" aria-hidden="true">{index + 1}</span>
            <input
              id={`${props.inputId}-${index}`}
              className={cn('dash-field cv-input', props.dirty && 'cv-dirty')}
              value={line}
              dir={props.direction}
              lang={props.lang}
              readOnly={locked}
              aria-label={`Line ${index + 1}`}
              aria-invalid={invalid ? true : undefined}
              aria-describedby={invalid ? props.errorId : undefined}
              placeholder={fresh === index ? 'Type the new line, then leave the field' : undefined}
              onChange={(event) => props.onChange(value.map((item, at) => (at === index ? event.target.value : item)))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                }
              }}
            />
            <button type="button" className="dash-btn dash-btn-ghost cv-icon" aria-label={`Move line ${index + 1} up`} disabled={locked || index === 0} onClick={() => props.onMove(index, index - 1)}>
              <ArrowUp className="size-3.5" aria-hidden="true" />
            </button>
            <button type="button" className="dash-btn dash-btn-ghost cv-icon" aria-label={`Move line ${index + 1} down`} disabled={locked || index === value.length - 1} onClick={() => props.onMove(index, index + 1)}>
              <ArrowDown className="size-3.5" aria-hidden="true" />
            </button>
            {fixed ? null : (
              <button type="button" className="dash-btn dash-btn-ghost cv-icon" aria-label={`Remove line ${index + 1}`} disabled={locked || value.length <= field.minEntries} onClick={() => props.onRemove(index)}>
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )
      })}
      {fixed ? (
        <p className="cv-quiet">
          The website shows exactly {field.minEntries} of these, so lines can be reworded and reordered but not added or removed.
        </p>
      ) : (
        <div>
          <button type="button" className="dash-btn dash-btn-ghost cv-sm" disabled={locked || fresh !== null || value.length >= field.maxEntries} onClick={props.onAdd}>
            <Plus className="size-3.5" aria-hidden="true" /> Add line
          </button>
        </div>
      )}
    </div>
  )
}

function Status({ status, updatedAt, fresh }: { status?: string; updatedAt: string | null; fresh: boolean }) {
  if (status === 'saving') {
    return (
      <span className="cv-status is-saving" role="status">
        <span className="cv-spin" aria-hidden="true" />
        Saving…
      </span>
    )
  }

  if (status === 'saved') {
    return (
      <span className="cv-status is-live is-just" role="status">
        <span className="cv-pip" aria-hidden="true" />
        Saved · live now
      </span>
    )
  }

  if (status === 'dirty') {
    return (
      <span className="cv-status is-dirty">
        <span className="cv-pip" aria-hidden="true" />
        {fresh ? 'Type the new line — an empty line is not saved' : 'Not saved yet · saves when you leave the field'}
      </span>
    )
  }

  if (status === 'invalid' || status === 'failed' || status === 'conflict') return null

  return (
    <span className="cv-status is-live">
      <span className="cv-pip" aria-hidden="true" />
      Live{updatedAt ? ` · changed ${whenText(updatedAt).toLowerCase()}` : ''}
    </span>
  )
}

function Problem({
  entry,
  slot,
  onRetry,
  onDiscard,
  onKeepTheirs,
  onSaveMine,
}: {
  entry: ReturnType<typeof useLocalEntry>
  slot: ContentSlot
  onRetry: () => void
  onDiscard: () => void
  onKeepTheirs: () => void
  onSaveMine: () => void
}) {
  if (entry?.status === 'failed') {
    return (
      <div className="cv-problem is-bad" role="alert">
        <p>
          <b>Not saved.</b> {entry.error ?? 'The connection failed'}, so the website still shows the previous wording. Your text is kept here.
        </p>
        <div className="cv-row">
          <button type="button" className="dash-btn dash-btn-primary cv-xs" onClick={onRetry}>Try again</button>
          <button type="button" className="dash-btn dash-btn-ghost cv-xs" onClick={onDiscard}>Discard my change</button>
        </div>
      </div>
    )
  }

  if (entry?.status === 'conflict') {
    return (
      <div className="cv-problem is-warn" role="alert">
        <p>
          <b>Changed in another tab.</b> Your wording was not saved. The website shows this version:
        </p>
        <div className="cv-theirs" dir={directionOf(slot)}>{asText(entry.theirs ?? '')}</div>
        <div className="cv-row">
          <button type="button" className="dash-btn dash-btn-quiet cv-xs" onClick={onKeepTheirs}>Keep that version</button>
          <button type="button" className="dash-btn cv-btn-amber cv-xs" onClick={onSaveMine}>Save my wording instead</button>
        </div>
      </div>
    )
  }

  return null
}

function ReviewNote({ field, slot, onChecked }: { field: ContentFieldState; slot: ContentSlot; onChecked: () => void }) {
  // The language that moved most recently is the one to compare against.
  const moved = (['de', 'en', 'ar'] as const)
    .filter((language) => language !== slot && field.slots[language]?.updatedAt)
    .sort((a, b) => (field.slots[b]!.updatedAt! > field.slots[a]!.updatedAt! ? 1 : -1))[0]

  return (
    <div className="cv-review">
      <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        <b>Check this translation.</b> The {moved ? LANGUAGE_NAME[moved] : 'other'} wording changed
        {moved ? ` ${whenText(field.slots[moved]!.updatedAt!).toLowerCase()}` : ''}. Visitors still read this {LANGUAGE_NAME[slot]} version.
      </span>
      <button type="button" className="dash-btn dash-btn-quiet cv-xs" onClick={onChecked}>
        <Check className="size-3.5" aria-hidden="true" /> It still matches
      </button>
    </div>
  )
}

function OtherLanguages({ field, language }: { field: ContentFieldState; language: ContentLanguage }) {
  return (
    <div className="cv-others" aria-label="The other languages">
      {(['de', 'en', 'ar'] as const)
        .filter((other) => other !== language)
        .map((other) => (
          <div key={other} className="cv-other">
            <span className="cv-other-lang">{other.toUpperCase()}</span>
            <span className={cn('cv-other-text', other === 'ar' && 'cv-ar')} dir={directionOf(other)} lang={other}>
              {asText(field.slots[other]!.value)}
            </span>
            {field.slots[other]!.needsReview ? <span className="cv-chip cv-tone-amber">review</span> : null}
          </div>
        ))}
    </div>
  )
}

const HISTORY_PAGE = 5

function FieldHistory({
  field,
  slot,
  label,
  locked,
  legalOpen,
  onClose,
}: {
  field: ContentFieldState
  slot: ContentSlot
  label: string
  locked: boolean
  legalOpen: boolean
  onClose: () => void
}) {
  const [page, setPage] = useState(1)
  const history = useContentHistory({ key: field.key, language: slot, page, pageSize: HISTORY_PAGE })
  const save = useContentSaver()
  const live = field.slots[slot]!

  return (
    <div className="cv-panel">
      <h4>History of this field · {LANGUAGE_NAME[slot]}</h4>
      {history.isPending ? (
        <div className="dash-skeleton h-10 rounded" />
      ) : history.isError ? (
        <p className="cv-quiet" role="alert">The history could not be loaded. The website text is not affected.</p>
      ) : history.data.items.length === 0 ? (
        <p className="cv-quiet">No changes yet. Visitors still read the original wording.</p>
      ) : (
        <ul className="cv-hist">
          {history.data.items.map((item) => (
            <li key={item.id} className="cv-hist-row">
              <span className="cv-hist-when">{whenText(item.createdAt)}</span>
              <span className="cv-hist-val" dir={directionOf(slot)}>
                {asText(item.after)}
                {item.action === 'restore_original' ? <span className="cv-chip cv-tone-grey ms-1.5">original</span> : null}
              </span>
              {sameContentValue(item.after, live.value) ? (
                <span className="cv-chip cv-tone-live">live</span>
              ) : (
                <button
                  type="button"
                  className="dash-btn dash-btn-quiet cv-xs"
                  disabled={locked}
                  onClick={() => void save({ kind: 'history', key: field.key, slot, label, historyId: item.id, side: 'after', value: item.after, legalUnlocked: legalOpen })}
                >
                  Bring back
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="cv-row">
        {history.data && history.data.pageCount > 1 ? (
          <>
            <button type="button" className="dash-btn dash-btn-quiet cv-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button>
            <span className="cv-quiet">Page {history.data.page} of {history.data.pageCount}</span>
            <button type="button" className="dash-btn dash-btn-quiet cv-xs" disabled={!history.data.hasMore} onClick={() => setPage(page + 1)}>Older</button>
          </>
        ) : null}
        <button type="button" className="dash-btn dash-btn-ghost cv-xs" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
