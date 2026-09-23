import { useEffect, useMemo, useState } from 'react'
import { useBlocker, useNavigate, useSearch } from '@tanstack/react-router'
import { AlertTriangle, ArrowLeft, Clock, Eye, Lock, Search, Unlock } from 'lucide-react'
import {
  CONTENT_LANGUAGES,
  type ContentFieldState,
  type ContentLanguage,
  type ContentSlot,
  sameContentValue,
} from '#/backend2/contracts/content.contract'
import { DashboardPage, PageHead } from '#/frontend/dashboard/primitives'
import { contentStore, slotKey, useAllLocal } from '#/frontend/features/content-v2/content-store'
import {
  LANGUAGE_NAME,
  PAGE_NAME,
  PAGE_PATH,
  asText,
  directionOf,
  fieldLabel,
  sectionLabel,
  slotOf,
  whenText,
} from '#/frontend/features/content-v2/content-words'
import { useContentHistory, useContentSaver, useContentSnapshot } from '#/frontend/features/content-v2/queries'
import { cn } from '#/frontend/lib/utils'
import { ContentField, type FieldPanel } from './ContentField'
import { ContentPreview } from './ContentPreview'
import './content.css'

/**
 * `/dashboard/content` — the website's static copy, approved in the Content
 * Design Lab on 23 Sep 2026 (`docs/v2/content.md`): preview beside the editor
 * (1A), the other two languages under each field (2B), history per field and
 * on its own page (3B); the Legal unlock lasts until the Legal page is left,
 * review reminders are counts plus "It still matches", leaving with a change
 * that is not live asks first, and every section is shown open (1A–4A).
 *
 * The page, language and view live in the address, so a reload or a shared
 * link lands on the same place.
 */

export type ContentSearch = {
  view?: 'history'
  lang?: ContentLanguage
  page?: string
  hpage?: number
  hlang?: ContentSlot
}

export const parseContentSearch = (raw: Record<string, unknown>): ContentSearch => {
  const out: ContentSearch = {}

  if (raw.view === 'history') out.view = 'history'
  if (typeof raw.lang === 'string' && (CONTENT_LANGUAGES as readonly string[]).includes(raw.lang)) out.lang = raw.lang as ContentLanguage
  if (typeof raw.page === 'string' && raw.page in PAGE_NAME) out.page = raw.page
  const hpage = Number(raw.hpage)
  if (Number.isInteger(hpage) && hpage > 1 && hpage < 100_000) out.hpage = hpage
  if (typeof raw.hlang === 'string' && ['de', 'en', 'ar', 'shared'].includes(raw.hlang)) out.hlang = raw.hlang as ContentSlot

  return out
}

type Pending = { run: () => void } | { blocker: true }

export function ContentPage() {
  const search = useSearch({ strict: false }) as ContentSearch
  const navigate = useNavigate()
  const snapshot = useContentSnapshot()
  const local = useAllLocal()

  const view = search.view ?? 'editor'
  const language = search.lang ?? 'de'
  const page = search.page ?? 'home'

  const [query, setQuery] = useState('')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [legalOpen, setLegalOpen] = useState(false)
  const [askUnlock, setAskUnlock] = useState(false)
  const [fullPreview, setFullPreview] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [openPanel, setOpenPanel] = useState<{ key: string; panel: FieldPanel } | null>(null)

  /* Approved choice 1A: the unlock lasts until the Legal page is left. */
  useEffect(() => {
    if (page !== 'legal' || view !== 'editor') setLegalOpen(false)
  }, [page, view])

  const go = (next: ContentSearch) =>
    void navigate({ to: '/dashboard/content', search: { ...search, ...next } as never })

  /**
   * Every move inside Content goes through here (approved choice 3A). The
   * field being left saves first, the way leaving it always does; whatever is
   * still not live after that — a failed save, a refused one, a rule broken —
   * stops the move and is named.
   */
  const guarded = (run: () => void) => {
    const active = document.activeElement
    if (active instanceof HTMLElement && active.closest('.cv-fld')) active.blur()

    window.setTimeout(() => {
      if (contentStore.unsettled().length > 0) setPending({ run })
      else run()
    }, 0)
  }

  /* Leaving Content altogether, or closing the tab, asks the same question. */
  const blocker = useBlocker({
    shouldBlockFn: () => contentStore.unsettled().length > 0,
    enableBeforeUnload: () => contentStore.unsettled().length > 0 || contentStore.isSaving(),
    withResolver: true,
  })

  useEffect(() => {
    if (blocker.status === 'blocked') setPending({ blocker: true })
  }, [blocker.status])

  const fields = snapshot.data?.fields ?? []
  const counts = snapshot.data?.reviewCounts ?? { de: 0, en: 0, ar: 0 }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = (field: ContentFieldState) => {
      if (!needle) return true
      const slot = slotOf(field, language)
      const text = `${fieldLabel(field)} ${field.key} ${asText(field.slots[slot]!.value)} ${PAGE_NAME[field.page]}`

      return text.toLowerCase().includes(needle)
    }

    if (reviewOnly) return fields.filter((field) => !field.shared && field.slots[language]?.needsReview && matches(field))
    if (needle) return fields.filter(matches)

    return fields.filter((field) => field.page === page)
  }, [fields, query, reviewOnly, page, language])

  const pageMarks = (name: string) => {
    let review = 0
    let problem = false

    for (const field of fields) {
      if (field.page !== name) continue
      if (!field.shared && field.slots[language]?.needsReview) review += 1
      const entry = local.get(slotKey(field.key, slotOf(field, language)))
      if (entry && ['failed', 'conflict', 'invalid'].includes(entry.status)) problem = true
    }

    return { review, problem, total: fields.filter((field) => field.page === name).length }
  }

  const pages = snapshot.data?.pages ?? []
  const multiPage = reviewOnly || query.trim() !== ''

  const pageButtons = (className: string) =>
    pages.map((name) => {
      const marks = pageMarks(name)
      const current = !multiPage && page === name

      return (
        <button
          key={name}
          type="button"
          className={className}
          aria-current={current ? 'page' : undefined}
          onClick={() =>
            guarded(() => {
              setQuery('')
              setReviewOnly(false)
              setOpenPanel(null)
              go({ page: name })
            })
          }
        >
          {name === 'legal' ? (legalOpen ? <Unlock className="size-3.5" aria-hidden="true" /> : <Lock className="size-3.5" aria-hidden="true" />) : null}
          <span>{PAGE_NAME[name] ?? name}</span>
          {marks.problem ? (
            <span className="cv-dot is-bad" title="A change here is not on the website" />
          ) : marks.review ? (
            <span className="cv-dot" title={`${marks.review} to review`} />
          ) : null}
          <span className="cv-page-count">{marks.total}</span>
        </button>
      )
    })

  const sections = useMemo(() => {
    const out: Array<{ id: string; page: string; section: string; fields: ContentFieldState[] }> = []

    for (const field of visible) {
      const id = `${field.page}/${field.section}`
      const last = out[out.length - 1]
      if (last && last.id === id) last.fields.push(field)
      else out.push({ id, page: field.page, section: field.section, fields: [field] })
    }

    return out
  }, [visible])

  const confirmLeave = () => {
    contentStore.discardUnsettled()
    const was = pending
    setPending(null)
    if (was && 'run' in was) was.run()
    else blocker.proceed?.()
  }

  const stay = () => {
    const was = pending
    setPending(null)
    if (was && 'blocker' in was) blocker.reset?.()
    // Focus the first field that needs attention (AGENTS.md: first invalid field).
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('.cv-fld [aria-invalid="true"], .cv-problem button')?.focus()
    })
  }

  const header = (
    <PageHead
      eyebrow={view === 'history' ? 'PUBLIC WEBSITE · CONTENT' : 'PUBLIC WEBSITE'}
      title={view === 'history' ? 'All changes' : 'Content'}
      description={
        view === 'history'
          ? 'Every saved change to the website text, newest first. Bringing back an older wording makes it live at once and adds a new line here.'
          : 'The words on your website, in German, English and Arabic. A change goes live the moment it saves — when you leave the field. There is no Publish button.'
      }
      actions={
        view === 'history' ? (
          <button type="button" className="dash-btn dash-btn-quiet" onClick={() => go({ view: undefined, hpage: undefined, hlang: undefined })}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to the editor
          </button>
        ) : (
          <span className="cv-live-note">
            <span className="cv-status is-live"><span className="cv-pip" aria-hidden="true" /></span>
            Saved text is live on yamanwarda.de
          </span>
        )
      }
    />
  )

  if (snapshot.isPending) {
    return (
      <DashboardPage className="cv gap-5">
        {header}
        <div className="dash-panel cv-sec" aria-busy="true">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="cv-fld">
              <span className="dash-skeleton h-3 w-1/3 rounded" />
              <span className="dash-skeleton h-9 rounded" />
            </div>
          ))}
        </div>
      </DashboardPage>
    )
  }

  /* No fallback to the release wording: editing what might not be live is the
     one mistake this page must not invite (docs/v2/content.md). */
  if (snapshot.isError) {
    return (
      <DashboardPage className="cv gap-5">
        {header}
        <div className="dash-panel cv-empty" role="alert">
          <h2>The website text could not be loaded</h2>
          <p>Nothing is shown, so you cannot edit a version that might be out of date. The website itself is not affected.</p>
          <button type="button" className="dash-btn dash-btn-primary" onClick={() => void snapshot.refetch()}>
            Try again
          </button>
        </div>
      </DashboardPage>
    )
  }

  return (
    <DashboardPage className="cv gap-5">
      {header}

      {view === 'history' ? (
        <AllChanges
          fields={fields}
          page={search.hpage ?? 1}
          language={search.hlang}
          legalOpen={legalOpen}
          onPage={(next) => go({ hpage: next > 1 ? next : undefined })}
          onLanguage={(next) => go({ hlang: next, hpage: undefined })}
          onOpen={(key, slot) => {
            const field = fields.find((item) => item.key === key)
            if (!field) return
            setOpenPanel({ key, panel: 'history' })
            go({ view: undefined, page: field.page, lang: slot === 'shared' ? language : slot, hpage: undefined, hlang: undefined })
            window.setTimeout(() => document.querySelector(`[data-field="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'center' }), 80)
          }}
        />
      ) : (
        <>
          <div className="cv-toolbar">
            <div className="cv-langs" role="group" aria-label="Language you are editing">
              {CONTENT_LANGUAGES.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={language === code}
                  onClick={() => guarded(() => { setOpenPanel(null); go({ lang: code }) })}
                >
                  {code.toUpperCase()}
                  {counts[code] ? <span className="cv-lang-count" title={`${counts[code]} to review`}>{counts[code]}</span> : null}
                </button>
              ))}
            </div>
            <div className="cv-search">
              <Search className="size-4" aria-hidden="true" />
              <label htmlFor="content-search" className="sr-only">Search all fields</label>
              <input
                id="content-search"
                type="search"
                className="dash-field"
                placeholder="Search every page…"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <button type="button" className="cv-filter" aria-pressed={reviewOnly} onClick={() => guarded(() => setReviewOnly(!reviewOnly))}>
              <AlertTriangle className="size-3.5" aria-hidden="true" /> To review in {language.toUpperCase()} · {counts[language]}
            </button>
            <span className="cv-spacer" />
            <button type="button" className="dash-btn dash-btn-quiet cv-sm" onClick={() => guarded(() => go({ view: 'history' }))}>
              <Clock className="size-3.5" aria-hidden="true" /> All changes
            </button>
          </div>

          <nav className="cv-chips" aria-label="Pages">{pageButtons('cv-chip-btn')}</nav>

          <div className="cv-grid">
            <nav className="cv-pages" aria-label="Pages">
              <div className="cv-pages-label">PAGES</div>
              {pageButtons('cv-page-btn')}
            </nav>

            <div className="cv-fields">
              {!multiPage && page === 'legal' ? (
                legalOpen ? (
                  <div className="dash-panel cv-legal is-open" role="status">
                    <Unlock className="size-4.5 shrink-0" aria-hidden="true" />
                    <p><b>Legal text is unlocked.</b> Every saved change appears at once on the Impressum and the privacy policy, in the language you are editing. Nothing here checks that the wording is legally correct.</p>
                    <button type="button" className="dash-btn dash-btn-quiet cv-sm" onClick={() => setLegalOpen(false)}>
                      <Lock className="size-3.5" aria-hidden="true" /> Lock again
                    </button>
                  </div>
                ) : (
                  <div className="dash-panel cv-legal">
                    <Lock className="size-4.5 shrink-0" aria-hidden="true" />
                    <p><b>Legal text is locked.</b> It can be read but not changed, so a stray click cannot alter your Impressum or privacy policy.</p>
                    <button type="button" className="dash-btn dash-btn-quiet cv-sm" onClick={() => setAskUnlock(true)}>
                      <Unlock className="size-3.5" aria-hidden="true" /> Unlock to edit
                    </button>
                  </div>
                )
              ) : null}

              {multiPage ? (
                <p className="cv-quiet">
                  {visible.length} field{visible.length === 1 ? '' : 's'}{' '}
                  {reviewOnly ? `to review in ${LANGUAGE_NAME[language]}` : `match “${query.trim()}”`} ·{' '}
                  <button type="button" className="dash-btn dash-btn-ghost cv-xs" onClick={() => { setQuery(''); setReviewOnly(false) }}>
                    Back to pages
                  </button>
                </p>
              ) : null}

              {visible.length === 0 ? (
                <div className="dash-panel cv-empty">
                  {reviewOnly ? (
                    <>
                      <h2>Nothing to review in {LANGUAGE_NAME[language]}</h2>
                      <p>When the wording of a field changes in another language, the {LANGUAGE_NAME[language]} version appears here so you can check it still matches.</p>
                      <button type="button" className="dash-btn dash-btn-quiet" onClick={() => setReviewOnly(false)}>Show all fields</button>
                    </>
                  ) : (
                    <>
                      <h2>No field matches “{query.trim()}”</h2>
                      <p>Search looks at field names and the {LANGUAGE_NAME[language]} wording on every page. Try a shorter word, or switch language.</p>
                      <button type="button" className="dash-btn dash-btn-quiet" onClick={() => setQuery('')}>Clear search</button>
                    </>
                  )}
                </div>
              ) : (
                sections.map((section, index) => (
                  <div key={section.id} className="cv-sec-wrap">
                    {multiPage && sections[index - 1]?.page !== section.page ? (
                      <p className="cv-sec-page">{(PAGE_NAME[section.page] ?? section.page).toUpperCase()}</p>
                    ) : null}
                    <section className="dash-panel cv-sec" aria-labelledby={`sec-${section.id}`}>
                      <div className="cv-sec-head">
                        <h2 id={`sec-${section.id}`} className="cv-sec-title">{sectionLabel(section.section)}</h2>
                        {section.section === 'meta' ? <span className="cv-quiet">What Google shows for this page</span> : null}
                        {section.section === 'facts' ? <span className="cv-quiet">Written once, shown in every language</span> : null}
                      </div>
                      {section.fields.map((field) => (
                        <ContentField
                          key={`${field.key}|${language}`}
                          field={field}
                          language={language}
                          legalOpen={legalOpen}
                          initialPanel={openPanel?.key === field.key ? openPanel.panel : null}
                        />
                      ))}
                    </section>
                  </div>
                ))
              )}
            </div>

            <aside className="dash-panel cv-preview" aria-label="Visitor preview">
              <PreviewHead language={language} page={page} />
              <div className="cv-preview-body">
                <ContentPreview fields={fields} page={multiPage ? 'home' : page} language={language} />
              </div>
            </aside>
          </div>

          <div className="cv-mobile-bar">
            <button type="button" className="dash-btn dash-btn-quiet" onClick={() => setFullPreview(true)}>
              <Eye className="size-4" aria-hidden="true" /> Preview as visitor
            </button>
          </div>

          {fullPreview ? (
            <div className="cv-preview-full" role="dialog" aria-modal="true" aria-label="Visitor preview">
              <PreviewHead language={language} page={page} onClose={() => setFullPreview(false)} />
              <div className="cv-preview-body">
                <ContentPreview fields={fields} page={page} language={language} />
              </div>
            </div>
          ) : null}
        </>
      )}

      {askUnlock ? (
        <div className="cv-scrim">
          <div className="cv-dialog" role="dialog" aria-modal="true" aria-labelledby="unlock-title">
            <h2 id="unlock-title">Unlock legal text?</h2>
            <p>While unlocked, a saved change appears at once on your Impressum and privacy policy — the pages the law requires. Nothing here checks that the wording is legally correct.</p>
            <p>It locks again when you leave the Legal page.</p>
            <div className="cv-dialog-actions">
              <button type="button" className="dash-btn dash-btn-ghost" onClick={() => setAskUnlock(false)} autoFocus>Keep locked</button>
              <button type="button" className="dash-btn cv-btn-amber" onClick={() => { setLegalOpen(true); setAskUnlock(false) }}>
                <Unlock className="size-4" aria-hidden="true" /> Unlock legal text
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pending ? <LeaveDialog onStay={stay} onLeave={confirmLeave} /> : null}
    </DashboardPage>
  )
}

function PreviewHead({ language, page, onClose }: { language: ContentLanguage; page: string; onClose?: () => void }) {
  return (
    <>
      <div className="cv-preview-head">
        {onClose ? (
          <button type="button" className="dash-btn dash-btn-ghost cv-icon" aria-label="Close preview" onClick={onClose}>
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <Eye className="size-4 shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <div className="cv-preview-title">Visitor preview · {LANGUAGE_NAME[language]}</div>
          <div className="cv-preview-url" dir="ltr">yamanwarda.de/{language}{PAGE_PATH[page] ?? ''}</div>
        </div>
      </div>
      <p className="cv-preview-note">
        <i aria-hidden="true" />
        Outlined text is not saved yet. Visitors see it only after it saves.
      </p>
    </>
  )
}

function LeaveDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  const items = contentStore.unsettled()
  const reason: Record<string, string> = {
    failed: 'saving failed',
    conflict: 'changed in another tab',
    invalid: 'needs fixing',
    dirty: 'not saved yet',
  }

  return (
    <div className="cv-scrim">
      <div className="cv-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title">
        <h2 id="leave-title">{items.length === 1 ? 'A change is' : `${items.length} changes are`} not on the website</h2>
        <p>Visitors still see the previous wording for:</p>
        <ul>
          {items.map(([key, entry]) => {
            const slot = key.split('|')[1]

            return (
              <li key={key}>
                <b>{entry.label}</b> · {slot === 'shared' ? 'all languages' : slot.toUpperCase()} — {reason[entry.status] ?? entry.status}
              </li>
            )
          })}
        </ul>
        <div className="cv-dialog-actions">
          <button type="button" className="dash-btn dash-btn-ghost" onClick={onLeave}>Leave and discard</button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={onStay} autoFocus>Stay and fix</button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------- All changes (3B) */

const CHANGES_PAGE = 20

const ACTION: Record<string, { label: string; tone: string }> = {
  edit: { label: 'Edited', tone: 'cv-tone-blue' },
  restore_original: { label: 'Original restored', tone: 'cv-tone-grey' },
  restore_history: { label: 'Brought back', tone: 'cv-tone-grey' },
}

function AllChanges({
  fields,
  page,
  language,
  legalOpen,
  onPage,
  onLanguage,
  onOpen,
}: {
  fields: ContentFieldState[]
  page: number
  language?: ContentSlot
  legalOpen: boolean
  onPage: (page: number) => void
  onLanguage: (language?: ContentSlot) => void
  onOpen: (key: string, slot: ContentSlot) => void
}) {
  const history = useContentHistory({ page, pageSize: CHANGES_PAGE, language })
  const save = useContentSaver()
  const byKey = new Map(fields.map((field) => [field.key, field]))

  return (
    <>
      <div className="cv-toolbar">
        <div className="cv-langs" role="group" aria-label="Filter by language">
          {([undefined, 'de', 'en', 'ar', 'shared'] as const).map((code) => (
            <button key={code ?? 'all'} type="button" aria-pressed={language === code} onClick={() => onLanguage(code)}>
              {code === undefined ? 'All' : code === 'shared' ? 'Site facts' : code.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <section className="dash-panel" aria-busy={history.isFetching}>
        {history.isPending ? (
          <div className="grid gap-2.5 p-4">
            <span className="dash-skeleton h-14 rounded" />
            <span className="dash-skeleton h-14 rounded" />
          </div>
        ) : history.isError ? (
          <div className="cv-empty" role="alert">
            <h2>The history could not be loaded</h2>
            <p>Your website text is not affected. Try again in a moment.</p>
            <button type="button" className="dash-btn dash-btn-primary" onClick={() => void history.refetch()}>Try again</button>
          </div>
        ) : history.data.items.length === 0 ? (
          <div className="cv-empty">
            <h2>No changes yet</h2>
            <p>When you save a field, the change appears here with the wording it replaced.</p>
          </div>
        ) : (
          <ul>
            {history.data.items.map((item) => {
              const field = byKey.get(item.key)
              if (!field) return null
              const live = field.slots[item.language]!
              const isLive = sameContentValue(item.after, live.value)
              const locked = field.scope === 'legal' && !legalOpen
              const label = fieldLabel(field)

              return (
                <li key={item.id} className="cv-change">
                  <div className="cv-change-top">
                    <span className="cv-change-field">{label}</span>
                    <span className="cv-quiet">{PAGE_NAME[field.page]}</span>
                    <span className="cv-chip cv-tone-grey">{item.language === 'shared' ? 'ALL' : item.language.toUpperCase()}</span>
                    <span className={cn('cv-chip', ACTION[item.action]?.tone)}>{ACTION[item.action]?.label}</span>
                    {isLive ? <span className="cv-chip cv-tone-live">Live now</span> : null}
                    <span className="cv-change-when">{whenText(item.createdAt)}</span>
                  </div>
                  <div className="cv-change-diff" dir={directionOf(item.language)}>
                    <div className="cv-was"><span className="cv-diff-label">BEFORE</span>{asText(item.before)}</div>
                    <div className="cv-now"><span className="cv-diff-label">AFTER</span>{asText(item.after)}</div>
                  </div>
                  <div className="cv-row">
                    <button type="button" className="dash-btn dash-btn-quiet cv-xs" onClick={() => onOpen(item.key, item.language)}>
                      Open the field
                    </button>
                    {sameContentValue(item.before, live.value) ? null : (
                      <button
                        type="button"
                        className="dash-btn dash-btn-ghost cv-xs"
                        disabled={locked}
                        title={locked ? 'Unlock legal text on the Legal page first' : undefined}
                        onClick={() => void save({ kind: 'history', key: item.key, slot: item.language, label, historyId: item.id, side: 'before', value: item.before, legalUnlocked: legalOpen })}
                      >
                        Bring back the wording before
                      </button>
                    )}
                    {isLive ? null : (
                      <button
                        type="button"
                        className="dash-btn dash-btn-ghost cv-xs"
                        disabled={locked}
                        title={locked ? 'Unlock legal text on the Legal page first' : undefined}
                        onClick={() => void save({ kind: 'history', key: item.key, slot: item.language, label, historyId: item.id, side: 'after', value: item.after, legalUnlocked: legalOpen })}
                      >
                        Bring back this wording
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {history.data && history.data.total > 0 ? (
          <div className="cv-pager">
            <span>
              Page <b>{history.data.page}</b> of <b>{history.data.pageCount}</b> · {history.data.total} changes
            </span>
            <span className="cv-row">
              <button type="button" className="dash-btn dash-btn-quiet cv-sm" disabled={history.data.page <= 1} onClick={() => onPage(history.data.page - 1)}>Previous</button>
              <button type="button" className="dash-btn dash-btn-quiet cv-sm" disabled={!history.data.hasMore} onClick={() => onPage(history.data.page + 1)}>Next</button>
            </span>
          </div>
        ) : null}
      </section>
    </>
  )
}
