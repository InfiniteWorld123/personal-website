import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import {
  Archive,
  ArrowLeft,
  ChevronRight,
  CircleDot,
  FileText,
  Paperclip,
  Send,
  Star,
  X,
} from 'lucide-react'
import { PanelNote } from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import { RichTextEditor } from '#/frontend/features/blog/RichTextEditor'
import { uploadAttachment } from '#/frontend/api/inbox.api'
import {
  letterQuery,
  personInvoicesQuery,
  useAttachInvoice,
} from '#/frontend/features/invoices/invoice-queries'
import {
  SETTLEMENT_CLASS,
  day,
  money,
} from '#/frontend/features/invoices/invoice-format'
import { SETTLEMENT_LABEL } from '#/shared/validation/invoice.validation'
import type { PersonInvoice } from '#/shared/types/invoice.types'
import { usePrefetch } from '#/frontend/lib/prefetch'
import type { LetterKind } from '#/shared/validation/invoice.validation'
import {
  inboxQuery,
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
  richTextFromPlainText,
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

export function Conversation({
  personId,
  letterFor = null,
}: {
  personId: string
  letterFor?: { invoiceId: string; kind: LetterKind } | null
}) {
  const person = useQuery(personQuery(personId))

  if (person.isPending) return <ConversationSkeleton />

  /*
    A conversation that could not be fetched used to say the person was gone.
    Those are now told apart: a failed request offers itself again, and only a
    request that came back with nothing means somebody really has been removed.
  */
  if (person.isError) {
    return (
      <PanelNote className="h-full justify-center" tone="error">
        <div>
          <p className="font-medium">This conversation could not be opened.</p>
          <p className="text-muted-foreground mt-1">
            {person.error instanceof Error ? person.error.message : 'Something went wrong.'}
          </p>
        </div>
        <Button onClick={() => void person.refetch()} size="sm" variant="outline">
          Try again
        </Button>
      </PanelNote>
    )
  }

  if (!person.data) {
    return (
      <PanelNote className="h-full justify-center">
        <p className="text-sm">That person is no longer here.</p>
      </PanelNote>
    )
  }

  return <Thread person={person.data} letterFor={letterFor} />
}

/**
 * The thread before it arrives.
 *
 * The same three parts at the same heights — the person's bar, a band of
 * letters, the reply docked at the bottom — so the conversation lands into
 * the shape the eye is already reading rather than replacing it.
 */
function ConversationSkeleton() {
  return (
    <SkeletonScreen className="flex h-full min-h-0 flex-col" label="Loading the conversation">
      <div className="border-border/60 flex flex-wrap items-start gap-3 border-b p-4">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-56" />
        </div>
        <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="border-border/60 border-b">
          <div className="flex items-center gap-2 px-4 py-3">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-3.5 w-24" />
          </div>

          <div className="flex flex-col gap-3 px-4 pb-4">
            {Array.from({ length: 2 }, (_, index) => (
              <div className="border-border/60 rounded-xl border border-s-4 p-3" key={index}>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="ms-auto h-2.5 w-24" />
                </div>
                <Skeleton className="mt-3 h-3 w-full" />
                <Skeleton className="mt-2 h-3 w-4/5" />
              </div>
            ))}
          </div>
        </div>

        {/* The two folded bands under the letters: Details, then Notes. */}
        {Array.from({ length: 2 }, (_, index) => (
          <div className="border-border/60 flex items-center gap-2 border-b px-4 py-3" key={index}>
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>

      <div className="border-border/60 bg-muted/30 border-t p-3">
        <Skeleton className="h-9 w-full rounded-md sm:w-56" />
      </div>
    </SkeletonScreen>
  )
}

function Thread({
  person,
  letterFor,
}: {
  person: Person
  letterFor: { invoiceId: string; kind: LetterKind } | null
}) {
  const prefetch = usePrefetch()
  const setRead = useSetRead(person.id)
  const setArchived = useSetArchived(person.id)
  const setStarred = useSetStarred(person.id)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-border/60 flex flex-wrap items-start gap-3 border-b p-4">
        <Button asChild variant="ghost" size="icon" className="lg:hidden">
          {/* Going back remounts the list with its own defaults — the lens and
              the search are component state — so that is the entry warmed. */}
          <Link
            to="/admin/inbox"
            aria-label="Back to the list"
            {...prefetch(inboxQuery('inbox', ''))}
          >
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

      <Composer person={person} letterFor={letterFor} />
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
        <time className="text-muted-foreground text-[11px]">
          {formatDateTime(person.createdAt)}
        </time>
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

      {/* A document sent with the enquiry belongs to no letter, so it is shown
          here. Before 18 Sep 2026 the form threw those files away entirely. */}
      {person.firstMessageFiles.length > 0 ? <Files files={person.firstMessageFiles} /> : null}

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
        className="hover:bg-accent/40 focus-visible:ring-ring flex w-full flex-wrap items-center gap-2 p-3 text-start motion-safe:transition-colors focus-visible:ring-2 focus-visible:-outline-offset-2 focus-visible:outline-none"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'text-muted-foreground size-3.5 shrink-0 motion-safe:transition-transform',
            open && 'rotate-90',
          )}
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
          <span
            dir="auto"
            className="text-muted-foreground block max-w-[18ch] truncate text-[11px] sm:max-w-[40ch]"
          >
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
            className="border-border hover:border-primary flex items-center gap-2 rounded-lg border px-3 py-2 text-xs motion-safe:transition-colors"
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
 * The invoices this person has been billed, inside the composer.
 *
 * His own request: he is replying to "can you send me the invoice again?" and
 * wants the document without leaving the letter he has already started. Going
 * to the invoice and pressing *Write the letter* works, and replaces his words
 * with generated ones — which is the whole reason this exists.
 *
 * Three decisions, each visible on a row:
 *
 *   * **Only this person's.** Scoped on the server, not filtered here. A list
 *     of everyone's invoices is one mis-click from a client reading another
 *     client's figures, and there is no taking that back.
 *   * **Drafts stay, greyed.** A draft has no frozen file, so there is nothing
 *     to attach — but removing it from the list would send him looking for an
 *     invoice he knows he wrote.
 *   * **"Sent 12 Sep" on the row.** This panel makes sending the same invoice
 *     twice easy, and the moment to notice is before pressing send.
 */
function InvoicePicker({
  personId,
  onAttached,
  onClose,
}: {
  personId: string
  onAttached: (file: { id: string; filename: string; bytes: number }) => void
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const invoices = useQuery(personInvoicesQuery(personId))
  const attach = useAttachInvoice(personId)

  const pick = (invoice: PersonInvoice) => {
    setError(null)
    setBusy(invoice.id)

    attach
      .mutateAsync(invoice.id)
      .then((file) => {
        onAttached(file)
        onClose()
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'That could not be attached.'),
      )
      .finally(() => setBusy(null))
  }

  return (
    <div className="border-border/60 bg-muted/40 shrink-0 border-t">
      <div className="flex items-baseline gap-2 px-3 pt-2.5 pb-1.5">
        <span className="text-xs font-medium">Invoices for this person</span>
        <span className="text-muted-foreground text-[11px]">
          {invoices.isPending
            ? 'loading…'
            : `${invoices.data?.filter((invoice) => invoice.attachable).length ?? 0} you can attach`}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the invoice list"
          className="text-muted-foreground hover:text-foreground ms-auto"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>

      {invoices.isPending ? (
        <div className="flex flex-col gap-1.5 px-2.5 pb-2.5">
          {Array.from({ length: 2 }, (_, index) => (
            <Skeleton className="h-12 rounded-xl" key={index} />
          ))}
        </div>
      ) : invoices.isError ? (
        <p className="text-destructive px-3 pb-3 text-[11px]">
          That list could not be read. Use the paperclip for a file on your computer.
        </p>
      ) : (invoices.data?.length ?? 0) === 0 ? (
        /* Not an error, and said as the fact it is: he has never billed them. */
        <p className="text-muted-foreground px-3 pb-3 text-[11px]">
          You have never billed this person. Make an invoice for them first, or use the
          paperclip for a file on your computer.
        </p>
      ) : (
        <ul className="max-h-56 overflow-y-auto px-2.5 pb-2.5">
          {invoices.data?.map((invoice) => (
            <li key={invoice.id}>
              <button
                type="button"
                disabled={!invoice.attachable || busy !== null}
                onClick={() => pick(invoice)}
                className={cn(
                  'border-border/60 bg-panel mt-1.5 flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-start motion-safe:transition-colors',
                  invoice.attachable
                    ? 'hover:border-primary cursor-pointer'
                    : 'cursor-not-allowed opacity-55',
                )}
              >
                <span
                  className={cn(
                    'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap',
                    SETTLEMENT_CLASS[invoice.settlement],
                  )}
                >
                  {SETTLEMENT_LABEL[invoice.settlement]}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {invoice.title || 'No lines'}
                  </span>
                  <span className="text-muted-foreground block truncate text-[11px]">
                    {invoice.number ? <span className="tabular">{invoice.number} · </span> : null}
                    {invoice.attachable ? day(invoice.issuedOn) : 'no file until you issue it'}
                  </span>
                </span>

                {/* The fact that stops the same invoice going out twice. */}
                {invoice.lastSentAt ? (
                  <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] whitespace-nowrap text-amber-700 dark:text-amber-300">
                    sent {day(invoice.lastSentAt.slice(0, 10))}
                  </span>
                ) : null}

                <span className="tabular shrink-0 text-xs font-semibold">
                  {busy === invoice.id ? '…' : money(invoice.totalCents, invoice.currency)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error ? <p className="text-destructive px-3 pb-3 text-[11px]">{error}</p> : null}
    </div>
  )
}

/**
 * The reply, docked to the bottom.
 *
 * His own measure of this screen was "how many blocks sit between me and the
 * cursor". A composer that floats has none, so notes and details fold *below*
 * the thread rather than above the reply.
 */
function Composer({
  person,
  letterFor,
}: {
  person: Person
  letterFor: { invoiceId: string; kind: LetterKind } | null
}) {
  const [doc, setDoc] = useState<RichTextDoc>(emptyRichTextDoc)
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<Array<{ id: string; filename: string; bytes: number }>>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const settings = useQuery(settingsQuery())
  const reply = useReply(person.id)

  /**
   * A letter handed over by the invoicing section.
   *
   * The server has already put the invoice's PDF in this person's files, so all
   * that arrives here is the text and the id of that file — and the composer
   * opens on it exactly as if he had typed it and attached it himself.
   *
   * Seeded once, guarded by a ref rather than by the state it sets: without the
   * guard, editing the draft and then any re-render would put the generated
   * wording back over his own words.
   */
  const letter = useQuery(
    letterQuery(letterFor?.invoiceId ?? '', letterFor?.kind ?? 'INVOICE', Boolean(letterFor)),
  )
  const seeded = useRef<string | null>(null)

  useEffect(() => {
    const prepared = letter.data

    if (!prepared || !letterFor) return

    const key = `${letterFor.invoiceId}:${letterFor.kind}`

    if (seeded.current === key) return

    seeded.current = key
    setDoc(richTextFromPlainText(prepared.body))
    setFiles([prepared.attachment])
    setOpen(true)
  }, [letter.data, letterFor])

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
      <div className="border-border/60 bg-muted/30 border-t p-3">
        <Button className="w-full sm:w-auto" onClick={() => setOpen(true)}>
          <Send aria-hidden="true" />
          Reply to {person.name}
        </Button>
      </div>
    )
  }

  return (
    <div className="border-border/60 bg-muted/30 flex max-h-[62%] flex-col border-t">
      <div className="border-border/60 text-muted-foreground flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs">
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
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: snippet.body }],
                      },
                    ],
                  } as RichTextDoc)
                }
                className="border-border text-muted-foreground hover:border-primary hover:text-primary rounded-full border px-2.5 py-1 text-[11px] motion-safe:transition-colors"
              >
                {snippet.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/*
        Outside the editor, never inside it.
        These chips used to sit under the text in the scrolling box, so a
        letter long enough to fill it pushed them out of sight: attaching a
        file looked exactly like attaching nothing, and the same document got
        picked twice. A file the owner has added is now always on screen.
      */}
      {files.length > 0 || uploadError ? (
        <div className="border-border/60 shrink-0 border-t px-3 py-2">
          {files.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {files.map((file) => (
                <li
                  key={file.id}
                  className="border-border flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]"
                >
                  <Paperclip aria-hidden="true" className="size-3 shrink-0" />
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
        </div>
      ) : null}

      {picking ? (
        <InvoicePicker
          personId={person.id}
          onAttached={(file) =>
            // Guarded rather than appended blindly: the server hands back the
            // copy it already made when the same invoice is picked twice, and
            // two chips naming one file would each offer to remove it.
            setFiles((current) =>
              current.some((existing) => existing.id === file.id) ? current : [...current, file],
            )
          }
          onClose={() => setPicking(false)}
        />
      ) : null}

      <div className="border-border/60 flex flex-wrap items-center gap-2 border-t p-3">
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
          aria-label="Attach a file from your computer"
          title="A file from your computer"
        >
          <Paperclip aria-hidden="true" />
        </Button>

        {/*
          Beside the paperclip, not inside a menu.
          The invoice is the file he attaches most often and the one he already
          owns — asking him to find it on his own disk first, when the system
          drew it, was the step he asked to remove.
        */}
        <Button
          variant="outline"
          onClick={() => setPicking((open) => !open)}
          aria-expanded={picking}
          title="An invoice you already made"
        >
          <FileText aria-hidden="true" /> Invoice
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
