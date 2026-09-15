import { useQuery } from '@tanstack/react-query'
import { Eye, History, Lock, Pencil, Search, Send } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Button } from '#/frontend/components/ui/button'
import { editableFieldByKey, editableFields, editablePages } from '#/frontend/content/editable'
import {
  contentSnapshotQuery,
  useMarkReviewed,
  usePublishContent,
  useResetField,
  useRevertRevision,
} from '#/frontend/features/content/content-queries'
import { ContentOverlayContext } from '#/frontend/features/content/content-overlay'
import { useContentDraft } from '#/frontend/features/content/use-content-draft'
import type { ProjectEntry } from '#/frontend/features/work/project-list'
import { type Language, languages } from '#/frontend/i18n/language'
import { cn } from '#/frontend/lib/utils'
import type { PublicPostSummary } from '#/shared/types/post.types'
import { ContentFieldRow } from './ContentFieldRow'
import { ContentHistoryPanel, ContentPublishDialog, ContentSearchPanel } from './ContentPanels'
import { ContentPreview } from './ContentPreview'
import { PAGE_LABEL, sectionLabel, sectionOf } from './content-format'

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
export function ContentPage({
  entries,
  posts,
}: {
  entries: ProjectEntry[]
  posts: PublicPostSummary[]
}) {
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
    <div className="content-editor">
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

          <span className="pill pill-draft">{draftCount} unpublished</span>

          <Button
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

          <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)}>
            <History className="size-4" />
            History
          </Button>

          <Button
            size="sm"
            disabled={draftCount === 0}
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

      {draft.saveError ? (
        <p className="content-error" role="alert">
          That change was not saved: {draft.saveError.message}
        </p>
      ) : null}

      <div className="content-layout">
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

        <div className="content-pane">
          {snapshot.isPending ? (
            <p className="panel-note">Loading the site's copy…</p>
          ) : preview ? (
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
                <section className="field-group" key={section}>
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
              ))}
            </>
          )}
        </div>
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
    </div>
  )
}
