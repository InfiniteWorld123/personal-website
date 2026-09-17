import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { Archive, ArrowLeft, ChevronRight, CircleDot, Paperclip, Send, Star, X } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { RichTextEditor } from '#/frontend/features/blog/RichTextEditor'
import { uploadAttachment } from '#/frontend/api/inbox.api'
import {
  personQuery,
  settingsQuery,
  useReply,
  useSetArchived,
  useSetRead,
  useSetStarred,
} from '#/frontend/features/inbox/inbox-queries'
import {
  avatarHue,
  formatBytes,
  formatDateTime,
  initialsOf,
  SOURCE_LABEL,
} from '#/frontend/features/inbox/inbox-format'
import {
  emptyRichTextDoc,
  isRichTextEmpty,
  richTextToLetter,
  type RichTextDoc,
} from '#/shared/validation/rich-text'
import type { Attachment, Message, Person } from '#/shared/types/inbox.types'
import { cn } from '#/frontend/lib/utils'
import { PersonPanel } from './PersonPanel'
import { Section } from './Section'

/** The enquiry lives on the person, not in `messages`, so it counts separately. */
const messageCount = (person: Person): number =>
  person.messages.length + (person.firstMessage.trim() === '' ? 0 : 1)

export function Conversation({ personId }: { personId: string }) {
  const person = useQuery(personQuery(personId))

  if (person.isPending) return <p className="text-muted-foreground p-6 text-sm">Loading…</p>
  if (!person.data) {
    return <p className="text-muted-foreground p-6 text-sm">That person is no longer here.</p>
  }

  return <Thread person={person.data} />
}

function Thread({ person }: { person: Person }) {
  const setRead = useSetRead(person.id)
  const setArchived = useSetArchived(person.id)
  const setStarred = useSetStarred(person.id)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-border flex flex-wrap items-start gap-3 border-b p-4">
        <Button asChild variant="ghost" size="icon" className="lg:hidden">
          <Link to="/admin/inbox" aria-label="Back to the list">
            <ArrowLeft aria-hidden="true" />
          </Link>
        </Button>

        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: `hsl(${avatarHue(person.email)} 58% 45%)` }}
        >
          {initialsOf(person.name)}
        </span>

        <div className="min-w-0 flex-1">
          <h2 dir="auto" className="truncate text-base font-semibold">
            {person.name}
          </h2>
          <p className="text-muted-foreground truncate text-xs" dir="ltr">
            {person.email}
            {person.company ? ` · ${person.company}` : ''}
          </p>
        </div>

        {/* Their own line on a phone: sharing one row with the name squeezed it
            to two letters at 375px — the person you are answering, unreadable. */}
        <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStarred.mutate(!person.starred)}
            disabled={setStarred.isPending}
          >
            <Star
              aria-hidden="true"
              className={cn(person.starred && 'fill-amber-400 text-amber-500')}
            />
            {person.starred ? 'Starred' : 'Star'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRead.mutate(person.unread)}
            disabled={setRead.isPending}
          >
            <CircleDot aria-hidden="true" />
            {person.unread ? 'Mark read' : 'Mark unread'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setArchived.mutate(!person.archived)}
            disabled={setArchived.isPending}
          >
            <Archive aria-hidden="true" />
            {person.archived ? 'Unfile' : 'File'}
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/*
          Three bands of the same kind: the letters, the person, the notes.

          The letters fold **shut** by default, which is what he asked for
          after nine one-line messages filled the screen before anything else
          could be seen — with one exception, because a mailbox that hides a
          letter nobody has read yet is not a mailbox: an unread conversation
          opens itself.
        */}
        <Section title="Messages" count={messageCount(person)} defaultOpen={person.unread}>
          <div className="flex flex-col gap-3">
            {person.firstMessage.trim() !== '' ? <FirstMessage person={person} /> : null}

            {person.messages.map((message, index) => (
              <MessageCard
                key={message.id}
                message={message}
                person={person}
                // The newest is open; everything before it folds to one line.
                defaultOpen={index === person.messages.length - 1}
              />
            ))}
          </div>
        </Section>

        <PersonPanel person={person} />
      </div>

      <Composer person={person} />
    </div>
  )
}

/** The enquiry lives on the person, not in the messages table — so it opens the thread. */
function FirstMessage({ person }: { person: Person }) {
  return (
    <article className="border-border rounded-xl border p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span className="border-border rounded-full border px-2 py-0.5 text-[10px] font-medium">
          {SOURCE_LABEL[person.source] ?? person.source}
        </span>
        <time className="text-muted-foreground text-[11px]">{formatDateTime(person.createdAt)}</time>
      </header>

      {/*
        `dir="auto"` reads the letter itself, not the language stored on the
        person. A German letter from somebody filed as Arabic-speaking was
        being right-aligned, which is how the same person can send you two
        letters that point in opposite directions.
      */}
      <p dir="auto" className="text-sm leading-relaxed whitespace-pre-wrap">
        {person.firstMessage}
      </p>

      {person.facts.length > 0 ? (
        <dl className="border-border mt-4 grid gap-x-6 gap-y-2 border-t pt-3 text-xs sm:grid-cols-2">
          {person.facts.map((fact) => (
            <div key={fact.label} className="flex gap-2">
              <dt className="text-muted-foreground shrink-0">{fact.label}</dt>
              <dd dir="auto" className="truncate font-medium">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  )
}

function MessageCard({
  message,
  person,
  defaultOpen,
}: {
  message: Message
  person: Person
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const outbound = message.direction === 'OUT'

  return (
    /*
      His words: "make a difference — me a colour, the client another colour,
      just to let it be clearer for me." A 4% tint was not a difference. A
      solid rail down the side is legible at a glance and in both themes.
    */
    <article
      className={cn(
        'overflow-hidden rounded-xl border border-s-4',
        outbound
          ? 'border-primary/25 border-s-primary bg-primary/[0.07]'
          : 'border-border border-s-emerald-500/70 bg-card',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="hover:bg-muted/40 flex w-full flex-wrap items-center gap-2 p-3 text-start transition-colors"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn('text-muted-foreground size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
        />
        <span
          className={cn(
            'text-xs font-semibold',
            outbound ? 'text-primary' : 'text-emerald-700 dark:text-emerald-400',
          )}
        >
          {outbound ? 'You wrote' : person.name}
        </span>

        {!open ? (
          <span dir="auto" className="text-muted-foreground block max-w-[18ch] truncate text-[11px] sm:max-w-[40ch]">
            {message.body.split('\n').find((line) => line.trim() !== '') ?? ''}
          </span>
        ) : null}

        {message.attachments.length > 0 ? (
          <span className="text-muted-foreground flex items-center gap-0.5 text-[10px]">
            <Paperclip aria-hidden="true" className="size-3" />
            {message.attachments.length}
          </span>
        ) : null}

        <time className="text-muted-foreground ms-auto shrink-0 text-[10px]">
          {formatDateTime(message.sentAt)}
        </time>
      </button>

      {open ? (
        <div className="px-4 pb-4">
          {message.subject ? (
            <p dir="auto" className="mb-2 text-xs font-medium">
              {message.subject}
            </p>
          ) : null}

          <p dir="auto" className="text-sm leading-relaxed whitespace-pre-wrap">
            {message.body}
          </p>

          {message.attachments.length > 0 ? <Files files={message.attachments} /> : null}
        </div>
      ) : null}
    </article>
  )
}

function Files({ files }: { files: Attachment[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {files.map((file) => (
        <li key={file.id}>
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="border-border hover:border-primary flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors"
          >
            <Paperclip aria-hidden="true" className="size-3.5 shrink-0" />
            {/* The wrapper is a flex box, not a bare span: a block child inside
                an inline one splits the box and escapes `overflow-hidden`. */}
            <span className="flex min-w-0 flex-col">
              <span dir="auto" className="block max-w-50 truncate font-medium">
                {file.filename}
              </span>
              <span className="text-muted-foreground text-[10px]">{formatBytes(file.bytes)}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

/**
 * The reply, docked to the bottom.
 *
 * His own measure of this screen was "how many blocks sit between me and the
 * cursor". A composer that floats has none, so notes and details fold *below*
 * the thread rather than above the reply.
 */
function Composer({ person }: { person: Person }) {
  const [doc, setDoc] = useState<RichTextDoc>(emptyRichTextDoc)
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<Array<{ id: string; filename: string; bytes: number }>>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const settings = useQuery(settingsQuery())
  const reply = useReply(person.id)

  const snippets = (settings.data?.snippets ?? []).filter(
    (snippet) => snippet.language === person.language,
  )
  const signature = settings.data?.signature[person.language] ?? ''

  const attach = async (file: File) => {
    setUploading(true)
    setUploadError(null)

    try {
      const stored = await uploadAttachment(person.id, file)

      setFiles((current) => [...current, stored])
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'The file could not be stored')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const send = () => {
    reply.mutate(
      {
        subject: '',
        body: richTextToLetter(doc),
        bodyRich: doc,
        attachmentIds: files.map((file) => file.id),
      },
      {
        onSuccess: () => {
          setDoc(emptyRichTextDoc())
          setFiles([])
          setOpen(false)
        },
      },
    )
  }

  if (!open) {
    return (
      <div className="border-border bg-card border-t p-3">
        <Button className="w-full sm:w-auto" onClick={() => setOpen(true)}>
          <Send aria-hidden="true" />
          Reply to {person.name}
        </Button>
      </div>
    )
  }

  return (
    <div className="border-border bg-card flex max-h-[62%] flex-col border-t">
      <div className="border-border text-muted-foreground flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs">
        <span>To</span>
        <span className="text-foreground font-medium" dir="ltr">
          {person.email}
        </span>
        <span className="ms-auto">{person.language.toUpperCase()}</span>
      </div>

      <div className="reply-editor min-h-0 flex-1 overflow-y-auto p-3">
        <RichTextEditor
          value={doc}
          language={person.language}
          onChange={setDoc}
          label={`Reply to ${person.name}`}
        />

        {files.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {files.map((file) => (
              <li
                key={file.id}
                className="border-border flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]"
              >
                <Paperclip aria-hidden="true" className="size-3" />
                <span dir="auto" className="max-w-40 truncate">
                  {file.filename}
                </span>
                <span className="text-muted-foreground">{formatBytes(file.bytes)}</span>
                <button
                  type="button"
                  onClick={() => setFiles((current) => current.filter((f) => f.id !== file.id))}
                  aria-label={`Remove ${file.filename}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {uploadError ? <p className="text-destructive mt-2 text-[11px]">{uploadError}</p> : null}

        {snippets.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {snippets.map((snippet) => (
              <button
                key={snippet.label}
                type="button"
                onClick={() =>
                  setDoc({
                    type: 'doc',
                    content: [
                      ...(doc.content ?? []),
                      { type: 'paragraph', content: [{ type: 'text', text: snippet.body }] },
                    ],
                  } as RichTextDoc)
                }
                className="border-border text-muted-foreground hover:border-primary hover:text-primary rounded-full border px-2.5 py-1 text-[11px] transition-colors"
              >
                {snippet.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="border-border flex flex-wrap items-center gap-2 border-t p-3">
        <Button onClick={send} disabled={reply.isPending || isRichTextEmpty(doc)}>
          <Send aria-hidden="true" />
          {reply.isPending ? 'Sending…' : 'Send'}
        </Button>

        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          aria-label="Attach a file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]

            if (file) void attach(file)
          }}
        />
        <Button
          variant="outline"
          size="icon"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          aria-label="Attach a file"
        >
          <Paperclip aria-hidden="true" />
        </Button>

        <Button variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>

        <p className="text-muted-foreground ms-auto text-[11px]">
          {signature.trim() === ''
            ? 'No signature set yet'
            : 'Your signature is added automatically'}
        </p>
      </div>
    </div>
  )
}
