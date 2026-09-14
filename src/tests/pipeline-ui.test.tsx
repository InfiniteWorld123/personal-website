// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { LeadCard } from '#/frontend/pages/admin/pipeline/LeadCard'
import { TodayStrip } from '#/frontend/pages/admin/pipeline/TodayStrip'
import { PipelineNumbers } from '#/frontend/pages/admin/pipeline/PipelineNumbers'
import type { PipelineCard, PipelineStats, TodayList } from '#/shared/types/pipeline.types'
import {
  DEFAULT_LEAD_PREFERENCES,
  type LeadPreferences,
} from '#/shared/validation/pipeline.validation'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
  useNavigate: () => () => undefined,
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const DAY = 24 * 60 * 60 * 1000

const card = (overrides: Partial<PipelineCard> = {}): PipelineCard => ({
  id: '2f1c3b4e-0000-4000-8000-000000000001',
  name: 'Tobias Lange',
  company: 'Lange Logistik GmbH',
  email: 't.lange@lange-logistik.de',
  status: 'PROPOSAL',
  source: 'BOOKING',
  channel: null,
  language: 'de',
  service: {
    id: 'svc-1',
    slug: 'custom-software',
    name: 'Custom software',
    startPriceCents: 299000,
    currency: 'EUR',
    accent: '#7c6cf0',
  },
  valueCents: 680000,
  currency: 'EUR',
  nextStep: 'Proposal is 11 days old — chase it',
  followUpAt: new Date(Date.now() - 4 * DAY).toISOString(),
  followUpInDays: -4,
  daysInStage: 11,
  isUnread: false,
  isStale: true,
  lostReason: null,
  call: null,
  autoClosedAt: null,
  createdAt: new Date(Date.now() - 18 * DAY).toISOString(),
  ...overrides,
})

const prefs = (overrides: Partial<LeadPreferences> = {}): LeadPreferences => ({
  ...DEFAULT_LEAD_PREFERENCES,
  ...overrides,
})

const show = (node: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe('the board card', () => {
  it('carries the four things the row never had', () => {
    show(<LeadCard card={card()} preferences={prefs()} onOpen={() => undefined} />)

    expect(screen.getByText('Tobias Lange')).toBeTruthy()
    // Money is formatted from integer cents, never sent pre-formatted.
    expect(screen.getByText(/6\.800/)).toBeTruthy()
    expect(screen.getByText('Proposal is 11 days old — chase it')).toBeTruthy()
    expect(screen.getByText('4d overdue')).toBeTruthy()
    expect(screen.getByText('11d here')).toBeTruthy()
  })

  it('shows nothing the owner switched off', () => {
    show(
      <LeadCard
        card={card()}
        preferences={prefs({
          card: { ...DEFAULT_LEAD_PREFERENCES.card, value: false, nextStep: false, age: false },
        })}
        onOpen={() => undefined}
      />,
    )

    expect(screen.queryByText(/6\.800/)).toBeNull()
    expect(screen.queryByText('Proposal is 11 days old — chase it')).toBeNull()
    expect(screen.queryByText('11d here')).toBeNull()
    // The name is not a preference: a card that does not say who it is about
    // is not a card.
    expect(screen.getByText('Tobias Lange')).toBeTruthy()
  })

  it('reads a booked call from the other lens', () => {
    show(
      <LeadCard
        card={card({
          call: {
            id: 'call-1',
            reference: 'ABC-123',
            startsAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
            endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
            status: 'CONFIRMED',
            typeName: 'Projektgespräch',
            durationMinutes: 30,
            service: null,
            held: false,
          },
        })}
        preferences={prefs()}
        onOpen={() => undefined}
      />,
    )

    expect(screen.getByText(/Call today/)).toBeTruthy()
  })

  it('says when a rule closed it', () => {
    show(
      <LeadCard
        card={card({ status: 'LOST', lostReason: 'SILENCE', autoClosedAt: new Date().toISOString() })}
        preferences={prefs()}
        onOpen={() => undefined}
      />,
    )

    expect(screen.getByText('Closed by a rule')).toBeTruthy()
    expect(screen.getByText('Never answered')).toBeTruthy()
  })
})

describe('today', () => {
  const list = (rows: TodayList['rows']): TodayList => ({
    rows,
    applied: { callsMarkedHeld: 0, leadsAutoClosed: 0 },
  })

  it('puts the inbox, the calls and the board in one list', () => {
    show(
      <TodayStrip
        full
        preferences={prefs()}
        onOpen={() => undefined}
        today={list([
          {
            reason: 'call',
            lead: card({ id: 'a', name: 'Amira Haddad' }),
            because: 'Shop-Beratung · 20 min',
            from: 'calls',
            urgency: -100,
          },
          {
            reason: 'unanswered',
            lead: card({ id: 'b', name: 'Sofia Brandt', status: 'NEW' }),
            because: 'Arrived 26h ago, still unanswered',
            from: 'inbox',
            urgency: -50,
          },
          {
            reason: 'overdue',
            lead: card({ id: 'c' }),
            because: 'Follow-up 4d overdue',
            from: 'pipeline',
            urgency: -40,
          },
        ])}
      />,
    )

    expect(screen.getByText('Amira Haddad')).toBeTruthy()
    expect(screen.getByText('Sofia Brandt')).toBeTruthy()
    expect(screen.getByText('calls')).toBeTruthy()
    expect(screen.getByText('inbox')).toBeTruthy()
    expect(screen.getByText('pipeline')).toBeTruthy()
    expect(screen.getByText('3 things')).toBeTruthy()
  })

  it('offers a suggestion with one accept button', () => {
    show(
      <TodayStrip
        full
        preferences={prefs()}
        onOpen={() => undefined}
        today={list([
          {
            reason: 'suggestion',
            lead: card({ id: 'd', name: 'Jonas Richter' }),
            because: 'Silent for 14 days',
            from: 'pipeline',
            suggestion: { rule: 'silence', action: 'Close as “Never answered”' },
            urgency: 50,
          },
        ])}
      />,
    )

    expect(screen.getByRole('button', { name: 'Close as “Never answered”' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'No' })).toBeTruthy()
  })

  /**
   * The safety net under full automation: a lead a rule closed is announced,
   * and one press brings it back.
   */
  it('announces an automatic close with an undo', () => {
    show(
      <TodayStrip
        full
        preferences={prefs()}
        onOpen={() => undefined}
        today={list([
          {
            reason: 'autoClosed',
            lead: card({ id: 'e', status: 'LOST', autoClosedAt: new Date().toISOString() }),
            because: 'Closed automatically after 14 days of silence',
            from: 'pipeline',
            urgency: 40,
          },
        ])}
      />,
    )

    // The reason sits in its own span beside the name, so match the text itself.
    expect(screen.getByText(/Closed automatically after 14 days of silence/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
  })

  it('says so plainly when nothing is owed', () => {
    show(<TodayStrip full preferences={prefs()} onOpen={() => undefined} today={list([])} />)

    expect(screen.getByText(/Everything open has a date in the future/)).toBeTruthy()
  })
})

describe('the numbers', () => {
  const stats = (overrides: Partial<PipelineStats> = {}): PipelineStats => ({
    weightedCents: 1_234_500,
    rawCents: 2_100_000,
    openCount: 9,
    wonCents: 129_000,
    wonCount: 1,
    lostCount: 3,
    conversion: 25,
    medianReplyHours: 6,
    awaitingReply: 1,
    bySource: [{ source: 'BOOKING', total: 4, won: 2 }],
    byService: [
      {
        service: { id: 's', slug: 'online-shop', name: 'Online shop', startPriceCents: 249000, currency: 'EUR', accent: '#0ea5a5' },
        total: 3,
        won: 1,
        openCents: 500_000,
      },
    ],
    byLostReason: [{ reason: 'SILENCE', count: 2 }],
    currency: 'EUR',
    ...overrides,
  })

  it('shows the weighted pipeline beside the raw one', () => {
    show(<PipelineNumbers stats={stats()} preferences={prefs()} />)

    expect(screen.getByText(/12\.345/)).toBeTruthy()
    expect(screen.getByText(/21\.000 .*raw/)).toBeTruthy()
  })

  it('answers the service question the free-text column could not', () => {
    show(<PipelineNumbers stats={stats()} preferences={prefs()} />)

    expect(screen.getByText('By service')).toBeTruthy()
    expect(screen.getByText('Online shop')).toBeTruthy()
  })

  it('draws nothing at all when every number is switched off', () => {
    const { container } = show(
      <PipelineNumbers
        stats={stats()}
        preferences={prefs({
          numbers: {
            pipeline: false,
            won: false,
            conversion: false,
            replyTime: false,
            bySource: false,
            byService: false,
            lost: false,
          },
        })}
      />,
    )

    expect(container.textContent).toBe('')
  })

  it('does not invent a conversion rate before anything has closed', () => {
    show(<PipelineNumbers stats={stats({ conversion: null })} preferences={prefs()} />)

    expect(screen.getByText('nothing closed yet')).toBeTruthy()
  })
})
