import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Archive, Mail, Paperclip, PenLine, Search, Settings2, Star } from 'lucide-react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelNote } from '#/frontend/components/admin/Panel'
import { Input } from '#/frontend/components/ui/input'
import { Button } from '#/frontend/components/ui/button'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import {
  inboxQuery,
  personQuery,
  settingsQuery,
  useSetStarred,
} from '#/frontend/features/inbox/inbox-queries'
import { avatarHue, initialsOf, timeAgo } from '#/frontend/features/inbox/inbox-format'
import { usePrefetch } from '#/frontend/lib/prefetch'
import { INBOX_LENSES, type InboxLens } from '#/shared/validation/inbox.validation'
import type { LetterTarget } from '#/shared/types/invoice.types'
import type { InboxRow } from '#/shared/types/inbox.types'
import { cn } from '#/frontend/lib/utils'
import { Conversation } from './Conversation'

const LENS_LABEL: Record<InboxLens, string> = {
  inbox: 'Inbox',
  unread: 'Unread',
  starred: 'Starred',
  archived: 'Archived',
}

/**
 * The inbox: people on the left, one conversation on the right.
 *
 * **A row is a person, not a letter.** He settled that before anything was
 * built — he opens a name and reads everything that has passed between them,
 * the way a messaging app works rather than a mail client.
 *
 * Two rules that look small and are not:
 * - **Opening a conversation does not mark it read.** Marking read is a button.
 * - **Nothing archives itself after a reply.** An answered conversation stays
 *   in the list, marked "replied", until he files it.
 *
 * On a phone the two columns become one — the list, or the conversation, never
 * a squeezed pair. He works from his phone, so that is the primary layout.
 *
 * The redesign kept that shape exactly. What changed is the ground under it:
 * the pair of columns is now one panel floating on the canvas rather than a
 * hairline box, the list arrives as rows rather than as the word "Loading",
 * and pointing at a name fetches the conversation before the click.
 */
export function InboxPage({
  personId,
  letterFor = null,
}: {
  personId: string | null
  /**
   * A letter the invoicing section is handing over: which document the
   * composer should open already written and already attached.
   */
  letterFor?: LetterTarget | null
}) {
  const navigate = useNavigate()
  const prefetch = usePrefetch()
  const [lens, setLens] = useState<InboxLens>('inbox')
  const [search, setSearch] = useState('')

  const rows = useQuery(inboxQuery(lens, search))
  const items = rows.data ?? []

  const open = (id: string) =>
    void navigate({ to: '/admin/inbox/$personId', params: { personId: id } })

  /*
    The one page in the admin measured against the window rather than against
    its own contents, so it has to know exactly what the shell takes: 1rem of
    page padding, the 4rem top bar, the 1.25rem gap under it and 1.5rem of
    tail below `main` — 1.25rem of padding instead of 1rem from `lg` up.
    `dvh` rather than `vh` because on a phone the address bar is part of the
    window until it is not, and a mailbox one bar taller than the screen
    scrolls the whole desk under itself.
  */
  return (
    <AdminPage
      className="h-[calc(100dvh-8.75rem)] min-h-125 lg:h-[calc(100dvh-9.25rem)]"
      width="wide"
    >
      {/* The heading, search and tabs belong to the list. On a phone with a
          conversation open the list is gone, so they go with it. */}
      <PageHeader
        className={cn(personId && 'hidden lg:flex')}
        title="Inbox"
        actions={
          <>
            <Button asChild className="rounded-full" size="sm">
              <Link to="/admin/inbox/new">
                <PenLine aria-hidden="true" />
                Write
              </Link>
            </Button>
            <Button asChild className="rounded-full" size="sm" variant="outline">
              <Link
                to="/admin/inbox/settings"
                aria-label="Inbox settings"
                // The signature and the ready replies, warmed on the way there.
                {...prefetch(settingsQuery())}
              >
                <Settings2 aria-hidden="true" />
              </Link>
            </Button>
          </>
        }
      />

      <div className={cn('flex flex-wrap items-center gap-3', personId && 'hidden lg:flex')}>
        <div className="relative w-full max-w-xs">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Name, address, words, a file name"
            className="bg-panel ps-9"
            aria-label="Search the inbox"
          />
        </div>

        <nav aria-label="Inbox filters" className="flex flex-wrap gap-1.5">
          {INBOX_LENSES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setLens(value)}
              aria-pressed={lens === value}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium motion-safe:transition-colors',
                lens === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-panel text-muted-foreground hover:border-primary/50',
              )}
            >
              {LENS_LABEL[value]}
            </button>
          ))}
        </nav>
      </div>

      {/* One surface holding both columns, so the pair reads as a single
          object on the canvas rather than two regions of a frame. */}
      <Panel className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[21rem_minmax(0,1fr)]">
        <div
          className={cn(
            'border-border/60 min-h-0 overflow-y-auto lg:border-e',
            personId ? 'hidden lg:block' : 'block',
          )}
        >
          {rows.isPending ? (
            <RowsSkeleton />
          ) : rows.isError ? (
            /*
              A failed request and an empty mailbox used to look identical: the
              list fell through to "Nobody has written yet", which is the one
              sentence a mailbox must never say when it simply could not ask.
            */
            <PanelNote tone="error">
              <div>
                <p className="font-medium">The inbox could not be loaded.</p>
                <p className="text-muted-foreground mt-1">
                  {rows.error instanceof Error ? rows.error.message : 'Something went wrong.'}
                </p>
              </div>
              <Button onClick={() => void rows.refetch()} size="sm" variant="outline">
                Try again
              </Button>
            </PanelNote>
          ) : items.length === 0 ? (
            <Empty lens={lens} search={search} />
          ) : (
            <ul>
              {items.map((row) => (
                <li className="border-border/60 border-b last:border-b-0" key={row.id}>
                  <Row row={row} active={row.id === personId} lens={lens} onOpen={open} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cn('min-h-0', personId ? 'block' : 'hidden lg:block')}>
          {personId ? (
            <Conversation personId={personId} letterFor={letterFor} />
          ) : (
            <PanelNote className="h-full justify-center gap-2">
              <Mail aria-hidden="true" className="size-8 opacity-40" />
              <p className="text-sm">Pick someone to read and answer.</p>
            </PanelNote>
          )}
        </div>
      </Panel>
    </AdminPage>
  )
}

function Row({
  row,
  active,
  lens,
  onOpen,
}: {
  row: InboxRow
  active: boolean
  lens: InboxLens
  onOpen: (id: string) => void
}) {
  const prefetch = usePrefetch()
  const star = useSetStarred(row.id)
  const unread = row.unreadCount > 0

  return (
    <div
      className={cn(
        'hover:bg-accent/50 relative flex motion-safe:transition-colors',
        active && 'bg-accent hover:bg-accent',
      )}
    >
      {active ? (
        <span aria-hidden="true" className="bg-primary absolute inset-y-0 start-0 w-0.5" />
      ) : null}

      <button
        type="button"
        onClick={() => onOpen(row.id)}
        // A row is not a Link — it navigates by hand — so the warming goes on
        // the control that carries the intent. The thread, and the settings
        // the composer under it reads, both arrive before the click.
        {...prefetch(personQuery(row.id), settingsQuery())}
        className="focus-visible:ring-ring flex min-w-0 flex-1 gap-3 py-3.5 pe-2 ps-5 text-start focus-visible:ring-2 focus-visible:-outline-offset-2 focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
          style={{ backgroundColor: `hsl(${avatarHue(row.email)} 58% 45%)` }}
        >
          {initialsOf(row.name)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            {/*
              `dir="auto"` on every field that can hold German or Arabic, and
              `block` on every truncating one: `text-overflow: ellipsis` does
              nothing at all on an inline element, so without it a German
              subject overflows instead of ending in an ellipsis.
            */}
            <span dir="auto" className="block truncate text-[13px] font-semibold">
              {row.name}
            </span>
            <time className="text-muted-foreground ms-auto shrink-0 text-[10px]">
              {timeAgo(row.lastMessageAt)}
            </time>
          </span>

          <span
            dir="auto"
            className={cn(
              'mt-0.5 block truncate text-xs',
              unread ? 'font-semibold' : 'text-foreground/80',
            )}
          >
            {row.subject || row.preview || 'No subject'}
          </span>

          {row.subject && row.preview ? (
            <span dir="auto" className="text-muted-foreground mt-0.5 block truncate text-[11px]">
              {row.preview}
            </span>
          ) : null}

          <span className="mt-1.5 flex items-center gap-2">
            {/* A search reaches into the archive, so a row found there has to
                say where it came from — otherwise filing something appears to
                have done nothing. */}
            {row.archived && lens !== 'archived' ? (
              <span className="text-muted-foreground flex items-center gap-0.5 text-[10px]">
                <Archive aria-hidden="true" className="size-3" />
                filed
              </span>
            ) : null}

            {row.replied ? (
              <span className="rounded-full border border-emerald-500/40 px-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                replied
              </span>
            ) : null}

            {row.attachmentCount > 0 ? (
              <span className="text-muted-foreground flex items-center gap-0.5 text-[10px]">
                <Paperclip aria-hidden="true" className="size-3" />
                {row.attachmentCount}
              </span>
            ) : null}

            {unread ? (
              <span
                className="bg-primary ms-auto size-1.5 shrink-0 rounded-full"
                aria-label={`${row.unreadCount} unread`}
              />
            ) : null}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => star.mutate(!row.starred)}
        disabled={star.isPending}
        aria-pressed={row.starred}
        aria-label={row.starred ? `Unstar ${row.name}` : `Star ${row.name}`}
        className="text-muted-foreground hover:text-amber-500 focus-visible:ring-ring shrink-0 self-start py-3.5 pe-4 ps-1 motion-safe:transition-colors focus-visible:ring-2 focus-visible:-outline-offset-2 focus-visible:outline-none"
      >
        <Star
          aria-hidden="true"
          className={cn('size-4', row.starred && 'fill-amber-400 text-amber-500')}
        />
      </button>
    </div>
  )
}

/**
 * The same rows, not yet arrived.
 *
 * Avatar, name, subject, preview and the badge strip, at the row height the
 * real list uses — so when the names land nothing under the pointer moves.
 * Seven of them, which is roughly what the column holds on a laptop.
 */
function RowsSkeleton() {
  return (
    <SkeletonScreen label="Loading the inbox">
      <ul>
        {Array.from({ length: 7 }, (_, index) => (
          <li className="border-border/60 flex border-b last:border-b-0" key={index}>
            {/* The row's own two parts, at their own widths: the button that
                opens the thread, and the star beside it. Without the second
                one the time above would sit where no time ever sits, and
                would then step sideways as the names arrive. */}
            <div className="flex min-w-0 flex-1 gap-3 py-3.5 pe-2 ps-5">
              <Skeleton className="mt-0.5 size-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="ms-auto h-2.5 w-8" />
                </div>
                <Skeleton className="mt-2 h-3 w-44" />
                <Skeleton className="mt-1.5 h-2.5 w-36" />
                <Skeleton className="mt-2.5 h-2.5 w-16" />
              </div>
            </div>
            <div className="shrink-0 self-start py-3.5 pe-4 ps-1">
              <Skeleton className="size-4 rounded" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonScreen>
  )
}

/**
 * An empty list says which kind of empty it is: "nothing matched" and "nobody
 * has written yet" call for different next moves.
 */
function Empty({ lens, search }: { lens: InboxLens; search: string }) {
  if (search !== '') {
    return (
      <PanelNote className="gap-2">
        <Search aria-hidden="true" className="size-7 opacity-40" />
        <p className="text-sm">Nothing matches “{search}”.</p>
      </PanelNote>
    )
  }

  const line = {
    inbox: 'Nobody has written yet.',
    unread: 'Everything is read.',
    starred: 'Nothing starred yet.',
    archived: 'Nothing filed yet.',
  }[lens]

  return (
    <PanelNote className="gap-2">
      {lens === 'starred' ? (
        <Star aria-hidden="true" className="size-7 opacity-40" />
      ) : (
        <Mail aria-hidden="true" className="size-7 opacity-40" />
      )}
      <p className="text-sm">{line}</p>
      {lens === 'inbox' ? (
        <Link to="/admin/inbox/new" className="text-primary text-sm font-medium hover:underline">
          Write to someone
        </Link>
      ) : null}
    </PanelNote>
  )
}
