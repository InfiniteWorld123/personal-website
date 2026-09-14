import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  ChevronRight,
  Clock3,
  MailOpen,
  Paperclip,
  PencilLine,
  Send,
  ShieldAlert,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { Badge } from '#/frontend/components/ui/badge'
import { Button } from '#/frontend/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/frontend/components/ui/dialog'
import { Textarea } from '#/frontend/components/ui/textarea'
import { RichTextView } from '#/frontend/features/blog/PostBody'
import { ReplyEditor } from '#/frontend/features/inbox/ReplyEditor'
import {
  useAddLeadNote,
  useDeleteLeadNote,
  useReplyToLead,
  useSetLeadArchived,
  useSetLeadJunk,
  useSetLeadRead,
  useSetLeadStatus,
} from '#/frontend/features/inbox/inbox-queries'
import { cn } from '#/frontend/lib/utils'
import type { AdminLeadDetail, InboxSettings } from '#/shared/types/lead.types'
import { LEAD_SIGN_OFF, LEAD_SNIPPETS, REPLY_PLACEHOLDER, SNIPPET_LABELS } from '#/shared/lead-copy'
import { LEAD_STATUSES, type LeadStatus } from '#/shared/validation/lead.validation'
import {
  emptyRichTextDoc,
  isRichTextEmpty,
  richTextToPlainText,
  type RichTextDoc,
} from '#/shared/validation/rich-text'
import {
  formatBerlin,
  formatBytes,
  formatFull,
  initialsOf,
  LANGUAGE_LABEL,
  STATUS_LABEL,
} from './inbox-format'

const EVENT_LABEL: Record<string, string> = {
  ARRIVED: 'Arrived',
  NOTIFIED: 'Notification sent',
  OPENED: 'Opened',
  STATUS: 'Status set to',
  REPLIED: 'Replied',
  INBOUND: 'They answered',
  NOTE: 'Note added',
  ARCHIVED: 'Archived',
  UNARCHIVED: 'Back in the inbox',
  JUNK: 'Marked as junk',
  NOT_JUNK: 'Not junk after all',
}

/**
 * A block that opens only when asked. Everything the owner does not need while
 * reading — the facts, the calls — folds away, so the letter starts near the
 * top of the pane rather than below a wall of cards.
 */
function Fold({
  title,
  count,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string
  count?: number
  icon: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details className="border-border group rounded-lg border" open={defaultOpen}>
      <summary className="text-muted-foreground hover:bg-muted/60 flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-[0.68rem] font-medium tracking-widest uppercase [&::-webkit-details-marker]:hidden">
        {icon}
        {title}
        {count === undefined ? null : <Badge variant="outline" className="text-[0.6rem]">{count}</Badge>}
        <ChevronRight aria-hidden="true" className="ms-auto size-3.5 transition-transform group-open:rotate-90 rtl:rotate-180 rtl:group-open:-rotate-90" />
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  )
}

export function LeadReadingPane({
  lead,
  settings,
  onBack,
}: {
  lead: AdminLeadDetail
  settings: InboxSettings
  onBack?: () => void
}) {
  const { preferences, signatures, canSendMail, canReceiveMail } = settings

  const setStatus = useSetLeadStatus()
  const setRead = useSetLeadRead()
  const setArchived = useSetLeadArchived()
  const setJunk = useSetLeadJunk()
  const addNote = useAddLeadNote()
  const deleteNote = useDeleteLeadNote()
  const reply = useReplyToLead()

  const [doc, setDoc] = useState<RichTextDoc>(emptyRichTextDoc)
  const [isComposing, setIsComposing] = useState(false)
  const [note, setNote] = useState('')
  const [panel, setPanel] = useState<'notes' | 'history' | null>(null)

  // A draft belongs to the message it was started in, never to the next one.
  useEffect(() => {
    setDoc(emptyRichTextDoc())
    setNote('')
    setIsComposing(false)
    setPanel(null)
  }, [lead.id])

  const rtl = lead.language === 'ar'
  const signature = signatures[lead.language]?.trim() || LEAD_SIGN_OFF[lead.language]

  const facts = [
    { label: 'Company', value: lead.company },
    { label: 'Phone', value: lead.phone },
    { label: 'Project', value: lead.projectType },
    { label: 'Budget', value: lead.budget },
    { label: 'Timeline', value: lead.timeline },
    { label: 'Language', value: LANGUAGE_LABEL[lead.language] ?? lead.language },
  ].filter((fact) => fact.value)

  const thread = preferences.inbound
    ? lead.messages
    : lead.messages.filter((message) => message.direction === 'OUT')

  const sendReply = () => {
    if (isRichTextEmpty(doc)) return

    reply.mutate(
      { id: lead.id, input: { subject: lead.subject, body: richTextToPlainText(doc), doc } },
      {
        onSuccess: () => {
          setDoc(emptyRichTextDoc())
          setIsComposing(false)
        },
      },
    )
  }

  const insert = (text: string) =>
    setDoc((current) => ({
      type: 'doc',
      content: [...current.content, { type: 'paragraph', content: [{ type: 'text', text }] }],
    }))

  return (
    <div className="flex h-full min-h-0 flex-col">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground border-border flex items-center gap-2 border-b px-4 py-3 text-sm lg:hidden"
        >
          <Undo2 aria-hidden="true" className="size-4" />
          All messages
        </button>
      ) : null}

      {/* Everything above the composer scrolls; the composer does not. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn('flex flex-col gap-3 p-4', rtl && 'text-right')} dir={rtl ? 'rtl' : 'ltr'}>
          <div className="border-border flex items-start gap-3 border-b pb-3">
            {preferences.initials ? (
              <span className="bg-accent text-accent-foreground grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold">
                {initialsOf(lead.name)}
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold" title={lead.name} dir="auto">
                {lead.name}
              </p>
              <a
                href={`mailto:${lead.email}`}
                dir="ltr"
                title={lead.email}
                className="text-muted-foreground hover:text-foreground block truncate text-sm"
              >
                {lead.email}
              </a>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge variant="outline" className={lead.source === 'BOOKING' ? 'border-primary/40 text-primary' : ''}>
                {lead.source === 'BOOKING' ? 'Booking' : 'Contact form'}
              </Badge>
              <p className="text-muted-foreground text-xs whitespace-nowrap" title={formatFull(lead.createdAt)}>
                {formatBerlin(lead.createdAt)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground me-1 text-xs">Status</span>
              {LEAD_STATUSES.map((status: LeadStatus) => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={lead.status === status}
                  onClick={() => setStatus.mutate({ id: lead.id, status })}
                  className={cn(
                    'border-border rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                    lead.status === status
                      ? 'bg-primary border-primary text-primary-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent',
                  )}
                >
                  {STATUS_LABEL[status]}
                </button>
              ))}
            </div>
            <div className="ms-auto flex flex-wrap items-center gap-0.5">
              <Button variant="ghost" size="sm" onClick={() => setRead.mutate({ id: lead.id, value: lead.isUnread })}>
                <MailOpen aria-hidden="true" />
                {lead.isUnread ? 'Read' : 'Unread'}
              </Button>
              {preferences.notes ? (
                <Button variant="ghost" size="sm" onClick={() => setPanel('notes')}>
                  <PencilLine aria-hidden="true" />
                  Notes{lead.notes.length > 0 ? ` (${lead.notes.length})` : ''}
                </Button>
              ) : null}
              {preferences.history ? (
                <Button variant="ghost" size="sm" onClick={() => setPanel('history')}>
                  <Clock3 aria-hidden="true" />
                  History
                </Button>
              ) : null}
              {preferences.junk ? (
                <Button variant="ghost" size="sm" onClick={() => setJunk.mutate({ id: lead.id, value: !lead.isJunk })}>
                  {lead.isJunk ? <Undo2 aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
                  {lead.isJunk ? 'Not junk' : 'Junk'}
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => setArchived.mutate({ id: lead.id, value: !lead.isArchived })}>
                {lead.isArchived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
                {lead.isArchived ? 'Unarchive' : 'Archive'}
              </Button>
            </div>
          </div>

          {preferences.facts && facts.length > 0 ? (
            <Fold title="Facts" icon={<PencilLine aria-hidden="true" className="size-3.5" />} defaultOpen>
              <dl className="grid gap-3 sm:grid-cols-3">
                {facts.map((fact) => (
                  <div key={fact.label}>
                    <dt className="text-muted-foreground text-[0.62rem] tracking-widest uppercase">{fact.label}</dt>
                    <dd className="mt-0.5 text-sm font-medium" dir={fact.label === 'Phone' ? 'ltr' : 'auto'}>
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Fold>
          ) : null}

          {lead.bookings.length > 0 ? (
            <Fold
              title={lead.bookings.length === 1 ? 'Call booked' : 'Calls booked'}
              count={lead.bookings.length}
              icon={<CalendarClock aria-hidden="true" className="size-3.5" />}
            >
              <ul className="flex flex-col gap-1.5">
                {lead.bookings.map((booking) => {
                  const off = booking.status !== 'CONFIRMED'

                  return (
                    <li key={booking.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <CalendarClock aria-hidden="true" className={cn('size-4 shrink-0', off ? 'text-muted-foreground' : 'text-primary')} />
                      <span className={cn('font-medium', off && 'text-muted-foreground line-through')}>
                        {formatBerlin(booking.startsAt)}
                      </span>
                      <span className="text-muted-foreground">{booking.label}</span>
                      {off ? (
                        <Badge variant="outline" className="text-muted-foreground text-[0.6rem]">
                          {booking.status.toLowerCase()}
                        </Badge>
                      ) : null}
                      <Link
                        to="/admin/bookings/$id"
                        params={{ id: booking.id }}
                        className="text-primary ms-auto text-xs hover:underline"
                      >
                        Open
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Fold>
          ) : null}

          <div>
            <h2 className="text-lg font-semibold" dir="auto">
              {lead.subject}
            </h2>
            {preferences.attachment && lead.attachmentName ? (
              <p className="text-muted-foreground mt-1.5 flex items-center gap-2 text-sm">
                <Paperclip aria-hidden="true" className="size-4 shrink-0" />
                <span dir="auto">{lead.attachmentName}</span>
                {lead.attachmentBytes ? <span>· {formatBytes(lead.attachmentBytes)}</span> : null}
                <span className="text-xs">— on the notification mail</span>
              </p>
            ) : null}
            <p className="mt-2.5 text-sm leading-7 whitespace-pre-wrap" dir="auto">
              {lead.message}
            </p>
          </div>

          {preferences.thread && thread.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {thread.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'border-border max-w-[92%] rounded-lg border px-3 py-2 text-sm leading-6',
                    message.direction === 'OUT' ? 'bg-accent/60 self-end border-transparent' : 'self-start',
                  )}
                >
                  <p className="text-muted-foreground mb-1 flex items-center gap-2 text-[0.64rem]">
                    <span className="font-medium">{message.direction === 'OUT' ? 'You' : lead.name}</span>
                    <span>{formatBerlin(message.sentAt)}</span>
                  </p>
                  {/* A reply written here carries formatting; anything inbound
                      is someone else's plain text and stays plain text. */}
                  {message.rich ? (
                    <RichTextView
                      doc={message.rich}
                      className="[&_a]:text-primary [&_blockquote]:border-border [&_li]:ms-4 [&_ol]:list-decimal [&_p+p]:mt-2 [&_ul]:list-disc [&_blockquote]:border-s-2 [&_blockquote]:ps-3 [&_a]:underline"
                    />
                  ) : (
                    <p className="whitespace-pre-wrap" dir="auto">
                      {message.body}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* The reply window: docked to the bottom of the pane, over the letter. */}
      <div className={cn('border-border shrink-0 border-t p-2', rtl && 'text-right')} dir={rtl ? 'rtl' : 'ltr'}>
        {isComposing ? (
          <div className="border-border bg-card flex max-h-[26rem] flex-col overflow-hidden rounded-lg border shadow-lg">
            <div className="bg-muted/60 border-border flex items-center gap-2 border-b px-3 py-1.5 text-sm font-medium">
              <Send aria-hidden="true" className="size-3.5" />
              <span className="truncate" dir="auto">Reply to {lead.name}</span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setIsComposing(false)}
                className="text-muted-foreground hover:text-foreground ms-auto"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            {preferences.snippets ? (
              <div className="flex flex-wrap gap-1.5 px-3 pt-2">
                {SNIPPET_LABELS.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => insert(LEAD_SNIPPETS[lead.language][index])}
                    className="border-border text-muted-foreground hover:bg-accent hover:text-foreground rounded-full border px-2.5 py-0.5 text-xs transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}

            <ReplyEditor
              value={doc}
              language={lead.language}
              placeholder={REPLY_PLACEHOLDER[lead.language]}
              minHeight={preferences.thread ? '11rem' : '8rem'}
              onChange={setDoc}
            />

            {preferences.signature ? (
              <p
                className="text-muted-foreground border-border mx-3 border-t border-dashed pt-2 text-xs leading-5 whitespace-pre-line"
                dir="auto"
              >
                {signature}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 px-3 py-2">
              {preferences.languageHint ? (
                <Badge variant="outline" className="text-muted-foreground text-[0.65rem]">
                  {LANGUAGE_LABEL[lead.language] ?? lead.language} — they wrote in it
                </Badge>
              ) : null}
              <span className="flex-1" />
              {reply.isError ? (
                <span className="text-destructive text-xs">{(reply.error as Error).message}</span>
              ) : null}
              <Button size="sm" onClick={sendReply} disabled={!canSendMail || isRichTextEmpty(doc) || reply.isPending}>
                <Send aria-hidden="true" />
                {reply.isPending ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setIsComposing(true)} disabled={!canSendMail}>
              <Send aria-hidden="true" />
              {canSendMail ? 'Write a reply' : 'Email is not configured'}
            </Button>
            {preferences.inbound && !canReceiveMail ? (
              <span className="text-muted-foreground text-xs">
                Their answer arrives in your own mailbox — inbound email is not set up yet.
              </span>
            ) : null}
          </div>
        )}
      </div>

      <Dialog open={panel !== null} onOpenChange={(open) => setPanel(open ? panel : null)}>
        <DialogContent dir={rtl ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle>{panel === 'history' ? 'History' : 'Private notes'}</DialogTitle>
            <DialogDescription>
              {panel === 'history'
                ? 'Everything that happened to this message.'
                : 'Yours alone. Never sent, never shown to anyone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {panel === 'history' ? (
              <div className="text-muted-foreground text-xs leading-7">
                {lead.events.map((event) => (
                  <div key={event.id}>
                    <span className="text-foreground font-medium">{EVENT_LABEL[event.kind] ?? event.kind}</span>
                    {event.detail ? ` ${event.detail}` : ''} · {formatBerlin(event.createdAt)}
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {lead.notes.map((entry) => (
                    <div key={entry.id} className="border-border flex items-start gap-2 border-b pb-2 text-sm leading-6 last:border-b-0">
                      <p className="flex-1 whitespace-pre-wrap" dir="auto">
                        {entry.body}
                      </p>
                      <span className="text-muted-foreground text-xs whitespace-nowrap">
                        {formatBerlin(entry.createdAt)}
                      </span>
                      <button
                        type="button"
                        aria-label="Delete note"
                        onClick={() => deleteNote.mutate({ id: lead.id, noteId: entry.id })}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 aria-hidden="true" className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.currentTarget.value)}
                  placeholder="Write a note…"
                  dir="auto"
                  rows={3}
                  className="mt-3"
                />
                <Button
                  size="sm"
                  className="mt-2"
                  disabled={!note.trim() || addNote.isPending}
                  onClick={() => addNote.mutate({ id: lead.id, body: note.trim() }, { onSuccess: () => setNote('') })}
                >
                  Save note
                </Button>
              </>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}
