import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import {
  ArrowLeft,
  CalendarClock,
  FileText,
  GripVertical,
  Handshake,
  History,
  Mail,
  Paperclip,
  Plus,
  Trash2,
  User,
} from 'lucide-react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelNote } from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import { adminBookingQuery } from '#/frontend/features/booking/booking-queries'
import {
  LANGUAGE_LABEL,
  SOURCE_LABEL,
  avatarHue,
  formatBytes,
  formatDateTime,
  initialsOf,
  timeAgo,
} from '#/frontend/features/inbox/inbox-format'
import { personQuery } from '#/frontend/features/inbox/inbox-queries'
import { money } from '#/frontend/features/leads/lead-format'
import {
  useAddLine,
  useCreateDeal,
  useDeleteLine,
  leadFileQuery,
  leadsQuery,
} from '#/frontend/features/leads/lead-queries'
import { useBlockOrder, type BlockKey } from '#/frontend/features/leads/use-block-order'
import { usePrefetch } from '#/frontend/lib/prefetch'
import { cn } from '#/frontend/lib/utils'
import type { LeadFile } from '#/shared/types/lead.types'
import { DealCard } from './DealCard'

/**
 * One person's file — the screen he asked for first: *«ملف كامل لكل شخص»*.
 *
 * Six blocks, and he can drag them into the order he reads them in. Nothing
 * here is a second copy of anything: the letters, the notes and the person's
 * own details are the inbox's records, read through the same projection, and
 * the calls come from the booking system as **read-only** rows. What this
 * section owns is the deals and the history.
 */
export function PersonFile({ personId }: { personId: string }) {
  const file = useQuery(leadFileQuery(personId))
  const { containerRef, order } = useBlockOrder(file.isSuccess)

  // The waiting screen is drawn in **his** saved order, so the six blocks do
  // not shuffle themselves the moment the file lands.
  if (file.isPending) return <FileSkeleton order={order} />

  if (file.isError) {
    return (
      <AdminPage width="narrow">
        <PageHeader back={<BackLink />} title="This file could not be opened." />

        <Panel>
          <PanelNote tone="error">
            <p role="alert">{(file.error as Error).message}</p>
            <Button onClick={() => void file.refetch()} size="sm" variant="outline">
              Try again
            </Button>
          </PanelNote>
        </Panel>
      </AdminPage>
    )
  }

  // A real check rather than a `!`: a query can hand back no data without
  // being pending or failed — a refetch that was cancelled, for one — and the
  // assertion turned that into a blank screen with a stack trace on it.
  if (!file.data) return <FileSkeleton order={order} />

  const data = file.data
  const person = data.person

  const blocks: Record<BlockKey, React.ReactNode> = {
    deals: <DealsBlock file={data} />,
    person: <PersonBlock file={data} />,
    letters: <LettersBlock file={data} />,
    calls: <CallsBlock file={data} />,
    files: <FilesBlock file={data} />,
    history: <HistoryBlock file={data} />,
  }

  return (
    <AdminPage width="narrow">
      <PageHeader
        back={<BackLink />}
        title={
          <span className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-2xl text-sm font-semibold text-white"
              style={{ backgroundColor: `hsl(${avatarHue(person.email)} 58% 45%)` }}
            >
              {initialsOf(person.name)}
            </span>
            <span dir="auto" className="min-w-0 truncate">
              {person.name}
            </span>
          </span>
        }
        description={
          <span dir="auto" className="block truncate">
            {person.company ? `${person.company} · ` : ''}
            {person.email}
          </span>
        }
        actions={<WriteButton personId={person.id} />}
      />

      {/*
        Fixed slots, moving contents — Swapy's own model. The slot ids never
        change; which block sits in which slot is what he drags, and what is
        remembered for next time.
      */}
      <div ref={containerRef} className="flex flex-col gap-4">
        {order.map((key, index) => (
          <div key={`slot-${index}`} data-swapy-slot={`slot-${index}`}>
            {blocks[key]}
          </div>
        ))}
      </div>
    </AdminPage>
  )
}

/** The one action in the header: write to this person, in the inbox. */
function WriteButton({ personId }: { personId: string }) {
  const prefetch = usePrefetch()

  return (
    <Button asChild className="rounded-full" size="sm" variant="outline">
      <Link to="/admin/inbox/$personId" params={{ personId }} {...prefetch(personQuery(personId))}>
        <Mail aria-hidden="true" />
        Write
      </Link>
    </Button>
  )
}

function BackLink() {
  const prefetch = usePrefetch()

  return (
    <Link
      to="/admin/leads"
      // The list he came from, on the filter it opens itself with.
      {...prefetch(leadsQuery('ALL', ''))}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex w-fit items-center gap-1 rounded-md text-xs motion-safe:transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <ArrowLeft aria-hidden="true" className="size-3.5" />
      All people
    </Link>
  )
}

/** Roughly what each block will be worth in height once it has its contents. */
const BLOCK_HEIGHT: Record<BlockKey, string> = {
  deals: 'min-h-44',
  person: 'min-h-36',
  letters: 'min-h-32',
  calls: 'min-h-20',
  files: 'min-h-20',
  history: 'min-h-32',
}

/**
 * The file before it arrives: the same six blocks, in the same saved order, at
 * about the heights they will have — so the screen does not rebuild itself
 * under his eyes when the request comes back.
 */
function FileSkeleton({ order }: { order: BlockKey[] }) {
  return (
    <AdminPage width="narrow">
      <SkeletonScreen className="flex flex-col gap-6" label="Loading this person's file">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-20" />

          <div className="flex items-center gap-3">
            <Skeleton className="size-11 shrink-0 rounded-2xl" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="mt-2 h-3 w-64" />
            </div>
            <Skeleton className="h-8 w-24 shrink-0 rounded-full" />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {order.map((key) => (
            <Panel className="overflow-hidden" key={key}>
              <div className="border-border flex items-center gap-2 border-b px-5 py-3">
                <Skeleton className="size-4 shrink-0 rounded" />
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="ms-auto size-4 rounded" />
              </div>

              <div className={cn('px-5 py-4', BLOCK_HEIGHT[key])}>
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="mt-3 h-3 w-1/2" />
                <Skeleton className="mt-3 h-3 w-3/5" />
              </div>
            </Panel>
          ))}
        </div>
      </SkeletonScreen>
    </AdminPage>
  )
}

/**
 * One block: a title, a count, a handle to drag it by, and its contents.
 *
 * The handle is explicit rather than the whole card being draggable — a file
 * full of text fields that start a drag when you try to select a word is
 * worse than no dragging at all.
 */
function Block({
  id,
  title,
  count,
  icon: Icon,
  children,
}: {
  id: BlockKey
  title: string
  count?: number
  icon: typeof User
  children: React.ReactNode
}) {
  return (
    <Panel asChild className="overflow-hidden">
      <section data-swapy-item={id}>
        <header className="border-border flex items-center gap-2 border-b px-5 py-3">
          <Icon aria-hidden="true" className="text-muted-foreground size-4" />
          <h2 className="text-[11px] font-semibold tracking-widest uppercase">{title}</h2>
          {count === undefined ? null : (
            <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-[10px] tabular-nums">
              {count}
            </span>
          )}
          <span
            data-swapy-handle
            role="button"
            tabIndex={-1}
            aria-label={`Drag ${title}`}
            className="text-muted-foreground/50 hover:text-muted-foreground ms-auto cursor-grab motion-safe:transition-colors active:cursor-grabbing"
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </span>
        </header>

        <div className="px-5 py-4">{children}</div>
      </section>
    </Panel>
  )
}

/* -------------------------------------------------------------------------- */
/* Deals                                                                      */
/* -------------------------------------------------------------------------- */

function DealsBlock({ file }: { file: LeadFile }) {
  const create = useCreateDeal(file.person.id)
  const [isOpening, setIsOpening] = useState(false)
  const [title, setTitle] = useState('')
  const [build, setBuild] = useState('')
  const [monthly, setMonthly] = useState('')

  return (
    <Block id="deals" title="Deals" count={file.deals.length} icon={Handshake}>
      <div className="flex flex-col gap-3">
        {file.deals.map((deal) => (
          <DealCard
            key={deal.id}
            personId={file.person.id}
            personName={file.person.name}
            deal={deal}
          />
        ))}

        {file.deals.length === 0 && !isOpening ? (
          <p className="text-muted-foreground text-sm">
            Nothing is being sold to {file.person.name.split(' ')[0]} yet. A letter is not a
            deal — you decide which one becomes one.
          </p>
        ) : null}

        {isOpening ? (
          <form
            className="border-border flex flex-col gap-2 rounded-2xl border border-dashed p-4"
            onSubmit={(event) => {
              event.preventDefault()

              if (title.trim() === '') return

              create.mutate(
                {
                  title: title.trim(),
                  buildEuros: build === '' ? 0 : Number(build),
                  monthlyEuros: monthly === '' ? 0 : Number(monthly),
                  nextStep: '',
                  followUpOn: null,
                },
                {
                  onSuccess: () => {
                    setTitle('')
                    setBuild('')
                    setMonthly('')
                    setIsOpening(false)
                  },
                },
              )
            }}
          >
            <Input
              dir="auto"
              value={title}
              autoFocus
              onChange={(event) => setTitle(event.currentTarget.value)}
              placeholder="What is it? e.g. Website — fertige Vorlage"
              aria-label="What the deal is"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                min="0"
                step="10"
                inputMode="numeric"
                className="tabular-nums"
                value={build}
                onChange={(event) => setBuild(event.currentTarget.value)}
                placeholder="Build, once (€)"
                aria-label="Build price, once, in euros"
              />
              <Input
                type="number"
                min="0"
                step="10"
                inputMode="numeric"
                className="tabular-nums"
                value={monthly}
                onChange={(event) => setMonthly(event.currentTarget.value)}
                placeholder="Monthly (€)"
                aria-label="Monthly subscription in euros"
              />
            </div>
            <p className="text-muted-foreground text-[11px]">
              Two prices, never one: the build is paid once and ends, the monthly does not stop.
            </p>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={create.isPending || title.trim() === ''}>
                {create.isPending ? 'Opening…' : 'Open the deal'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setIsOpening(false)}>
                Cancel
              </Button>
            </div>
            {create.isError ? (
              <p role="alert" className="text-destructive text-sm">
                {(create.error as Error).message}
              </p>
            ) : null}
          </form>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="w-fit rounded-full"
            onClick={() => setIsOpening(true)}
          >
            <Plus aria-hidden="true" />
            {file.deals.length === 0 ? 'Open a deal' : 'Another deal'}
          </Button>
        )}
      </div>
    </Block>
  )
}

/* -------------------------------------------------------------------------- */
/* The person                                                                 */
/* -------------------------------------------------------------------------- */

function PersonBlock({ file }: { file: LeadFile }) {
  const prefetch = usePrefetch()
  const person = file.person

  const rows: Array<[string, string]> = [
    ['Email', person.email],
    ['Phone', person.phone ?? '—'],
    ['Company', person.company ?? '—'],
    ['Language', LANGUAGE_LABEL[person.language]],
    ['Came from', SOURCE_LABEL[person.source] ?? person.source],
    ['First wrote', formatDateTime(person.createdAt)],
  ]

  return (
    <Block id="person" title="Person & notes" icon={User}>
      <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2 text-sm">
            <dt className="text-muted-foreground w-24 shrink-0">{label}</dt>
            <dd dir="auto" className="min-w-0 break-words">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {person.facts.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {person.facts.map((fact) => (
            <span
              key={fact.label}
              className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]"
            >
              {fact.label}: <span className="text-foreground">{fact.value}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4">
        <h3 className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-widest uppercase">
          Notes
        </h3>
        {person.notes.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No notes.{' '}
            <Link
              to="/admin/inbox/$personId"
              params={{ personId: person.id }}
              {...prefetch(personQuery(person.id))}
              className="text-primary hover:underline"
            >
              Write one in the inbox
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {person.notes.map((note) => (
              <li key={note.id} className="ring-panel-border rounded-xl p-3 ring-1">
                <p dir="auto" className="text-sm whitespace-pre-wrap">
                  {note.body}
                </p>
                <p className="text-muted-foreground mt-1 text-[10px]">{timeAgo(note.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Block>
  )
}

/* -------------------------------------------------------------------------- */
/* Letters, calls, files                                                      */
/* -------------------------------------------------------------------------- */

function LettersBlock({ file }: { file: LeadFile }) {
  const prefetch = usePrefetch()
  const person = file.person
  const first =
    person.firstMessage.trim() === ''
      ? null
      : { id: 'first', direction: 'IN' as const, body: person.firstMessage, sentAt: person.createdAt, subject: 'First enquiry' }

  const letters = [
    ...person.messages.map((message) => ({
      id: message.id,
      direction: message.direction,
      body: message.body,
      sentAt: message.sentAt,
      subject: message.subject,
    })),
    ...(first ? [first] : []),
  ].sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))

  return (
    <Block id="letters" title="Letters" count={letters.length} icon={Mail}>
      {letters.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing has passed between you yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {letters.slice(0, 6).map((letter) => (
            <li
              key={letter.id}
              className={cn(
                'border-s-4 ps-3',
                // Blue is him, green is them — the same two colours the inbox
                // uses, so a glance answers "who spoke last" in both places.
                letter.direction === 'OUT' ? 'border-primary' : 'border-emerald-500',
              )}
            >
              <p className="text-muted-foreground flex flex-wrap gap-2 text-[10px]">
                <span
                  className={cn(
                    'font-semibold',
                    letter.direction === 'OUT'
                      ? 'text-primary'
                      : 'text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {letter.direction === 'OUT' ? 'You' : person.name}
                </span>
                <span>{timeAgo(letter.sentAt)}</span>
                {letter.subject ? (
                  <span dir="auto" className="truncate">
                    {letter.subject}
                  </span>
                ) : null}
              </p>
              <p dir="auto" className="mt-0.5 line-clamp-3 text-sm">
                {letter.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {letters.length > 6 ? (
        <Link
          to="/admin/inbox/$personId"
          params={{ personId: person.id }}
          {...prefetch(personQuery(person.id))}
          className="text-primary mt-3 inline-block text-xs hover:underline"
        >
          All {letters.length} in the inbox
        </Link>
      ) : null}
    </Block>
  )
}

function CallsBlock({ file }: { file: LeadFile }) {
  const prefetch = usePrefetch()

  return (
    <Block id="calls" title="Booked calls" count={file.calls.length} icon={CalendarClock}>
      {file.calls.length === 0 ? (
        <p className="text-muted-foreground text-sm">Never booked a call.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {file.calls.map((call) => (
            <li key={call.id} className="flex flex-wrap items-baseline gap-2 text-sm">
              <span dir="auto" className="font-medium">
                {call.title}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatDateTime(call.startsAt)}
              </span>
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px]',
                  call.status === 'CANCELLED'
                    ? 'border-rose-500/30 text-rose-600 dark:text-rose-400'
                    : 'border-border text-muted-foreground',
                )}
              >
                {call.status.toLowerCase()}
              </span>
              <Link
                to="/admin/bookings/$id"
                params={{ id: call.id }}
                // The booking behind the reference, warmed before the click.
                {...prefetch(adminBookingQuery(call.id))}
                className="text-primary text-xs hover:underline"
              >
                {call.reference}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {/* Read-only on purpose: booking is finished, and this section does not
          write a single row into it. */}
      <p className="text-muted-foreground mt-3 text-[11px]">
        Read-only — calls are managed in the calendar.
      </p>
    </Block>
  )
}

function FilesBlock({ file }: { file: LeadFile }) {
  return (
    <Block id="files" title="Files" count={file.files.length} icon={Paperclip}>
      {file.files.length === 0 ? (
        <p className="text-muted-foreground text-sm">No documents either way.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {file.files.map((attachment) => (
            <li key={attachment.id}>
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="ring-panel-border hover:bg-accent/50 focus-visible:ring-ring flex items-center gap-2 rounded-xl p-2.5 ring-1 motion-safe:transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <FileText aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
                {/* A flex wrapper, not a bare span: a block child inside an
                    inline wrapper escapes `overflow: hidden` and the size line
                    gets clipped away. */}
                <span className="flex min-w-0 flex-col">
                  <span dir="auto" className="block truncate text-xs font-medium">
                    {attachment.filename}
                  </span>
                  <span className="text-muted-foreground block text-[10px]">
                    {formatBytes(attachment.bytes)} ·{' '}
                    {attachment.direction === 'IN' ? 'from them' : 'from you'}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Block>
  )
}

/* -------------------------------------------------------------------------- */
/* History                                                                    */
/* -------------------------------------------------------------------------- */

function HistoryBlock({ file }: { file: LeadFile }) {
  const add = useAddLine(file.person.id)
  const remove = useDeleteLine(file.person.id)
  const [line, setLine] = useState('')

  return (
    <Block id="history" title="History" count={file.events.length} icon={History}>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()

          if (line.trim() === '') return

          add.mutate({ body: line.trim(), dealId: null }, { onSuccess: () => setLine('') })
        }}
      >
        <Input
          dir="auto"
          value={line}
          onChange={(event) => setLine(event.currentTarget.value)}
          placeholder="Called him — wants photos of the shop first"
          aria-label="Write what happened"
        />
        <Button type="submit" size="sm" disabled={add.isPending || line.trim() === ''}>
          {add.isPending ? 'Saving…' : 'Add'}
        </Button>
      </form>

      {file.events.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing has happened yet.</p>
      ) : (
        <ol className="flex flex-col">
          {file.events.map((event) => (
            <li key={event.id} className="group flex gap-3 py-1 text-sm">
              <span className="text-muted-foreground w-24 shrink-0 text-[11px] tabular-nums">
                {timeAgo(event.createdAt)}
              </span>
              <span
                dir="auto"
                className={cn('min-w-0 flex-1', event.isAutomatic && 'text-muted-foreground')}
              >
                {/* His own lines are marked, because "who says so" is half the
                    value of a history: the system saw it, or he wrote it. */}
                {event.isAutomatic ? null : <span aria-hidden="true">✎ </span>}
                {event.body}
              </span>
              {event.isAutomatic ? null : (
                <button
                  type="button"
                  onClick={() => remove.mutate(event.id)}
                  aria-label="Remove this line"
                  className="text-muted-foreground/0 group-hover:text-muted-foreground hover:text-destructive focus-visible:text-destructive shrink-0 motion-safe:transition-colors"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </Block>
  )
}

export { money }
