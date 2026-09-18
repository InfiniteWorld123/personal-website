import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import { MessageSquare, Send, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { askAssistant, fetchChatIntro } from '#/frontend/api/chat.api'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { cn } from '#/frontend/lib/utils'
import { CHAT_MESSAGE_MAX_LENGTH } from '#/shared/validation/chat.validation'
import { AssistantLine } from './AssistantLine'
import { chatCopy } from './chat.copy'

/**
 * The assistant, in the corner of every public page (D34).
 *
 * Deliberately *not* the widget every site ships. Three things are different,
 * and each of them is the site's own identity rather than a decoration:
 *
 * 1. It is anchored to its own button rather than floating in a dimmed
 *    overlay. Nothing here is important enough to take the page away.
 * 2. It wears the card language the rest of the site wears — the same radius,
 *    the same hairline border, the same two-layer blue shadow (D21).
 * 3. The line saying a machine is answering sits at the *top*, in the brand's
 *    own accent, at the size of real copy. Every other site hides that
 *    sentence in grey six-point type under the composer. The owner is selling
 *    "explains instead of claiming"; burying it would contradict the product
 *    in the product.
 */

type Line = { author: 'VISITOR' | 'ASSISTANT'; body: string; fresh?: boolean }

const STORAGE_KEY = 'chat.conversation'

/** `sessionStorage` throws in a private window; a lost id costs a new conversation, nothing more. */
const readStoredConversation = (): string | undefined => {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

const storeConversation = (id: string): void => {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* Nothing to do: the conversation simply will not survive a reload. */
  }
}

export function ChatWidget() {
  const { language } = useLanguage()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const copy = chatCopy[language]

  const [open, setOpen] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [draft, setDraft] = useState('')
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const [exhausted, setExhausted] = useState(false)

  const panelId = useId()
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)

  // Fetched rather than bundled, so a settings change reaches the next visitor
  // instead of the next deploy. Only once the panel is opened: a visitor who
  // never opens it should not pay for a request.
  const { data: intro } = useQuery({
    queryKey: ['chat-intro', language],
    queryFn: () => fetchChatIntro(language),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const ask = useMutation({
    mutationFn: (message: string) =>
      askAssistant({ message, language, conversationId, path: pathname }),
    onSuccess: (answer) => {
      setConversationId(answer.conversationId)
      storeConversation(answer.conversationId)
      setExhausted(!answer.canContinue)
      setLines((current) => [...current, { author: 'ASSISTANT', body: answer.reply, fresh: true }])
    },
    onError: () => {
      setLines((current) => [...current, { author: 'ASSISTANT', body: copy.failed, fresh: true }])
    },
  })

  useEffect(() => {
    setConversationId(readStoredConversation())
  }, [])

  // The log is the thing that moves; the page behind it must not.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [lines, ask.isPending])

  const close = useCallback(() => {
    setOpen(false)
    // Focus goes back where it came from, or it lands on the document body and
    // a keyboard visitor starts the page again from the top.
    launcherRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const send = (message: string) => {
    const text = message.trim()

    if (!text || ask.isPending || exhausted) return

    setLines((current) => [...current, { author: 'VISITOR', body: text }])
    setDraft('')
    ask.mutate(text)
  }

  const showSuggestions =
    lines.length === 0 && (intro?.suggestions.length ?? 0) > 0 && !ask.isPending

  return (
    <div
      className={cn(
        'pointer-events-none fixed bottom-5 z-40 flex flex-col items-end gap-3',
        // `end-5`, not `right-5`: it compiles to `inset-inline-end`, so the
        // Arabic pages put the bubble in the corner Arabic reading ends in
        // without a second rule. (`inset-inline-end-5` is not a utility —
        // it silently compiled to nothing and left the bubble on the left.)
        'end-5 print:hidden',
      )}
    >
      {open ? (
        <section
          id={panelId}
          role="dialog"
          aria-label={copy.title}
          className={cn(
            'pointer-events-auto flex w-[min(22rem,calc(100vw-2.5rem))] flex-col overflow-hidden',
            'rounded-[var(--radius)] border border-border bg-card',
            'shadow-[var(--shadow-card-hover)]',
            'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200',
          )}
        >
          <header className="flex items-center gap-2.5 border-b border-border/60 bg-secondary/60 px-3.5 py-2.5">
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-full bg-primary font-heading text-xs font-semibold text-primary-foreground"
            >
              Y
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{copy.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{copy.subtitle}</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={close}
              aria-label={copy.close}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </header>

          {/* The signature. Stated at the top, in the brand's own accent, at
              the size of real copy — not hidden under the composer. */}
          <p className="border-b border-border/60 bg-accent px-3.5 py-2 text-xs leading-relaxed text-accent-foreground">
            {intro?.disclosure ?? copy.disclosureFallback}
          </p>

          <div
            ref={logRef}
            className="flex max-h-[19rem] min-h-[9rem] flex-col gap-2.5 overflow-y-auto px-3.5 py-3.5"
            aria-live="polite"
            aria-busy={ask.isPending}
          >
            {intro?.settings.opening !== 'silent' && intro ? (
              <Bubble author="ASSISTANT">{intro.greeting}</Bubble>
            ) : null}

            {lines.map((line, index) => (
              <Bubble key={`${line.author}-${index}`} author={line.author}>
                {line.author === 'ASSISTANT' && line.fresh && intro?.settings.reveal === 'stream' ? (
                  <AssistantLine text={line.body} />
                ) : (
                  line.body
                )}
              </Bubble>
            ))}

            {ask.isPending ? (
              <Bubble author="ASSISTANT">
                <span className="sr-only">{copy.thinking}</span>
                <span aria-hidden className="inline-flex gap-1 py-1">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="size-1.5 rounded-full bg-muted-foreground/60 motion-safe:animate-pulse"
                      style={{ animationDelay: `${dot * 140}ms` }}
                    />
                  ))}
                </span>
              </Bubble>
            ) : null}
          </div>

          {showSuggestions ? (
            <div className="flex flex-wrap gap-1.5 px-3.5 pb-3">
              {intro?.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className={cn(
                    'rounded-full border border-primary/40 px-2.5 py-1 text-xs text-primary',
                    'transition-colors hover:bg-primary hover:text-primary-foreground',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  )}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="flex items-center gap-2 border-t border-border/60 px-3 py-2.5"
            onSubmit={(event) => {
              event.preventDefault()
              send(draft)
            }}
          >
            <label className="sr-only" htmlFor={`${panelId}-input`}>
              {copy.inputLabel}
            </label>
            <Input
              id={`${panelId}-input`}
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={exhausted ? copy.exhausted : copy.placeholder}
              maxLength={CHAT_MESSAGE_MAX_LENGTH}
              disabled={exhausted}
              autoComplete="off"
              className="h-9 rounded-full text-sm"
            />
            <Button
              type="submit"
              size="icon"
              className="size-9 shrink-0 rounded-full"
              disabled={exhausted || ask.isPending || draft.trim() === ''}
              aria-label={copy.send}
            >
              <Send className="size-4" aria-hidden />
            </Button>
          </form>
        </section>
      ) : null}

      <Button
        ref={launcherRef}
        type="button"
        onClick={() => {
          setOpen(true)
          // After the panel has mounted, not before it exists.
          window.requestAnimationFrame(() => inputRef.current?.focus())
        }}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={cn(
          'pointer-events-auto gap-2 rounded-full shadow-[var(--shadow-card-hover)]',
          open && 'hidden',
        )}
      >
        <MessageSquare className="size-4" aria-hidden />
        {copy.launcher}
      </Button>
    </div>
  )
}

function Bubble({ author, children }: { author: Line['author']; children: React.ReactNode }) {
  const mine = author === 'VISITOR'

  return (
    <p
      className={cn(
        'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
        mine
          ? 'self-end rounded-ee-sm bg-primary text-primary-foreground'
          : 'self-start rounded-es-sm border border-border/60 bg-secondary/50',
      )}
    >
      {children}
    </p>
  )
}
