import { useEffect, useRef, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  MailOpen,
  Paperclip,
  Send,
  ShieldAlert,
  Trash2,
  Undo2,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Badge } from '#/frontend/components/ui/badge'
import { Button } from '#/frontend/components/ui/button'
import { Textarea } from '#/frontend/components/ui/textarea'
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
import type { AdminLeadDetail } from '#/shared/types/lead.types'
import {
  LEAD_SIGN_OFF,
  LEAD_SNIPPETS,
  REPLY_PLACEHOLDER,
  SNIPPET_LABELS,
} from '#/shared/lead-copy'
import type { InboxPreferences, LeadStatus } from '#/shared/validation/lead.validation'
import { LEAD_STATUSES } from '#/shared/validation/lead.validation'
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

export function LeadReadingPane({
  lead,
  preferences,
  canSendMail,
  canReceiveMail,
  replyRef,
}: {
  lead: AdminLeadDetail
  preferences: InboxPreferences
  canSendMail: boolean
  canReceiveMail: boolean
  replyRef?: React.RefObject<HTMLTextAreaElement | null>
}) {
  const setStatus = useSetLeadStatus()
  const setRead = useSetLeadRead()
  const setArchived = useSetLeadArchived()
  const setJunk = useSetLeadJunk()
  const addNote = useAddLeadNote()
  const deleteNote = useDeleteLeadNote()
  const reply = useReplyToLead()

  const [replyBody, setReplyBody] = useState('')
  const [note, setNote] = useState('')
  const ownRef = useRef<HTMLTextAreaElement>(null)
  const textarea = replyRef ?? ownRef

  // A draft belongs to the message it was started in, never to the next one.
  useEffect(() => {
    setReplyBody('')
    setNote('')
  }, [lead.id])

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
    if (!replyBody.trim()) return

    reply.mutate(
      { id: lead.id, input: { subject: lead.subject, body: replyBody.trim() } },
      { onSuccess: () => setReplyBody('') },
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
      {/*
        The address and the date used to sit in the same line and overlap once
        either grew: the address is allowed to shrink and truncate, the date
        never wraps, and the block on the right keeps its width.
      */}
      <div className="border-border flex items-start gap-3 border-b pb-4">
        {preferences.initials ? (
          <span className="bg-accent text-accent-foreground grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold">
            {initialsOf(lead.name)}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold" title={lead.name}>
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

      {/*
        Two groups, not one long line: the five stages wrap among themselves and
        the three actions travel together, instead of "Lost" ending up beside
        "Archive" on a narrow pane.
      */}
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground me-1 text-xs">Status</span>
          {LEAD_STATUSES.map((status: LeadStatus) => (
            <button
              key={status}
              type="button"
              aria-pressed={lead.status === status}
              onClick={() => setStatus.mutate({ id: lead.id, status })}
              className={cn(
                'border-border rounded-full border px-3 py-1 text-xs transition-colors',
                lead.status === status
                  ? 'bg-primary border-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {STATUS_LABEL[status]}
            </button>
          ))}
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRead.mutate({ id: lead.id, value: lead.isUnread })}
        >
          <MailOpen aria-hidden="true" />
          {lead.isUnread ? 'Mark read' : 'Mark unread'}
        </Button>
        {preferences.junk ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setJunk.mutate({ id: lead.id, value: !lead.isJunk })}
          >
            {lead.isJunk ? <Undo2 aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
            {lead.isJunk ? 'Not junk' : 'Junk'}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setArchived.mutate({ id: lead.id, value: !lead.isArchived })}
        >
          {lead.isArchived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
          {lead.isArchived ? 'Unarchive' : 'Archive'}
        </Button>
        </div>
      </div>

      {preferences.facts && facts.length > 0 ? (
        <dl className="border-border bg-muted/40 grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-muted-foreground text-[0.65rem] tracking-widest uppercase">
                {fact.label}
              </dt>
              <dd className="mt-0.5 text-sm font-medium" dir={fact.label === 'Phone' ? 'ltr' : 'auto'}>
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {lead.bookings.length > 0 ? (
        /*
         * Six calls used to run together on one line. They are a list, so they
         * are laid out as one — newest first, cancelled ones struck through
         * rather than hidden, each a way into the booking itself.
         */
        <div className="border-border rounded-lg border p-3">
          <h3 className="text-muted-foreground text-[0.65rem] tracking-widest uppercase">
            {lead.bookings.length === 1 ? 'Call booked' : `${lead.bookings.length} calls booked`}
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {lead.bookings.map((booking) => {
              const off = booking.status !== 'CONFIRMED'

              return (
                <li key={booking.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <CalendarClock
                    aria-hidden="true"
                    className={cn('size-4 shrink-0', off ? 'text-muted-foreground' : 'text-primary')}
                  />
                  <span className={cn('font-medium', off && 'text-muted-foreground line-through')}>
                    {formatBerlin(booking.startsAt)}
                  </span>
                  <span className="text-muted-foreground">{booking.label}</span>
                  {off ? (
                    <Badge variant="outline" className="text-muted-foreground text-[0.65rem]">
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
        </div>
      ) : null}

      <div>
        <h2 className="text-lg font-semibold" dir="auto">
          {lead.subject}
        </h2>
        {preferences.attachment && lead.attachmentName ? (
          <p className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
            <Paperclip aria-hidden="true" className="size-4" />
            {lead.attachmentName}
            {lead.attachmentBytes ? ` · ${formatBytes(lead.attachmentBytes)}` : ''}
            <span className="text-xs">— the file itself is on the notification mail</span>
          </p>
        ) : null}
        <p className="mt-3 text-sm leading-7 whitespace-pre-wrap" dir="auto">
          {lead.message}
        </p>
      </div>

      {preferences.thread && thread.length > 0 ? (
        <div className="flex flex-col gap-3">
          {thread.map((message) => (
            <div
              key={message.id}
              className={cn(
                'border-border max-w-[92%] rounded-lg border px-3 py-2 text-sm leading-6',
                message.direction === 'OUT'
                  ? 'bg-accent/60 self-end border-transparent'
                  : 'self-start',
              )}
            >
              <p className="text-muted-foreground mb-1 flex items-center gap-2 text-[0.65rem]">
                <span className="font-medium">{message.direction === 'OUT' ? 'You' : lead.name}</span>
                <span>{formatBerlin(message.sentAt)}</span>
              </p>
              <p className="whitespace-pre-wrap" dir="auto">
                {message.body}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="border-border rounded-lg border p-3">
        {preferences.snippets ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {SNIPPET_LABELS.map((label, index) => {
              // English on the button, because the admin is English; what it
              // inserts is written in the language it is going out in.
              const text = LEAD_SNIPPETS[lead.language][index]

              return (
                <button
                  key={label}
                  type="button"
                  onClick={() =>
                    setReplyBody((current) => (current ? `${current}\n\n${text}` : text))
                  }
                  className="border-border text-muted-foreground hover:bg-accent hover:text-foreground rounded-full border px-3 py-1 text-xs transition-colors"
                >
                  {label}
                </button>
              )
            })}
          </div>
        ) : null}

        <Textarea
          ref={textarea}
          value={replyBody}
          onChange={(event) => setReplyBody(event.currentTarget.value)}
          placeholder={
            canSendMail
              ? REPLY_PLACEHOLDER[lead.language]
              : 'Email is not configured, so replies cannot be sent'
          }
          disabled={!canSendMail}
          rows={5}
          dir="auto"
        />

        {preferences.signature ? (
          <p
            className="text-muted-foreground border-border mt-2 border-t border-dashed pt-2 text-xs leading-5 whitespace-pre-line"
            dir="auto"
          >
            {LEAD_SIGN_OFF[lead.language]}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {preferences.languageHint ? (
            <Badge variant="outline" className="text-muted-foreground">
              Reply in {LANGUAGE_LABEL[lead.language] ?? lead.language} — they wrote in it
            </Badge>
          ) : null}
          <span className="flex-1" />
          <Button onClick={sendReply} disabled={!canSendMail || !replyBody.trim() || reply.isPending}>
            <Send aria-hidden="true" />
            {reply.isPending ? 'Sending…' : 'Send reply'}
          </Button>
        </div>

        {reply.isError ? (
          <p className="text-destructive mt-2 text-sm">{(reply.error as Error).message}</p>
        ) : null}

        {/*
          Said once, where the promise is made. Without an inbound address the
          reply still goes out — the answer simply lands in his own mail client
          instead of here, and pretending otherwise would be the real fault.
        */}
        {preferences.inbound && !canReceiveMail ? (
          <p className="text-muted-foreground mt-2 text-xs">
            Their answer will arrive in your own mailbox: inbound email is not set up yet.
          </p>
        ) : null}
      </div>

      {preferences.notes ? (
        <div className="border-border bg-muted/30 rounded-lg border border-dashed p-3">
          <h3 className="text-muted-foreground text-[0.65rem] tracking-widest uppercase">
            Private notes
          </h3>
          <div className="mt-2 flex flex-col gap-2">
            {lead.notes.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2 text-sm leading-6">
                <p className="flex-1 whitespace-pre-wrap" dir="auto">{entry.body}</p>
                <span className="text-muted-foreground text-xs">{formatBerlin(entry.createdAt)}</span>
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
            rows={2}
            dir="auto"
            className="mt-2"
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={!note.trim() || addNote.isPending}
            onClick={() => addNote.mutate({ id: lead.id, body: note.trim() }, { onSuccess: () => setNote('') })}
          >
            Save note
          </Button>
        </div>
      ) : null}

      {preferences.history && lead.events.length > 0 ? (
        <div className="text-muted-foreground text-xs leading-7">
          <h3 className="text-[0.65rem] tracking-widest uppercase">History</h3>
          {lead.events.map((event) => (
            <div key={event.id}>
              <span className="text-foreground font-medium">
                {EVENT_LABEL[event.kind] ?? event.kind}
              </span>
              {event.detail ? ` ${event.detail}` : ''} · {formatBerlin(event.createdAt)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
