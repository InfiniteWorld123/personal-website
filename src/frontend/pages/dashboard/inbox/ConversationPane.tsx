import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Download,
  Loader2,
  MailOpen,
  Reply,
  RotateCcw,
  ShieldAlert,
  Star,
  Trash2,
} from 'lucide-react'
import type { ConversationDetail, IncomingAttachment, InboxMessage } from '#/backend2/contracts/inbox.contract'
import { StatusChip } from '#/frontend/dashboard/primitives'
import { ConfirmDialog } from '#/frontend/features/blog-v2/BlogDialog'
import { attachmentUrl, createDraft, readMessageHtml } from '#/frontend/features/inbox-v2/api'
import {
  useConversation,
  useDeleteConversation,
  usePatchConversation,
  useRestoreConversation,
  useRetryMessage,
  useSaveToMedia,
  useTrashConversation,
} from '#/frontend/features/inbox-v2/queries'
import { messageFromError, notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { Composer } from './Composer'
import { fileBadge, fileSize, fullTime } from './inbox-parts'

/**
 * One conversation, read like a letter exchange: oldest at the top, newest at
 * the bottom, the reply box underneath (approved choices 2A and 3A). A long
 * thread shows its newest page and loads earlier pages on request.
 */

function IncomingFile({ file }: { file: IncomingAttachment }) {
  const save = useSaveToMedia()

  if (file.status !== 'stored') {
    return (
      <li className="flex items-center gap-2.5 rounded-[9px] border border-dashed border-[var(--dash-line)] px-2.5 py-1.5">
        <span className="grid size-8 place-items-center rounded-md bg-[var(--dash-red-tint)] text-[var(--dash-red-ink)]">
          <ShieldAlert className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px]">{file.fileName}</span>
          <span className="text-[11.5px] text-[var(--dash-quiet)]">{file.failureReason}</span>
        </span>
      </li>
    )
  }

  return (
    <li className="flex flex-wrap items-center gap-2.5 rounded-[9px] border border-[var(--dash-line)] px-2.5 py-1.5">
      <span className="grid size-8 place-items-center rounded-md bg-[var(--dash-chip)] text-[10px] font-bold text-[var(--dash-quiet)]">
        {fileBadge(file.contentType, file.fileName)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px]">{file.fileName}</span>
        <span className="text-[11.5px] text-[var(--dash-quiet)]">
          {fileSize(file.byteSize)}
          {file.canSaveToMedia ? '' : ` · ${file.saveToMediaUnavailableReason}`}
        </span>
      </span>
      <span className="flex gap-1">
        <a className="dash-btn dash-btn-quiet h-7 text-[11.5px]" href={attachmentUrl(file.id)} download={file.fileName}>
          <Download className="size-3.5" aria-hidden="true" /> Download
        </a>
        {file.savedMediaAssetId ? (
          <StatusChip tone="blue" className="h-7">In Media</StatusChip>
        ) : file.canSaveToMedia ? (
          <button
            type="button"
            className="dash-btn dash-btn-quiet h-7 text-[11.5px]"
            disabled={save.isPending}
            onClick={async () => {
              try {
                const result = await save.mutateAsync(file.id)

                notify.success(result.alreadySaved ? 'Already in Media' : `Saved to Media: ${result.asset.displayName}`)
              } catch (error) {
                notify.error(messageFromError(error))
              }
            }}
          >
            {save.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            Save to Media
          </button>
        ) : null}
      </span>
    </li>
  )
}

/** The sender's formatting, inside a sandbox that runs nothing and fetches nothing. */
function OriginalFormatting({ messageId }: { messageId: string }) {
  const html = useQuery({ queryKey: ['backend2', 'inbox', 'html', messageId], queryFn: () => readMessageHtml(messageId), retry: false })

  if (html.isPending) return <p className="text-[12px] text-[var(--dash-quiet)]">Loading the formatted version…</p>
  if (html.isError) return <p className="text-[12px] text-[var(--dash-red-ink)]">The formatted version could not be loaded.</p>

  const guarded =
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">` +
    `<base target="_blank">` +
    html.data.html

  return (
    <iframe
      title="Original formatting"
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={guarded}
      className="h-80 w-full rounded-[9px] border border-[var(--dash-line)] bg-white"
    />
  )
}

function MessageCard({ message, counterpartName }: { message: InboxMessage; counterpartName: string }) {
  const retry = useRetryMessage()
  const [formatted, setFormatted] = useState(false)
  const outgoing = message.direction === 'outgoing'

  return (
    <article
      aria-label={`${outgoing ? 'You wrote' : `${message.fromName || counterpartName || message.fromEmail} wrote`}, ${fullTime(message.occurredAt)}`}
      className={cn(
        'flex w-full max-w-[760px] flex-col gap-2 rounded-[12px] border bg-[var(--dash-surface)] px-4 py-3',
        outgoing ? 'self-end border-[color-mix(in_srgb,var(--dash-brand)_28%,var(--dash-line))]' : 'self-start border-[var(--dash-line)]',
      )}
    >
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]">
        <span className="text-[13px] font-semibold">{outgoing ? 'You' : message.fromName || message.fromEmail}</span>
        <span className="text-[var(--dash-quiet)]" dir="ltr">{outgoing ? `to ${message.toEmail}` : message.fromEmail}</span>
        <time className="dash-num ms-auto text-[var(--dash-quiet)]" dateTime={message.occurredAt}>{fullTime(message.occurredAt)}</time>
      </header>

      <p className="text-[13.5px] leading-relaxed break-words whitespace-pre-wrap [unicode-bidi:plaintext]" dir="auto">
        {message.bodyText || '(no text)'}
      </p>

      {message.incomingAttachments.length > 0 ? (
        <ul className="grid gap-1.5" aria-label="Attachments">
          {message.incomingAttachments.map((file) => (
            <IncomingFile key={file.id} file={file} />
          ))}
        </ul>
      ) : null}

      {message.outgoingAttachments.length > 0 ? (
        <ul className="grid gap-1.5" aria-label="Attachments">
          {message.outgoingAttachments.map((file) => (
            <li key={file.assetId} className="flex items-center gap-2.5 rounded-[9px] border border-[var(--dash-line)] px-2.5 py-1.5">
              <span className="grid size-8 place-items-center rounded-md bg-[var(--dash-chip)] text-[10px] font-bold text-[var(--dash-quiet)]">{fileBadge(file.contentType, file.fileName)}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{file.fileName}</span>
              <span className="text-[11.5px] text-[var(--dash-quiet)]">{fileSize(file.byteSize)} · from Media</span>
            </li>
          ))}
        </ul>
      ) : null}

      {message.hasHtml ? (
        <div className="flex flex-col gap-1.5">
          <button type="button" className="dash-btn dash-btn-ghost h-7 self-start text-[11.5px]" onClick={() => setFormatted((open) => !open)} aria-expanded={formatted}>
            {formatted ? 'Hide formatting' : 'View original formatting'}
          </button>
          {formatted ? <OriginalFormatting messageId={message.id} /> : null}
        </div>
      ) : null}

      {message.delivery ? (
        message.delivery.status === 'failed' ? (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-[9px] bg-[var(--dash-red-tint)] px-3 py-2 text-[12.5px] text-[var(--dash-red-ink)]">
            <AlertTriangle className="size-4" aria-hidden="true" />
            <span>
              <b>Not sent.</b> {message.delivery.failureReason} Your text and attachments are kept. Retrying is safe — it cannot send this email twice.
            </span>
            {message.delivery.canRetry ? (
              <button
                type="button"
                className="dash-btn dash-btn-quiet ms-auto h-7 text-[11.5px]"
                disabled={retry.isPending}
                onClick={async () => {
                  try {
                    await retry.mutateAsync(message.id)
                    notify.success('Sent · accepted by the email service')
                  } catch (error) {
                    notify.error(messageFromError(error))
                  }
                }}
              >
                {retry.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-3.5" aria-hidden="true" />}
                Retry
              </button>
            ) : null}
          </div>
        ) : (
          <p className={cn('inline-flex items-center gap-1.5 text-[12px]', message.delivery.status === 'sending' ? 'text-[var(--dash-blue-ink)]' : 'text-[var(--dash-live)]')}>
            <span className="size-[7px] rounded-full bg-current" aria-hidden="true" />
            {message.delivery.status === 'sending'
              ? 'Sending…'
              : message.delivery.provider === 'fake'
                ? 'Recorded as sent · local test, nothing left the computer'
                : 'Accepted by the email service'}
          </p>
        )
      ) : null}
    </article>
  )
}

export function ConversationPane({
  id,
  onBack,
  backLabel,
  onGone,
  onOpenConversation,
}: {
  id: string
  onBack?: () => void
  backLabel: string
  /** The conversation left the current view (archived, trashed, deleted). */
  onGone: () => void
  onOpenConversation: (id: string) => void
}) {
  const detail = useConversation(id)
  const patch = usePatchConversation()
  const trash = useTrashConversation()
  const restore = useRestoreConversation()
  const remove = useDeleteConversation()
  const [replyDraft, setReplyDraft] = useState<string | null>(null)
  const [openingReply, setOpeningReply] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const thread = useRef<HTMLDivElement>(null)
  const markedRead = useRef<string | null>(null)

  const first = detail.data?.pages[0]
  const conversation = first?.conversation

  // Opening an unread conversation marks it read, once.
  useEffect(() => {
    if (conversation && !conversation.isRead && markedRead.current !== conversation.id) {
      markedRead.current = conversation.id
      patch.mutate({ id: conversation.id, isRead: true })
    }
  }, [conversation, patch])

  // A reply draft the owner left here opens again with its text.
  useEffect(() => {
    setReplyDraft(first?.replyDraftId ?? null)
    // Only when the conversation changes, not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, first?.conversation.id])

  // A new message at the bottom — one just sent, or one that arrived — is shown.
  const newest = detail.data?.pages[0]?.messages.items[0]?.id
  useEffect(() => {
    window.requestAnimationFrame(() => {
      if (thread.current) thread.current.scrollTop = thread.current.scrollHeight
    })
  }, [newest])

  useEffect(() => {
    heading.current?.focus()
    // Scrolled to the newest message on open.
    window.requestAnimationFrame(() => {
      if (thread.current) thread.current.scrollTop = thread.current.scrollHeight
    })
  }, [id, first?.conversation.id])

  if (detail.isPending) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-5" aria-busy="true">
        <span className="dash-skeleton h-6 w-2/3 rounded" />
        <span className="dash-skeleton h-4 w-1/3 rounded" />
        <span className="dash-skeleton h-32 w-full rounded-[12px]" />
      </div>
    )
  }

  if (detail.isError || !conversation) {
    return (
      <div role="alert" className="flex flex-1 flex-col items-start gap-3 p-6">
        <h2 className="text-sm font-semibold">This conversation could not be opened</h2>
        <p className="text-[13px] text-[var(--dash-quiet)]">{messageFromError(detail.error)}</p>
        <div className="flex gap-2">
          <button type="button" className="dash-btn dash-btn-quiet" onClick={() => void detail.refetch()}>Try again</button>
          {onBack ? <button type="button" className="dash-btn dash-btn-ghost" onClick={onBack}>{backLabel}</button> : null}
        </div>
      </div>
    )
  }

  const pages = detail.data.pages as ConversationDetail[]
  const messages = pages.flatMap((page) => page.messages.items).reverse()
  const total = first!.messages.total
  const trashed = conversation.folder === 'trash'
  const name = conversation.counterpartName || conversation.counterpartEmail

  const openReply = async () => {
    if (replyDraft) return

    setOpeningReply(true)

    try {
      const draft = await createDraft({ conversationId: conversation.id })

      setReplyDraft(draft.id)
    } catch (error) {
      notify.error(messageFromError(error))
    } finally {
      setOpeningReply(false)
    }
  }

  const act = async (run: () => Promise<unknown>, message: string, leaves: boolean) => {
    try {
      await run()
      notify.success(message)

      if (leaves) onGone()
    } catch (error) {
      notify.error(messageFromError(error))
    }
  }

  return (
    <section aria-labelledby="conversation-title" className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-2 border-b border-[var(--dash-line)] px-5 py-3.5">
        {onBack ? (
          <button type="button" className="dash-btn dash-btn-ghost h-7 self-start px-1 text-[12px] xl:hidden" onClick={onBack}>
            <ArrowLeft className="size-3.5 rtl:-scale-x-100" aria-hidden="true" /> {backLabel}
          </button>
        ) : null}
        <h2 id="conversation-title" ref={heading} tabIndex={-1} className="dash-title text-[20px] leading-tight outline-none" dir="auto">
          {conversation.subject || '(no subject)'}
        </h2>
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-[var(--dash-quiet)]">
          <span>
            {conversation.counterpartName ? `${conversation.counterpartName} · ` : ''}
            <span dir="ltr">{conversation.counterpartEmail}</span>
          </span>
          <span className="dash-num">{total} message{total === 1 ? '' : 's'}</span>
          {conversation.origin === 'booking' ? <StatusChip tone="blue" className="h-5 px-2 text-[10.5px]">From a booking</StatusChip> : null}
          {trashed ? <StatusChip tone="grey" className="h-5 px-2 text-[10.5px]">In Trash</StatusChip> : null}
          {conversation.folder === 'archived' ? <StatusChip tone="grey" className="h-5 px-2 text-[10.5px]">Archived</StatusChip> : null}
        </p>

        {Object.keys(first!.conversation.facts).length > 0 ? (
          <dl className="flex flex-wrap gap-x-4 gap-y-1 rounded-[9px] border border-[var(--dash-line)] bg-[var(--dash-furniture)] px-3 py-2 text-[12.5px]">
            {Object.entries(first!.conversation.facts).map(([key, value]) => (
              <div key={key} className="flex gap-1.5">
                <dt className="text-[var(--dash-quiet)]">{key}:</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="flex flex-wrap gap-1">
          {trashed ? (
            <>
              <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12px]" onClick={() => void act(() => restore.mutateAsync(conversation.id), 'Restored', true)}>
                <ArchiveRestore className="size-3.5" aria-hidden="true" /> Restore
              </button>
              <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12px] text-[var(--dash-red-ink)]" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-3.5" aria-hidden="true" /> Delete forever…
              </button>
            </>
          ) : (
            <>
              <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12px]" onClick={() => void openReply()} disabled={openingReply}>
                <Reply className="size-3.5" aria-hidden="true" /> Reply
              </button>
              <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12px]" onClick={() => void act(() => patch.mutateAsync({ id: conversation.id, isRead: false }), 'Marked unread', true)}>
                <MailOpen className="size-3.5" aria-hidden="true" /> Mark unread
              </button>
              <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12px]" aria-pressed={conversation.isStarred} onClick={() => void act(() => patch.mutateAsync({ id: conversation.id, isStarred: !conversation.isStarred }), conversation.isStarred ? 'Star removed' : 'Starred', false)}>
                <Star className={cn('size-3.5', conversation.isStarred && 'fill-[#d99a00] text-[#d99a00]')} aria-hidden="true" /> {conversation.isStarred ? 'Starred' : 'Star'}
              </button>
              <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12px]" onClick={() => void act(() => patch.mutateAsync({ id: conversation.id, archived: conversation.folder !== 'archived' }), conversation.folder === 'archived' ? 'Moved to Inbox' : 'Archived — it comes back if they reply', true)}>
                <Archive className="size-3.5" aria-hidden="true" /> {conversation.folder === 'archived' ? 'Move to Inbox' : 'Archive'}
              </button>
              <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12px] text-[var(--dash-red-ink)]" onClick={() => void act(() => trash.mutateAsync(conversation.id), 'Moved to Trash · the whole conversation', true)}>
                <Trash2 className="size-3.5" aria-hidden="true" /> Move to Trash
              </button>
            </>
          )}
        </div>
      </header>

      <div ref={thread} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-[var(--dash-furniture)] px-5 py-4">
        {detail.hasNextPage ? (
          <button type="button" className="dash-btn dash-btn-quiet h-8 self-center text-[12px]" disabled={detail.isFetchingNextPage} onClick={() => void detail.fetchNextPage()}>
            {detail.isFetchingNextPage ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            Show earlier messages ({total - messages.length})
          </button>
        ) : total > 20 ? (
          <span className="self-center text-[11.5px] text-[var(--dash-quiet)]">Beginning of the conversation</span>
        ) : null}
        {messages.map((message) => (
          <MessageCard key={message.id} message={message} counterpartName={name} />
        ))}
      </div>

      {!trashed ? (
        replyDraft ? (
          <Composer
            draftId={replyDraft}
            mode="reply"
            counterpart={{ email: conversation.counterpartEmail, name: conversation.counterpartName }}
            onClose={() => setReplyDraft(null)}
            onSent={(conversationId) => {
              setReplyDraft(null)
              onOpenConversation(conversationId)
            }}
          />
        ) : (
          <div className="border-t border-[var(--dash-line)] p-3">
            <button type="button" className="dash-btn dash-btn-quiet w-full justify-start text-[13px] text-[var(--dash-quiet)]" onClick={() => void openReply()} disabled={openingReply}>
              {openingReply ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Reply className="size-4" aria-hidden="true" />}
              Reply to {name}…
              {conversation.hasDraft ? <StatusChip tone="outline" className="ms-auto h-5 px-2 text-[10.5px]">Draft saved</StatusChip> : null}
            </button>
          </div>
        )
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete this conversation for good?"
          confirmLabel="Delete for good"
          busyLabel="Deleting…"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await remove.mutateAsync(conversation.id)
            setConfirmDelete(false)
            notify.success('Deleted for good')
            onGone()
          }}
        >
          <p>Its messages and the files that arrived with them cannot be restored.</p>
          <p>Files you saved to Media, and Media files you attached, stay in Media.</p>
        </ConfirmDialog>
      ) : null}
    </section>
  )
}
