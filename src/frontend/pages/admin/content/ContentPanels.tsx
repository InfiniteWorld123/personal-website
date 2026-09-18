import { useQuery } from '@tanstack/react-query'
import { History, Search, Undo2 } from 'lucide-react'
import { useMemo } from 'react'
import { PanelNote } from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/frontend/components/ui/sheet'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import { codeDefault, editableFields } from '#/frontend/content/editable'
import { contentRevisionsQuery, publishDiffQuery } from '#/frontend/features/content/content-queries'
import type { Language } from '#/frontend/i18n/language'
import type { ContentValue } from '#/shared/types/content.types'
import { LANGUAGE_LABEL, humanizeKey, valueText } from './content-format'

const formatMoment = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

/**
 * The history rows at their real height: the timestamp/key/language line, the
 * sentence that was saved, and the small outline button under it. The heights
 * are the ones `.history-row` and its children actually render at — a block
 * one step short would let the whole sheet jump when the rows land.
 */
function RevisionsSkeleton() {
  return (
    <SkeletonScreen className="history-list" label="Loading the history">
      {Array.from({ length: 5 }, (_, index) => (
        <div className="history-row" key={index}>
          <div className="history-meta">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-7 w-28" />
        </div>
      ))}
    </SkeletonScreen>
  )
}

/** Every saved wording, newest first, each one restorable as a draft. */
export function ContentHistoryPanel({
  open,
  onOpenChange,
  onRevert,
  reverting,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRevert: (revisionId: string) => void
  reverting: boolean
}) {
  const revisions = useQuery(contentRevisionsQuery(open))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="size-4" />
            History
          </SheetTitle>
          <SheetDescription>
            Restoring puts the earlier wording back as a draft. It goes live with your next publish,
            not before.
          </SheetDescription>
        </SheetHeader>

        {revisions.isPending ? <RevisionsSkeleton /> : null}

        {/*
          An unread history and an empty one are the same picture, and the
          empty one says "nothing has ever been rewritten" — which is the
          single most reassuring sentence this panel could tell him falsely.
        */}
        {revisions.isError ? (
          <PanelNote tone="error">
            <div>
              <p className="font-medium">The history could not be loaded.</p>
              <p className="text-muted-foreground mt-1">
                {revisions.error instanceof Error
                  ? revisions.error.message
                  : 'Something went wrong.'}
              </p>
            </div>
            <Button onClick={() => void revisions.refetch()} size="sm" variant="outline">
              Try again
            </Button>
          </PanelNote>
        ) : null}

        {revisions.data ? (
          <div className="history-list">
            {revisions.data.length === 0 ? (
              <p className="panel-note">
                Nothing has been rewritten yet. Every change you save appears here.
              </p>
            ) : null}

            {revisions.data.map((revision) => (
              <div className="history-row" key={revision.id}>
                <div className="history-meta">
                  <time dateTime={revision.createdAt}>{formatMoment(revision.createdAt)}</time>
                  <span className="history-key">{humanizeKey(revision.key)}</span>
                  <span className="history-lang">{LANGUAGE_LABEL[revision.language]}</span>
                </div>
                <p className="history-value">
                  {revision.value === null ? (
                    <em>restored to the original wording</em>
                  ) : (
                    valueText(revision.value)
                  )}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reverting}
                  onClick={() => onRevert(revision.id)}
                >
                  <Undo2 className="size-3.5" />
                  Restore this
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

/**
 * The diff rows at their real height: the key, the old line, the new one.
 *
 * How many is not a guess either. The toolbar counts the unpublished drafts
 * from the snapshot it already holds, and that count is exactly the number of
 * rows this list is about to show, so the sheet opens at the height it will
 * keep. Capped, because past a screenful the scrollbar is the honest signal
 * and eighty grey rows are not.
 */
function DiffSkeleton({ expected }: { expected: number }) {
  return (
    <SkeletonScreen className="diff-list" label="Loading what is about to change">
      {Array.from({ length: Math.min(8, Math.max(1, expected)) }, (_, index) => (
        <div className="diff-row" key={index}>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      ))}
    </SkeletonScreen>
  )
}

/** What publishing is about to change, in the visitor's words then yours. */
export function ContentPublishDialog({
  open,
  onOpenChange,
  onConfirm,
  publishing,
  expected,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  publishing: boolean
  /** How many drafts the toolbar has already counted, for the skeleton's height. */
  expected: number
}) {
  const diff = useQuery(publishDiffQuery(open))
  const entries = diff.data ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Before publishing</SheetTitle>
          {/*
            The count is read out of the list, so while there is no list there
            is no count either — "0 changes go live together" above a panel
            that simply has not loaded is the worst sentence on this screen.
          */}
          <SheetDescription>
            {diff.isPending
              ? 'Reading what is about to change…'
              : diff.isError
                ? 'What is about to change could not be read.'
                : entries.length === 1
                  ? 'One change goes live.'
                  : `${entries.length} changes go live together.`}
          </SheetDescription>
        </SheetHeader>

        {diff.isPending ? <DiffSkeleton expected={expected} /> : null}

        {diff.isError ? (
          <PanelNote tone="error">
            <div>
              <p className="font-medium">The changes could not be listed.</p>
              <p className="text-muted-foreground mt-1">
                {diff.error instanceof Error ? diff.error.message : 'Something went wrong.'}
              </p>
              <p className="text-muted-foreground mt-3 max-w-prose">
                Nothing is published from a list you could not read.
              </p>
            </div>
            <Button onClick={() => void diff.refetch()} size="sm" variant="outline">
              Try again
            </Button>
          </PanelNote>
        ) : null}

        {diff.data ? (
          <div className="diff-list">
            {entries.length === 0 ? (
              <p className="panel-note">Nothing is waiting to be published.</p>
            ) : null}

            {entries.map((entry) => (
              <div className="diff-row" key={`${entry.key}:${entry.language}`}>
                <span className="diff-key">
                  {humanizeKey(entry.key)} · {LANGUAGE_LABEL[entry.language]}
                </span>
                <span className="diff-from">{valueText(entry.from ?? undefined) || '—'}</span>
                <span className="diff-to">{valueText(entry.to)}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="panel-actions">
          <Button disabled={publishing || entries.length === 0} onClick={onConfirm}>
            {publishing ? 'Publishing…' : `Publish ${entries.length}`}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Not yet
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Search across every editable string in every language, because the thing you
 * want to change is usually a sentence you remember rather than a page you can
 * name.
 */
export function ContentSearchPanel({
  open,
  onOpenChange,
  term,
  onTermChange,
  language,
  currentValue,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  term: string
  onTermChange: (term: string) => void
  language: Language
  currentValue: (key: string) => ContentValue | undefined
  onPick: (key: string) => void
}) {
  const matches = useMemo(() => {
    const needle = term.trim().toLowerCase()
    if (needle.length < 2) return []

    return editableFields
      .filter((field) => {
        const value = valueText(currentValue(field.key) ?? codeDefault(field.key, language))

        return value.toLowerCase().includes(needle) || field.key.toLowerCase().includes(needle)
      })
      .slice(0, 60)
  }, [term, currentValue, language])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Search className="size-4" />
            Find a sentence
          </SheetTitle>
          <SheetDescription>
            Searches every editable string on the site, not only this page.
          </SheetDescription>
        </SheetHeader>

        <div className="search-body">
          <Input
            autoFocus
            className="bg-panel"
            value={term}
            placeholder="Type part of a sentence…"
            onChange={(event) => onTermChange(event.target.value)}
          />

          {term.trim().length >= 2 && matches.length === 0 ? (
            <p className="panel-note">Nothing matches that.</p>
          ) : null}

          {matches.map((field) => (
            <button
              type="button"
              className="search-hit"
              key={field.key}
              onClick={() => onPick(field.key)}
            >
              <span className="search-hit-key">{humanizeKey(field.key)}</span>
              <span className="search-hit-value">
                {valueText(currentValue(field.key) ?? codeDefault(field.key, language))}
              </span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
