import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Info, Loader2, Trash2, X } from 'lucide-react'
import type { OwnerConversation, OwnerMessage } from '#/backend2/contracts/assistant.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { Initials } from '#/frontend/dashboard/primitives'
import { BlogDialog, DialogActions, DialogAlert, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import { assistantKeys, useAssistantConversation, useDeleteAssistantConversation } from '#/frontend/features/assistant-v2/queries'
import { messageFromError, notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { LoadFailure } from '../blog/blog-parts'
import { LANGUAGE_WORDS, OutcomeChip, directionOf, failureText, fullWhen, whenWords } from './assistant-parts'

/**
 * One conversation from the chat on the public website, read top to bottom:
 * the visitor's questions and the assistant's replies, each reply with the
 * pages it quoted. Beside the list on a wide screen, the whole screen on a
 * phone (approved Design Lab, 24 Sep 2026).
 *
 * The visitor is anonymous: the conversation holds no name, address or IP.
 */

function DeleteDialog({
  conversation,
  onClose,
  onDeleted,
}: {
  conversation: OwnerConversation
  onClose: () => void
  onDeleted: () => void
}) {
  const remove = useDeleteAssistantConversation()
  const [understood, setUnderstood] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  return (
    <BlogDialog labelledBy="assistant-delete-title" describedBy="assistant-delete-text" role="alertdialog" size="sm" onClose={onClose}>
      <DialogTitle id="assistant-delete-title">Delete this conversation for good?</DialogTitle>
      <p id="assistant-delete-text" className="text-[13px] leading-relaxed text-[var(--dash-quiet)]">
        All {conversation.messageCount} messages in it are removed from your dashboard and the database. The daily counts in Settings &amp;
        usage stay, because they never contained any text.
      </p>
      <label className="flex items-start gap-2.5 text-[13px]">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--dash-red)]"
          checked={understood}
          onChange={(event) => setUnderstood(event.target.checked)}
        />
        I understand this cannot be undone.
      </label>
      {failure ? <DialogAlert>{failure}</DialogAlert> : null}
      <DialogActions>
        <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose} data-autofocus>
          Keep it
        </button>
        <button
          type="button"
          className="dash-btn dash-tone-red"
          disabled={!understood || remove.isPending}
          onClick={async () => {
            setFailure(null)

            try {
              await remove.mutateAsync(conversation.id)
              notify.success('Conversation deleted')
              onDeleted()
            } catch (error) {
              setFailure(messageFromError(error))
            }
          }}
        >
          {remove.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="size-4" aria-hidden="true" />
          )}
          {remove.isPending ? 'Deleting…' : 'Delete permanently'}
        </button>
      </DialogActions>
    </BlogDialog>
  )
}

function Reply({ message }: { message: OwnerMessage }) {
  const dir = directionOf(message.language)
  const visitor = message.role === 'visitor'

  return (
    <li className={cn('flex flex-col gap-1.5', visitor ? 'items-end' : 'items-start')}>
      <span className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.06em] text-[var(--dash-quiet)]">
        {visitor ? 'VISITOR' : 'ASSISTANT'}
        <time className="dash-num font-normal tracking-normal" dateTime={message.createdAt} title={fullWhen(message.createdAt)}>
          {whenWords(message.createdAt)}
        </time>
        {!visitor && message.outcome && message.outcome !== 'answered' ? (
          <OutcomeChip outcome={message.outcome} className="h-[18px] px-1.5 text-[10.5px] tracking-normal" />
        ) : null}
      </span>
      <div
        dir={dir}
        lang={message.language}
        className={cn(
          'max-w-[88%] rounded-2xl border px-3.5 py-2.5 text-[13px] leading-relaxed break-words whitespace-pre-line',
          visitor
            ? 'rounded-ee-md border-transparent bg-[var(--dash-blue-tint)] text-[var(--dash-ink)]'
            : 'rounded-es-md border-[var(--dash-line)] bg-[var(--dash-furniture)] text-[var(--dash-ink)]',
        )}
      >
        {message.body}
        {message.sources.length > 0 ? (
          <div className="mt-2.5 flex flex-col gap-1 border-t border-[var(--dash-line)] pt-2 whitespace-normal">
            <span className="text-[10.5px] font-semibold tracking-[0.08em] text-[var(--dash-quiet)]" dir="ltr">
              SOURCES
            </span>
            {message.sources.map((source) => (
              <a
                key={`${source.kind}:${source.url}`}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 self-start text-[12.5px] font-semibold text-[var(--dash-blue-ink)] hover:underline"
              >
                {source.title}
                <ExternalLink className="size-3 shrink-0 opacity-70" aria-hidden="true" />
                <span className="sr-only">(opens the public page in a new tab)</span>
              </a>
            ))}
          </div>
        ) : null}
        {!visitor && message.offeredContact ? (
          <p className="mt-2 text-[11.5px] whitespace-normal text-[var(--dash-quiet)]" dir="ltr">
            Offered the Contact and Booking links.
          </p>
        ) : null}
      </div>
    </li>
  )
}

function ReaderSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the conversation" className="flex flex-col gap-4 p-5">
      <span className="dash-skeleton h-5 w-2/3 rounded" />
      <span className="dash-skeleton h-3 w-1/3 rounded" />
      <span className="dash-skeleton ms-auto h-10 w-1/2 rounded-2xl" />
      <span className="dash-skeleton h-20 w-3/4 rounded-2xl" />
    </div>
  )
}

export function ConversationReader({
  id,
  onClose,
  onDeleted,
}: {
  id: string
  /**
   * Back to the list: "All conversations" where the reader has the screen to
   * itself (a phone, a narrow window), a close button where it sits beside
   * the list.
   */
  onClose: () => void
  onDeleted: () => void
}) {
  const conversation = useAssistantConversation(id)
  const client = useQueryClient()
  const [deleting, setDeleting] = useState(false)

  const back = (
    <button type="button" className="dash-btn dash-btn-ghost -ms-2 h-8 self-start px-2 text-[12.5px] xl:hidden" onClick={onClose}>
      <ArrowLeft className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
      All conversations
    </button>
  )

  if (conversation.isPending) {
    return (
      <section aria-label="Conversation" className="dash-panel flex flex-col">
        <div className="px-5 pt-4">{back}</div>
        <ReaderSkeleton />
      </section>
    )
  }

  if (conversation.isError) {
    const gone = conversation.error instanceof ApiRequestError && conversation.error.status === 404

    return (
      <section aria-label="Conversation" className="dash-panel flex flex-col">
        <div className="px-5 pt-4">{back}</div>
        {gone ? (
          <div role="alert" className="flex flex-col items-start gap-3 p-8">
            <h2 className="text-sm font-semibold">This conversation no longer exists</h2>
            <p className="max-w-[52ch] text-[13px] text-[var(--dash-quiet)]">
              It was deleted — by you, or by the automatic deletion in Settings &amp; usage.
            </p>
            <button type="button" className="dash-btn dash-btn-quiet" onClick={onClose}>
              Back to the list
            </button>
          </div>
        ) : (
          <LoadFailure
            title="The conversation could not load"
            message={failureText(messageFromError(conversation.error))}
            onRetry={() => void conversation.refetch()}
          />
        )}
      </section>
    )
  }

  const data = conversation.data
  const first = data.messages.find((message) => message.role === 'visitor')
  const unanswered = data.messages.filter((message) => message.role === 'assistant' && message.outcome === 'fallback').length
  const otherPage = data.pageLocale && data.pageLocale !== data.language ? data.pageLocale : null

  return (
    <section
      aria-labelledby="assistant-reader-title"
      className="dash-panel flex min-w-0 flex-col xl:sticky xl:top-0 xl:max-h-[calc(100dvh-7.5rem)] xl:overflow-hidden"
    >
      <div className="flex flex-col gap-3 border-b border-[var(--dash-line)] px-5 pt-4 pb-4">
        {back}
        <div className="flex items-start gap-3.5">
          <Initials className="size-10 rounded-[11px] text-[12px]">{data.language.toUpperCase()}</Initials>
          <div className="min-w-0 flex-1">
            <h2
              id="assistant-reader-title"
              dir="auto"
              lang={data.language}
              className="dash-title text-left text-[20px] leading-tight break-words"
            >
              {first?.body ?? 'A conversation without a question'}
            </h2>
            <p className="mt-1 text-[12.5px] text-[var(--dash-quiet)]">
              <time dateTime={data.createdAt} title={fullWhen(data.createdAt)}>
                {whenWords(data.createdAt)}
              </time>
              {' · '}
              {LANGUAGE_WORDS[data.language]}
              {otherPage ? ` on the ${LANGUAGE_WORDS[otherPage]} page` : ''}
              {' · '}
              <span className="dash-num">{data.messageCount}</span> messages · anonymous visitor
            </p>
          </div>
          <button
            type="button"
            className="dash-btn dash-btn-ghost hidden h-8 px-2 xl:inline-flex"
            aria-label="Close the conversation"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unanswered > 0 ? <OutcomeChip outcome="fallback" /> : <OutcomeChip outcome="answered" />}
          <span className="flex-1" />
          <button
            type="button"
            className="dash-btn dash-btn-quiet h-8 text-[12.5px] text-[var(--dash-red-ink)]"
            onClick={() => setDeleting(true)}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete
          </button>
        </div>
      </div>

      {/* Beside a long list the reader stays in view, and the transcript scrolls inside it. */}
      <div className="flex min-h-0 flex-col xl:overflow-y-auto">
        <ol aria-label="Messages" className="flex flex-col gap-3.5 px-5 py-4">
          {data.messages.map((message) => (
            <Reply key={message.id} message={message} />
          ))}
        </ol>

        {unanswered > 0 ? (
          <div className="mx-5 mb-5 flex items-start gap-2.5 rounded-[10px] bg-[var(--dash-blue-tint)] px-3.5 py-3 text-[12.5px] leading-relaxed">
            <Info className="mt-0.5 size-4 shrink-0 text-[var(--dash-blue-ink)]" aria-hidden="true" />
            <div className="flex flex-col gap-1.5">
              <p>
                <b className="block text-[13px]">Worth a page?</b>
                {unanswered === 1
                  ? 'Nothing on your website answers this question.'
                  : `Nothing on your website answers ${unanswered} of these questions.`}{' '}
                If you add it to a page or the FAQ, the assistant uses it from then on.
              </p>
              <Link
                to="/dashboard/content"
                search={{ page: 'faq' }}
                className="self-start font-semibold text-[var(--dash-blue-ink)] hover:underline"
              >
                Open the FAQ in Content
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      {deleting ? (
        <DeleteDialog
          conversation={data}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setDeleting(false)
            onDeleted()
            // Only after the reader has closed, so it never re-reads a conversation that is gone.
            window.setTimeout(() => client.removeQueries({ queryKey: assistantKeys.one(id) }), 0)
          }}
        />
      ) : null}
    </section>
  )
}
