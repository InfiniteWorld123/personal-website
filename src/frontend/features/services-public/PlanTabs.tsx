import { ArrowRight } from 'lucide-react'
import { type KeyboardEvent, useRef } from 'react'
import { PLAN_WORDS, formatCents } from '#/frontend/features/services/service-display'
import type { Language } from '#/frontend/i18n/language'
import { cn } from '#/frontend/lib/utils'
import { PLAN_VALUES, type PlanValue } from './service-page'

/**
 * The three ways to pay for a package — Buy, Instalments, Rent — as a
 * segmented tab control above the cards, and the one-line teaser under it.
 *
 * The selected tab lives in the address (`?plan=raten`), so the page is drawn
 * correctly on the server and a link can point straight at the rent tab; this
 * component only asks its parent to change it. The cards below are one tab
 * panel whose content follows the selection.
 */

export const PLAN_PANEL_ID = 'plan-panel'
export const planTabId = (plan: PlanValue) => `plan-tab-${plan}`

export function PlanTabs({
  plan,
  language,
  onSelect,
}: {
  plan: PlanValue
  language: Language
  onSelect: (plan: PlanValue) => void
}) {
  const words = PLAN_WORDS[language]
  const tabs = useRef<Partial<Record<PlanValue, HTMLButtonElement | null>>>({})
  const rtl = language === 'ar'

  /**
   * Arrow keys move along the row as it is drawn: in Arabic the row is
   * mirrored, so "next" is to the left. Home and End jump to the ends, and
   * moving focus selects (the panel is cheap and the selection is the URL).
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = PLAN_VALUES.indexOf(plan)
    const last = PLAN_VALUES.length - 1
    let next: number

    if (event.key === 'ArrowRight') next = at + (rtl ? -1 : 1)
    else if (event.key === 'ArrowLeft') next = at + (rtl ? 1 : -1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    else return

    event.preventDefault()

    const target = PLAN_VALUES[(next + PLAN_VALUES.length) % PLAN_VALUES.length]!

    onSelect(target)
    tabs.current[target]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={words.tabsLabel}
      onKeyDown={onKeyDown}
      className="grid w-full max-w-md grid-cols-3 gap-1 rounded-full border border-border/60 bg-muted/45 p-1"
    >
      {PLAN_VALUES.map((value) => {
        const selected = value === plan

        return (
          <button
            key={value}
            ref={(element) => {
              tabs.current[value] = element
            }}
            id={planTabId(value)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={PLAN_PANEL_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(value)}
            className={cn(
              'h-11 min-w-0 rounded-full px-2 text-sm font-medium transition-colors outline-none',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              selected
                ? 'bg-card text-primary shadow-sm ring-1 ring-border/70'
                : 'text-foreground/62 hover:text-foreground',
            )}
          >
            {words.tabs[value]}
          </button>
        )
      })}
    </div>
  )
}

/**
 * "No budget for everything at once? Rent from 34,99 €/month →" — shown on
 * Buy only, and it switches to Rent. Its space is kept on the other tabs, so
 * the cards below do not move when the visitor changes tab.
 */
export function RentTeaser({
  show,
  cheapestRentCents,
  language,
  onRent,
}: {
  show: boolean
  cheapestRentCents: number
  language: Language
  onRent: () => void
}) {
  return (
    <div className="min-h-[3.25rem] sm:min-h-7">
      {show ? (
        <button
          type="button"
          onClick={onRent}
          className="inline-flex items-start gap-1.5 text-start text-sm leading-6 font-medium text-primary underline-offset-4 hover:text-primary/80 hover:underline"
        >
          <span>{PLAN_WORDS[language].teaser(formatCents(cheapestRentCents, language))}</span>
          <ArrowRight aria-hidden="true" className="mt-1 size-4 shrink-0 rtl:-scale-x-100" />
        </button>
      ) : null}
    </div>
  )
}
