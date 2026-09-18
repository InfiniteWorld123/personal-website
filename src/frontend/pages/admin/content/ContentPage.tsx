import { useQuery } from '@tanstack/react-query'
import { Eye, History, Lock, Pencil, Search, Send } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelNote } from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import {
  codeDefault,
  type EditableField,
  editableFieldByKey,
  editableFields,
  editablePages,
} from '#/frontend/content/editable'
import {
  contentRevisionsQuery,
  contentSnapshotQuery,
  publishDiffQuery,
  useMarkReviewed,
  usePublishContent,
  useResetField,
  useRevertRevision,
} from '#/frontend/features/content/content-queries'
import { ContentOverlayContext } from '#/frontend/features/content/content-overlay'
import { useContentDraft } from '#/frontend/features/content/use-content-draft'
import type { ProjectEntry } from '#/frontend/features/work/project-list'
import { type Language, languages } from '#/frontend/i18n/language'
import { usePrefetch } from '#/frontend/lib/prefetch'
import { cn } from '#/frontend/lib/utils'
import type { PublicPostSummary } from '#/shared/types/post.types'
import { ContentFieldRow } from './ContentFieldRow'
import { ContentHistoryPanel, ContentPublishDialog, ContentSearchPanel } from './ContentPanels'
import { ContentPreview } from './ContentPreview'
import { PAGE_LABEL, fieldLabel, sectionLabel, sectionOf } from './content-format'

/**
 * `/admin/content` — the site's words, a section at a time.
 *
 * A list of pages on the left, the fields of the chosen one on the right.
 * Nothing here invents a second copy of the site: the fields come from the
 * registry, which is derived from the content tree itself, so a string added
 * to `de.ts` shows up in this form with the release that adds it.
 *
 * "Preview as visitor" swaps the form for the real public page with the
 * unpublished wording written into it, which is the only place drafts are ever
 * rendered — the public site keeps serving what was published until the owner
 * presses publish.
 */

/**
 * How tall the box for one field stands before anything is typed in it.
 *
 * `ContentFieldRow` sizes a paragraph off its own text, and the text it starts
 * from while the snapshot is still in flight is the wording the code ships —
 * which is available here, synchronously, from the same registry. So the grey
 * block can be the height the real box will be rather than a guess at it.
 */
const skeletonLines = (field: EditableField, language: Language): number => {
  const fallback = codeDefault(field.key, language)
  const longest = typeof fallback === 'string' ? fallback.length : 0

  return Math.min(8, Math.max(2, Math.ceil(longest / 90)))
}

/** How many rows a list field opens with, counted from the same fallback. */
const skeletonListRows = (field: EditableField, language: Language): number => {
  const fallback = codeDefault(field.key, language)

  return Array.isArray(fallback) ? Math.max(1, fallback.length) : 1
}

/**
 * The form, not yet arrived — in the exact shape it will arrive in.
 *
 * Everything about this page's layout is known before the network answers:
 * which sections the chosen page has, how many fields each one holds, whether
 * a field is a single box, a paragraph or a reorderable list, and whether it
 * carries a length counter. All of it comes from the static registry, and only
 * the *words* come from the snapshot. So this is not an impression of the form
 * with a plausible number of rows — it is the form with its text removed, and
 * when the snapshot lands nothing below the fold moves by a pixel.
 *
 * The page list beside it needs no skeleton for the same reason: it is already
 * correct while this is still grey.
 */
function FieldsSkeleton({
  sections,
  language,
}: {
  sections: [string, EditableField[]][]
  language: Language
}) {
  return (
    <SkeletonScreen className="content-pane" label="Loading the site's copy">
      {sections.map(([section, fields]) => (
        <Panel asChild key={section}>
          <section className="field-group">
            <div className="field-group-title">
              <Skeleton
                className="h-3"
                style={{ width: `${Math.min(24, sectionLabel(section).length + 2)}ch` }}
              />
            </div>

            {fields.map((field) => (
              <div className="field-row" key={field.key}>
                {/* The head is as tall as the "Original" button in it, not as
                    tall as the label — that button is what sets the row. */}
                <div className="field-row-head">
                  <Skeleton
                    className="h-3.5"
                    style={{ width: `${Math.min(28, Math.max(6, fieldLabel(field.key).length))}ch` }}
                  />
                  <Skeleton className="ms-auto h-7 w-24" />
                </div>

                {field.kind === 'list' ? (
                  <div className="list-editor">
                    {Array.from({ length: skeletonListRows(field, language) }, (_, row) => (
                      <div className="list-row" key={row}>
                        <Skeleton className="h-8 flex-1" />
                        <Skeleton className="size-8" />
                        <Skeleton className="size-8" />
                        <Skeleton className="size-8" />
                      </div>
                    ))}
                    <Skeleton className="h-7 w-28" />
                  </div>
                ) : field.kind === 'area' ? (
                  <Skeleton
                    className="w-full"
                    style={{
                      height: `calc(${skeletonLines(field, language)} * 1.25rem + 1rem + 2px)`,
                      minHeight: '4rem',
                    }}
                  />
                ) : (
                  <Skeleton className="h-8 w-full" />
                )}

                {field.max > 0 ? <Skeleton className="h-3 w-12 self-end" /> : null}
              </div>
            ))}
          </section>
        </Panel>
      ))}
    </SkeletonScreen>
  )
}

export function ContentPage({
  entries,
  posts,
}: {
  entries: ProjectEntry[]
  posts: PublicPostSummary[]
}) {
  const prefetch = usePrefetch()
  const snapshot = useQuery(contentSnapshotQuery())
  const [language, setLanguage] = useState<Language>('de')
  const [page, setPage] = useState<string>('home')
  const [preview, setPreview] = useState(false)
  const [legalUnlocked, setLegalUnlocked] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const draft = useContentDraft(snapshot.data, language)
  const reset = useResetField()
  const reviewed = useMarkReviewed()
  const revert = useRevertRevision()
  const publish = usePublishContent()

  const reviewCounts = snapshot.data?.reviewCounts ?? {}
  const draftCount = (snapshot.data?.draftCount ?? 0) + draft.unsaved

  /**
   * The snapshot is the only thing that knows what is live.
   *
   * Without it every field falls back to the wording in the code, which looks
   * exactly like a loaded form and is not one — he would sit and edit copy
   * that is not the copy visitors are being served. So a failed snapshot
   * closes the form rather than filling it with defaults.
   */
  const snapshotFailed = snapshot.isError

  /** Locked until deliberately unlocked: a mistake here is a legal violation. */
  const legalLocked = page === 'legal' && !legalUnlocked

  const needsReview = useCallback(
    (key: string): boolean =>
      snapshot.data?.fields.some(
        (field) => field.key === key && field.language === language && field.needsReview,
      ) ?? false,
    [snapshot.data, language],
  )

  const overlay = useMemo(
    () => ({ value: draft.currentValue, version: draft.version }),
    [draft.currentValue, draft.version],
  )

  /** Pages that carry a draft get a mark in the list, so none goes forgotten. */
  const pagesWithDrafts = useMemo(() => {
    const pages = new Set<string>()

    for (const field of snapshot.data?.fields ?? []) {
      if (field.draft === null) continue
      const known = editableFieldByKey.get(field.key)
      if (known) pages.add(known.page)
    }

    return pages
  }, [snapshot.data])

  const sections = useMemo(() => {
    const fields = editableFields.filter((field) => field.page === page)
    const grouped = new Map<string, typeof fields>()

    for (const field of fields) {
      const section = sectionOf(field.key)
      grouped.set(section, [...(grouped.get(section) ?? []), field])
    }

    return [...grouped.entries()]
  }, [page])

  const switchLanguage = (next: Language) => {
    // Whatever is still on the autosave timer belongs to the language it was
    // typed in, so it goes out before the form changes under it.
    draft.flushAll()
    setLanguage(next)
    draft.bumpVersion()
  }

  const openField = (key: string) => {
    const field = editableFieldByKey.get(key)
    if (!field) return

    setSearchOpen(false)
    setPreview(false)
    setPage(field.page)

    // The row has to exist before it can be scrolled to.
    requestAnimationFrame(() => {
      const node = document.getElementById(`field-${key}`)
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      node?.querySelector<HTMLElement>('input, textarea')?.focus()
    })
  }

  return (
    <AdminPage>
      <PageHeader
        title="Content"
        description="Every sentence the site says, in all three languages. Nothing written here reaches a visitor until you publish it."
        actions={
          <>
            <Button
              className="rounded-full"
              disabled={snapshotFailed}
              size="sm"
              variant={preview ? 'default' : 'outline'}
              onClick={() => {
                draft.flushAll()
                setPreview((value) => !value)
              }}
            >
              {preview ? <Pencil className="size-4" /> : <Eye className="size-4" />}
              {preview ? 'Back to editing' : 'Preview as visitor'}
            </Button>

            {/* The sheet's own query, fetched while the pointer is still on
                the button, so the panel opens on its rows rather than on grey. */}
            <Button
              className="rounded-full"
              size="sm"
              variant="outline"
              {...prefetch(contentRevisionsQuery(true))}
              onClick={() => setHistoryOpen(true)}
            >
              <History className="size-4" />
              History
            </Button>
          </>
        }
      />

      {/*
        Stays in view while the form scrolls, because everything in it is a
        thing whose answer changes as he types: which language he is in, how
        far behind the other two are, whether the last keystroke is saved, how
        much is still waiting to go live — and the button that sends it.
      */}
      <Panel asChild>
        <header className="content-toolbar">
          <div className="content-toolbar-left">
            <div className="lang-tabs" role="group" aria-label="Language">
              {languages.map((code) => (
                <button
                  type="button"
                  key={code}
                  className={cn('lang-tab', language === code && 'is-active')}
                  aria-pressed={language === code}
                  onClick={() => switchLanguage(code)}
                >
                  {code.toUpperCase()}
                  {code !== language && (reviewCounts[code] ?? 0) > 0 ? (
                    <span className="lang-dot" title={`${reviewCounts[code]} need review`}>
                      {reviewCounts[code]}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <Button size="sm" variant="ghost" onClick={() => setSearchOpen(true)}>
              <Search className="size-4" />
              Find a sentence
            </Button>
          </div>

          <div className="content-toolbar-right">
            {draft.isSaving ? <span className="save-state">Saving…</span> : null}
            {!draft.isSaving && draft.unsaved > 0 ? (
              <span className="save-state">Unsaved…</span>
            ) : null}
            {!draft.isSaving && draft.unsaved === 0 && draftCount > 0 ? (
              <span className="save-state">Draft saved</span>
            ) : null}

            {/* A count of nothing, drawn from a snapshot that never arrived,
                would read as "everything is published". It is not said. */}
            {snapshotFailed ? null : (
              <span className="pill pill-draft">{draftCount} unpublished</span>
            )}

            {/*
              Publish stays in the bar rather than moving up to the header
              with the other two, because this bar is sticky and the form
              under it is four thousand pixels tall. The button that ends a
              session of editing has to be reachable from the sentence he
              stopped on, not from the top of the page — and it belongs beside
              the count it acts on. The diff is fetched on hover, so the sheet
              opens on its rows.
            */}
            <Button
              className="rounded-full"
              disabled={draftCount === 0}
              size="sm"
              {...prefetch(publishDiffQuery(true))}
              onClick={() => {
                draft.flushAll()
                setPublishOpen(true)
              }}
            >
              <Send className="size-4" />
              Publish
            </Button>
          </div>
        </header>
      </Panel>

      {draft.saveError ? (
        <p className="content-error" role="alert">
          That change was not saved: {draft.saveError.message}
        </p>
      ) : null}

      <div className="content-layout">
        <Panel asChild>
          <nav className="section-list" aria-label="Pages">
            {editablePages.map((candidate) => (
              <button
                type="button"
                key={candidate}
                className={cn('section-item', page === candidate && 'is-active')}
                aria-current={page === candidate ? 'page' : undefined}
                onClick={() => setPage(candidate)}
              >
                <span className="section-item-name">{PAGE_LABEL[candidate] ?? candidate}</span>
                {pagesWithDrafts.has(candidate) ? (
                  <span className="section-item-dot" title="has unpublished changes" />
                ) : null}
                <span className="section-item-count">
                  {editableFields.filter((field) => field.page === candidate).length}
                </span>
              </button>
            ))}
          </nav>
        </Panel>

        {snapshot.isPending ? (
          <FieldsSkeleton sections={sections} language={language} />
        ) : snapshotFailed ? (
          /*
            Said, rather than quietly shown as a full form.
            An empty snapshot and a loaded one look identical in this editor —
            every field simply falls back to the wording the code ships — and
            editing on top of that is how a published sentence gets replaced by
            one that was never live.
          */
          <div className="content-pane">
            <Panel>
              <PanelNote tone="error">
                <div>
                  <p className="font-medium">The site's copy could not be loaded.</p>
                  <p className="text-muted-foreground mt-1">
                    {snapshot.error instanceof Error
                      ? snapshot.error.message
                      : 'Something went wrong.'}
                  </p>
                  <p className="text-muted-foreground mt-3 max-w-prose">
                    The form stays closed until it does. Without it every field would show the
                    wording in the code rather than the wording your visitors are being served.
                  </p>
                </div>
                <Button onClick={() => void snapshot.refetch()} size="sm" variant="outline">
                  Try again
                </Button>
              </PanelNote>
            </Panel>
          </div>
        ) : (
          <div className="content-pane">
            {preview ? (
              <ContentOverlayContext.Provider value={overlay}>
                <ContentPreview page={page} language={language} entries={entries} posts={posts} />
              </ContentOverlayContext.Provider>
            ) : (
              <>
                {page === 'legal' ? (
                  <div className="legal-lock">
                    <Lock className="size-4" />
                    <p>
                      Impressum and Datenschutz are legally binding. A mistake here is a violation,
                      not a clumsy sentence.
                    </p>
                    {legalUnlocked ? (
                      <span className="lock-open">Unlocked for this visit</span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setLegalUnlocked(true)}>
                        Unlock to edit
                      </Button>
                    )}
                  </div>
                ) : null}

                {sections.map(([section, fields]) => (
                  <Panel asChild key={section}>
                    <section className="field-group">
                      <h2 className="field-group-title">{sectionLabel(section)}</h2>

                      {fields.map((field) => (
                        <ContentFieldRow
                          // Remounted whenever the value changes from outside the
                          // keyboard, which re-seeds the row from the new wording.
                          key={`${field.key}:${language}:${draft.version}`}
                          field={field}
                          value={draft.currentValue(field.key)}
                          language={field.shared ? '*' : language}
                          isDraft={draft.hasDraft(field.key)}
                          needsReview={needsReview(field.key)}
                          locked={legalLocked}
                          onChange={(value) => draft.onEdit(field.key, value)}
                          onReset={() =>
                            reset.mutate(
                              { key: field.key, language: field.shared ? '*' : language },
                              { onSuccess: draft.bumpVersion },
                            )
                          }
                          onReviewed={() => reviewed.mutate({ key: field.key, language })}
                        />
                      ))}
                    </section>
                  </Panel>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <ContentSearchPanel
        open={searchOpen}
        onOpenChange={setSearchOpen}
        term={searchTerm}
        onTermChange={setSearchTerm}
        language={language}
        currentValue={draft.currentValue}
        onPick={openField}
      />

      <ContentHistoryPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        reverting={revert.isPending}
        onRevert={(revisionId) =>
          revert.mutate(revisionId, {
            onSuccess: () => {
              draft.bumpVersion()
              setHistoryOpen(false)
            },
          })
        }
      />

      <ContentPublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        // The toolbar has already counted the drafts, so the sheet knows how
        // many rows are coming before it has read one of them.
        expected={draftCount}
        publishing={publish.isPending}
        onConfirm={() =>
          publish.mutate(undefined, {
            onSuccess: () => {
              draft.bumpVersion()
              setPublishOpen(false)
            },
          })
        }
      />
    </AdminPage>
  )
}
