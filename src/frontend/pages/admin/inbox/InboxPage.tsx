import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Archive, Mail, Paperclip, PenLine, Search, Settings2, Star } from 'lucide-react'
import { Input } from '#/frontend/components/ui/input'
import { Button } from '#/frontend/components/ui/button'
import { inboxQuery, useSetStarred } from '#/frontend/features/inbox/inbox-queries'
import { avatarHue, initialsOf, timeAgo } from '#/frontend/features/inbox/inbox-format'
import { INBOX_LENSES, type InboxLens } from '#/shared/validation/inbox.validation'
import type { LetterKind } from '#/shared/validation/invoice.validation'
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
  letterFor?: { invoiceId: string; kind: LetterKind } | null
}) {
  const navigate = useNavigate()
  const [lens, setLens] = useState<InboxLens>('inbox')
  const [search, setSearch] = useState('')

  const rows = useQuery(inboxQuery(lens, search))
  const items = rows.data ?? []

  const open = (id: string) =>
    void navigate({ to: '/admin/inbox/$personId', params: { personId: id } })

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-125 w-full flex-col gap-4">
      {/* The heading, search and tabs belong to the list. On a phone with a
          conversation open the list is gone, so they go with it. */}
      <header className={cn('flex flex-wrap items-center gap-3', personId && 'hidden lg:flex')}>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>

        <div className="relative ms-auto w-full max-w-xs">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Name, address, words, a file name"
            className="ps-9"
            aria-label="Search the inbox"
          />
        </div>

        <Button asChild size="sm">
          <Link to="/admin/inbox/new">
            <PenLine aria-hidden="true" />
            Write
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/inbox/settings" aria-label="Inbox settings">
            <Settings2 aria-hidden="true" />
          </Link>
        </Button>
      </header>

      <nav
        aria-label="Inbox filters"
        className={cn('flex flex-wrap gap-1.5', personId && 'hidden lg:flex')}
      >
        {INBOX_LENSES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setLens(value)}
            aria-pressed={lens === value}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              lens === value
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:border-border hover:text-foreground border-transparent',
            )}
          >
            {LENS_LABEL[value]}
          </button>
        ))}
      </nav>

      <div className="border-border grid min-h-0 flex-1 overflow-hidden rounded-2xl border lg:grid-cols-[21rem_minmax(0,1fr)]">
        <div
          className={cn(
            'border-border min-h-0 overflow-y-auto lg:border-e',
            personId ? 'hidden lg:block' : 'block',
          )}
        >
          {rows.isPending ? (
            <p className="text-muted-foreground p-6 text-sm">Loading…</p>
          ) : items.length === 0 ? (
            <Empty lens={lens} search={search} />
          ) : (
            <ul>
              {items.map((row) => (
                <li key={row.id}>
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
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-10 text-center">
              <Mail aria-hidden="true" className="size-8 opacity-40" />
              <p className="text-sm">Pick someone to read and answer.</p>
            </div>
          )}
        </div>
      </div>
    </div>
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
  const star = useSetStarred(row.id)
  const unread = row.unreadCount > 0

  return (
    <div
      className={cn(
        'border-border hover:bg-muted/60 relative flex border-b transition-colors',
        active && 'bg-accent hover:bg-accent',
      )}
    >
      {active ? (
        <span aria-hidden="true" className="bg-primary absolute inset-y-0 start-0 w-0.5" />
      ) : null}

      <button
        type="button"
        onClick={() => onOpen(row.id)}
        className="flex min-w-0 flex-1 gap-3 p-3 text-start"
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
            className={cn('mt-0.5 block truncate text-xs', unread ? 'font-semibold' : 'text-foreground/80')}
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
        className="text-muted-foreground hover:text-amber-500 shrink-0 self-start p-3 transition-colors"
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
 * An empty list says which kind of empty it is: "nothing matched" and "nobody
 * has written yet" call for different next moves.
 */
function Empty({ lens, search }: { lens: InboxLens; search: string }) {
  if (search !== '') {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 p-10 text-center">
        <Search aria-hidden="true" className="size-7 opacity-40" />
        <p className="text-sm">Nothing matches “{search}”.</p>
      </div>
    )
  }

  const line = {
    inbox: 'Nobody has written yet.',
    unread: 'Everything is read.',
    starred: 'Nothing starred yet.',
    archived: 'Nothing filed yet.',
  }[lens]

  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 p-10 text-center">
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
    </div>
  )
}
