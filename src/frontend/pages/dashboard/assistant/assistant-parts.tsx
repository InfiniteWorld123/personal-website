import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { AssistantLanguage, AssistantOutcome } from '#/backend2/contracts/assistant.contract'
import { PageHead, StatusChip } from '#/frontend/dashboard/primitives'
import { cn } from '#/frontend/lib/utils'

/**
 * The small pieces the two assistant screens share, so a conversation is
 * described the same way in the list, in the reader and in the tests.
 *
 * This is a transcript viewer for the chat on the public website — not an
 * assistant inside the Dashboard (`AGENTS.md`).
 */

export const LANGUAGE_WORDS: Record<AssistantLanguage, string> = { de: 'German', en: 'English', ar: 'Arabic' }

/** Arabic reads right to left; the other two left to right. */
export const directionOf = (language: AssistantLanguage): 'rtl' | 'ltr' => (language === 'ar' ? 'rtl' : 'ltr')

/**
 * Amber is not one of the Dashboard's five chip tones, and it is used here on
 * purpose: "not on the website" is neither good news nor a failure — it is a
 * to-do for the site. The two pairs pass AA on their own tint (Design Lab).
 */
const AMBER = 'bg-[#fff4dc] text-[#8a5a00] dark:bg-[#2e2616] dark:text-[#ffc766]'

/** The same amber as a quiet warning box: the privacy note beside the switch. */
export const AMBER_BANNER = 'bg-[#fff4dc] dark:bg-[#2e2616]'

export const OUTCOME_WORDS: Record<AssistantOutcome, string> = {
  answered: 'Answered',
  fallback: 'Not on the website',
  handoff: 'Sent to contact',
  smalltalk: 'Greeting',
}

export function OutcomeChip({ outcome, className }: { outcome: AssistantOutcome; className?: string }) {
  if (outcome === 'fallback') {
    return (
      <span className={cn('inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold', AMBER, className)}>
        {OUTCOME_WORDS.fallback}
      </span>
    )
  }

  return (
    <StatusChip tone={outcome === 'handoff' ? 'blue' : 'grey'} className={className}>
      {OUTCOME_WORDS[outcome]}
    </StatusChip>
  )
}

/**
 * A list row only knows how many replies had no answer, so it says that —
 * or "Answered" when every reply found something on the website.
 */
export function ConversationChip({ fallbackCount, className }: { fallbackCount: number; className?: string }) {
  if (fallbackCount > 0) {
    return (
      <span
        className={cn('inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold', AMBER, className)}
        title={fallbackCount > 1 ? `${fallbackCount} questions had no answer on the website` : undefined}
      >
        {OUTCOME_WORDS.fallback}
        {fallbackCount > 1 ? <span className="dash-num">×{fallbackCount}</span> : null}
      </span>
    )
  }

  return <StatusChip tone="grey" className={className}>{OUTCOME_WORDS.answered}</StatusChip>
}

/** A server sentence, ended with a full stop, so another sentence can follow it. */
export const failureText = (message: string): string =>
  `${/[.!?…]$/u.test(message.trim()) ? message.trim() : `${message.trim()}.`} Nothing was changed.`

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const clock = (date: Date) => date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** "Today, 09:14", "Yesterday, 21:40", "21 Sep", or "21 Sep 2025". */
export const whenWords = (iso: string, now: Date = new Date()): string => {
  const date = new Date(iso)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  if (sameDay(date, now)) return `Today, ${clock(date)}`
  if (sameDay(date, yesterday)) return `Yesterday, ${clock(date)}`
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const fullWhen = (iso: string): string =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

type AssistantTab = 'conversations' | 'settings'

const TABS: Record<AssistantTab, { label: string; to: string; title: string; description: string }> = {
  conversations: {
    label: 'Conversations',
    to: '/dashboard/assistant',
    title: 'Conversations',
    description: 'What visitors asked the chat on your website. Only you can see this page.',
  },
  settings: {
    label: 'Settings & usage',
    to: '/dashboard/assistant/settings',
    title: 'Settings & usage',
    description: 'Whether the chat is on, how long conversations are kept, and what it has cost.',
  },
}

/**
 * How both screens open: the name, the tab's own sentence, and the two tabs.
 * The tabs are links, so each has an address and Back works.
 */
export function AssistantHead({ tab, actions }: { tab: AssistantTab; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHead eyebrow="WEBSITE ASSISTANT" title={TABS[tab].title} description={TABS[tab].description} actions={actions} />
      <nav aria-label="Assistant sections" className="flex flex-wrap gap-1">
        {(Object.keys(TABS) as AssistantTab[]).map((key) => (
          <Link
            key={key}
            to={TABS[key].to}
            aria-current={key === tab ? 'page' : undefined}
            className={cn(
              'inline-flex h-8 items-center rounded-lg px-3 text-[12.5px] whitespace-nowrap',
              key === tab
                ? 'bg-[var(--dash-chip)] font-semibold text-[var(--dash-ink)]'
                : 'font-medium text-[var(--dash-quiet)] hover:bg-[var(--dash-hover)] hover:text-[var(--dash-ink)]',
            )}
          >
            {TABS[key].label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
