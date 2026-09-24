// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  ANALYTICS_PRESETS,
  ANALYTICS_SECTIONS,
  type AnalyticsBreakdown,
  type AnalyticsMetric,
  type AnalyticsOverviewResponse,
  type AnalyticsSectionResponse,
  DEFAULT_ANALYTICS_PRESET,
  LEAD_ORIGINS,
} from '#/backend2/contracts/analytics.contract'

/**
 * The Dashboard Overview and Analytics screens (`docs/v2/analytics.md`), as
 * approved in the Design Lab (24 Sep 2026): every state a figure can be in
 * reads as words and never as a zero, the period and tab live in the address,
 * each card offers a table and its definition, and one failing source leaves
 * the rest standing. All figures here are fictional fixtures.
 */

const navigate = vi.fn()

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({ to, children, search: _search, params: _params, ...rest }: { to: string; children: ReactNode; search?: unknown; params?: unknown }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}))

const search = await import('#/frontend/features/analytics-v2/analytics-search')
const format = await import('#/frontend/features/analytics-v2/format')
const charts = await import('#/frontend/features/analytics-v2/charts')
const { AnalyticsPage } = await import('#/frontend/pages/dashboard/analytics/AnalyticsPage')
const { OverviewPage } = await import('#/frontend/pages/dashboard/OverviewPage')
const { Route: analyticsRoute } = await import('#/frontend/routes/dashboard.analytics')

/* ----------------------------------------------------------------- fixtures */

const PERIOD = {
  preset: '30d' as const,
  from: '2026-08-26',
  to: '2026-09-24',
  days: 30,
  start: '2026-08-25T22:00:00.000Z',
  end: '2026-09-24T22:00:00.000Z',
  bucket: 'day' as const,
  timezone: 'Europe/Berlin' as const,
  previous: { from: '2026-07-27', to: '2026-08-25', start: '2026-07-26T22:00:00.000Z', end: '2026-08-25T22:00:00.000Z' },
}
const AS_OF = '2026-09-24T08:00:00.000Z'

const metric = (key: string, over: Partial<AnalyticsMetric> = {}): AnalyticsMetric => ({
  key,
  label: key,
  description: `What ${key} counts.`,
  unit: 'count',
  scope: 'period',
  state: 'ready',
  value: 0,
  source: 'backend2.leads',
  timezone: 'Europe/Berlin',
  asOf: AS_OF,
  ...over,
})

const breakdown = (key: string, over: Partial<AnalyticsBreakdown> = {}): AnalyticsBreakdown => ({
  key,
  label: key,
  description: `What ${key} counts.`,
  unit: 'count',
  scope: 'period',
  state: 'ready',
  source: 'backend2.leads',
  timezone: 'Europe/Berlin',
  asOf: AS_OF,
  total: 0,
  items: [],
  truncated: false,
  ...over,
})

const section = (name: AnalyticsSectionResponse['section'], groups: AnalyticsSectionResponse['groups']): AnalyticsSectionResponse => ({
  section: name,
  label: name,
  period: PERIOD,
  filters: {},
  asOf: AS_OF,
  timezone: 'Europe/Berlin',
  groups,
})

const series = (values: number[]) => ({
  bucket: 'day' as const,
  points: values.map((value, index) => ({ date: `2026-09-${String(20 + index).padStart(2, '0')}`, value })),
})

const WEBSITE = section('website', [
  {
    key: 'traffic',
    label: 'Visitors',
    source: 'posthog',
    notes: ['Only public pages count.'],
    metrics: [
      metric('website.visitors', { label: 'Website visitors', state: 'not-connected', value: null, source: 'posthog', message: 'Website statistics are not connected yet.' }),
    ],
    breakdowns: [],
  },
  {
    key: 'actions',
    label: 'What visitors did',
    source: 'backend2.booking',
    notes: [],
    metrics: [
      metric('website.onlineBookings', { label: 'Bookings made on the website', value: 4, previous: { value: 2, from: '2026-07-27', to: '2026-08-25' } }),
      metric('website.contactSubmissions', { label: 'Contact form messages', state: 'not-built', value: null, message: 'The public contact form does not send to Backend2 yet. This is not zero.' }),
    ],
    breakdowns: [],
  },
])

const SALES = section('sales', [
  {
    key: 'leads',
    label: 'Leads',
    source: 'backend2.leads',
    notes: ['Leads in Trash are not counted anywhere.'],
    metrics: [
      metric('leads.new', { label: 'New leads', value: 6, series: series([1, 0, 2, 0, 3]), previous: { value: 3, from: '', to: '' } }),
      metric('leads.won', { label: 'Won', value: 3 }),
      metric('leads.lost', { label: 'Lost', value: 2 }),
      metric('leads.wonRate', {
        label: 'Won rate',
        unit: 'ratio',
        value: 0.6,
        rate: { numerator: 3, denominator: 5, numeratorLabel: 'Won in the period', denominatorLabel: 'Won + Lost in the period' },
      }),
    ],
    breakdowns: [
      breakdown('leads.sources', {
        label: 'Where new leads came from',
        total: 6,
        items: [
          { key: 'a', label: 'Google Maps', value: 4 },
          { key: 'b', label: 'Instagram', value: 2 },
        ],
      }),
      breakdown('leads.lostReasons', { label: 'Why leads were lost', state: 'error', total: null, message: 'This figure could not be loaded just now. Try again in a moment.' }),
    ],
  },
])

type Answer = { status?: number; body: unknown } | 'hang'

const answers = new Map<string, Answer>()

const answer = (path: string, value: Answer) => answers.set(path, value)

beforeEach(() => {
  answers.clear()
  navigate.mockReset()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input, 'http://localhost')
      const found = answers.get(url.pathname + url.search) ?? answers.get(url.pathname)

      if (!found) throw new Error(`No fixture for ${url.pathname}${url.search}`)
      if (found === 'hang') return new Promise(() => {})

      const status = found.status ?? 200

      return new Response(JSON.stringify(status === 200 ? { success: true, data: found.body } : found.body), { status })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const renderWithClient = (node: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>,
  )

/* =================================================================== search */

describe('the Analytics address', () => {
  it('spells out the same tabs, periods and origins as the contract', () => {
    expect([...search.ANALYTICS_TABS]).toEqual([...ANALYTICS_SECTIONS])
    expect([...search.ANALYTICS_PERIODS]).toEqual([...ANALYTICS_PRESETS])
    expect(search.DEFAULT_PERIOD).toBe(DEFAULT_ANALYTICS_PRESET)
    expect(['all', ...search.LEAD_ORIGIN_FILTERS]).toEqual([...LEAD_ORIGINS])
  })

  it('keeps known values, drops unknown ones and leaves the defaults out', () => {
    const validate = analyticsRoute.options.validateSearch as (raw: Record<string, unknown>) => Record<string, unknown>

    expect(validate({ tab: 'money', period: '90d', origin: 'imported' })).toEqual({ tab: 'money', period: '90d', origin: 'imported' })
    expect(validate({ tab: 'website', period: '30d', origin: 'all' })).toEqual({})
    expect(validate({ tab: 'nope', period: '14d', origin: 1 })).toEqual({})
  })
})

/* =================================================================== format */

describe('how figures read', () => {
  it('never turns a missing value into a zero', () => {
    expect(format.formatValue('count', null)).toBeNull()
    expect(format.formatValue('ratio', 0.6)).toBe('60%')
    expect(format.formatValue('ratio', 0.045)).toBe('4.5%')
    expect(format.formatValue('bytes', 81_100_000)).toBe('81.1 MB')
    expect(format.formatDelta(5, null)).toBeNull()
    expect(format.formatDelta(0, 0)).toBe('No change')
    expect(format.formatDelta(4, 0)).toBe('Up from 0')
    expect(format.formatDelta(9, 20)).toBe('−55%')
  })

  it('keeps each currency apart and compares it only with itself', () => {
    const received = metric('money.received', {
      unit: 'money',
      value: null,
      amounts: [
        { currency: 'EUR', minor: 89500 },
        { currency: 'USD', minor: 100000 },
      ],
      previous: { value: null, amounts: [{ currency: 'EUR', minor: 200000 }], from: '', to: '' },
    })

    expect(format.formatMoney({ currency: 'EUR', minor: 89500 })).toBe('€895.00')
    expect(format.moneyDelta(received, 'EUR')).toBe('−55%')
    expect(format.moneyDelta(received, 'USD')).toBe('Up from 0')
  })

  it('reads Berlin calendar dates without the browser moving them', () => {
    expect(format.bucketLabel('2026-03-29', 'day')).toBe('Sun 29 Mar')
    expect(format.bucketLabel('2026-09-01', 'month')).toBe('September 2026')
    expect(format.bucketLabel('2026-09-07', 'week')).toBe('Week of 7 Sept')
    expect(format.dateRange('2026-08-26', '2026-09-24')).toBe('26 Aug – 24 Sept 2026')
  })

  it('draws round axis steps and never crowds the last label', () => {
    expect(charts.niceScale(0)).toEqual({ top: 4, step: 1 })
    expect(charts.niceScale(3)).toEqual({ top: 3, step: 1 })
    expect(charts.niceScale(37)).toEqual({ top: 40, step: 10 })
    expect(charts.labelIndexes(30, 6)).toEqual([0, 5, 10, 15, 20, 25, 29])
    expect(charts.labelIndexes(12, 3)).toEqual([0, 4, 8, 11])
  })
})

/* ==================================================================== chart */

describe('the line chart', () => {
  it('has a text alternative and reads each point from the keyboard', () => {
    render(<charts.LineChart points={series([1, 0, 4]).points} bucket="day" name={['new lead', 'new leads']} />)

    const chart = screen.getByRole('img')

    expect(chart.textContent).toContain('5 new leads from Sun 20 Sept to Tue 22 Sept')
    expect(chart.textContent).toContain('the highest was 4')

    fireEvent.focus(chart)
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    expect(screen.getByText('Mon 21 Sept: 0 new leads')).toBeTruthy()
    fireEvent.keyDown(chart, { key: 'Home' })
    expect(screen.getByText('Sun 20 Sept: 1 new lead')).toBeTruthy()
  })
})

/* ================================================================ analytics */

describe('the Analytics page', () => {
  it('shows skeletons while the figures load', () => {
    answer('/api/v2/owner/analytics/sections/website', 'hang')
    answer('/api/v2/owner/analytics/rankings/blog-posts', 'hang')
    renderWithClient(<AnalyticsPage search={{}} />)

    expect(screen.getByLabelText('Loading figures')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Website & content/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('button', { name: 'Last 30 days' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('says "not connected" and "not available yet" in words, never as zero', async () => {
    answer('/api/v2/owner/analytics/sections/website', { body: WEBSITE })
    answer('/api/v2/owner/analytics/rankings/blog-posts', {
      body: { key: 'blog-posts', label: 'Articles by reads (all time)', description: 'd', unit: 'count', scope: 'all-time', state: 'empty', source: 'backend2.blog', timezone: 'Europe/Berlin', asOf: AS_OF, message: 'Nothing to rank in this period.', period: PERIOD, filters: { by: 'reads' }, items: [], page: 1, pageSize: 10, total: 0, pageCount: 1, hasMore: false },
    })
    renderWithClient(<AnalyticsPage search={{}} />)

    expect(await screen.findByText('Website statistics are not connected')).toBeTruthy()

    const contact = screen.getByRole('region', { name: 'Contact and bookings' })

    expect(within(contact).getByText('Not available yet')).toBeTruthy()
    expect(within(contact).getByText(/This is not zero/)).toBeTruthy()
    expect(within(contact).getByText('4')).toBeTruthy()
    expect(within(contact).getByText('+100% vs the 30 days before')).toBeTruthy()
    expect(await screen.findByText('Nothing to rank in this period.')).toBeTruthy()
    expect(screen.getByText(/Updated/)).toBeTruthy()
  })

  it('keeps one failing figure to its own card, with a way to try again', async () => {
    answer('/api/v2/owner/analytics/sections/sales', { body: SALES })
    renderWithClient(<AnalyticsPage search={{ tab: 'sales' }} />)

    const lost = await screen.findByRole('region', { name: 'Why leads were lost' })

    expect(within(lost).getByText('COULD NOT LOAD')).toBeTruthy()
    expect(within(lost).getByRole('button', { name: 'Try again' })).toBeTruthy()

    const rate = screen.getByRole('region', { name: 'Won rate' })

    expect(within(rate).getByText('60%')).toBeTruthy()
    expect(within(rate).getByText('3 won of 5 decided')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Where new leads came from' }).textContent).toContain('Google Maps')
  })

  it('offers each chart as a table and explains what it counts', async () => {
    answer('/api/v2/owner/analytics/sections/sales', { body: SALES })
    renderWithClient(<AnalyticsPage search={{ tab: 'sales' }} />)

    const card = await screen.findByRole('region', { name: 'New leads' })

    fireEvent.click(within(card).getByRole('button', { name: /Table view of New leads/ }))
    expect(within(card).getByRole('table')).toBeTruthy()
    expect(within(card).getAllByRole('row')).toHaveLength(6)
    expect(within(card).getByRole('button', { name: /Chart view of New leads/ }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(within(card).getByRole('button', { name: 'What New leads counts' }))
    expect(within(card).getByText('What leads.new counts.')).toBeTruthy()
    expect(within(card).getByText(/Source/).parentElement?.textContent).toContain('Leads')
  })

  it('lists every item of a cut-short breakdown a page at a time', async () => {
    const truncated = section('sales', [
      {
        ...SALES.groups[0]!,
        breakdowns: [
          breakdown('leads.sources', {
            label: 'Where new leads came from',
            total: 30,
            truncated: true,
            ranking: 'lead-sources',
            items: [{ key: 'a', label: 'Google Maps', value: 8 }],
          }),
        ],
      },
    ])
    const page = (number: number) => ({
      key: 'lead-sources',
      label: 'Where new leads came from',
      description: 'd',
      unit: 'count',
      scope: 'period',
      state: 'ready',
      source: 'backend2.leads',
      timezone: 'Europe/Berlin',
      asOf: AS_OF,
      period: PERIOD,
      filters: { origin: 'imported' },
      items: [{ rank: number * 10 - 9, key: `s${number}`, label: `Source ${number}`, value: 12 - number }],
      page: number,
      pageSize: 10,
      total: 12,
      pageCount: 2,
      hasMore: number < 2,
    })

    answer('/api/v2/owner/analytics/sections/sales?period=30d&origin=imported', { body: truncated })
    answer('/api/v2/owner/analytics/rankings/lead-sources?period=30d&pageSize=10&origin=imported', { body: page(1) })
    answer('/api/v2/owner/analytics/rankings/lead-sources?period=30d&page=2&pageSize=10&origin=imported', { body: page(2) })
    renderWithClient(<AnalyticsPage search={{ tab: 'sales', origin: 'imported' }} />)

    const card = await screen.findByRole('region', { name: 'Where new leads came from' })

    fireEvent.click(within(card).getByRole('button', { name: 'See every item' }))
    expect(await within(card).findByText('1. Source 1')).toBeTruthy()
    expect(within(card).getByText(/Page/).textContent).toContain('Page 1 of 2')

    fireEvent.click(within(card).getByRole('button', { name: /Next/ }))
    expect(await within(card).findByText('11. Source 2')).toBeTruthy()

    fireEvent.click(within(card).getByRole('button', { name: 'Show the top items only' }))
    expect(within(card).getByText('Google Maps')).toBeTruthy()
  })

  it('puts the period, the tab and the origin filter in the address', async () => {
    answer('/api/v2/owner/analytics/sections/sales', { body: SALES })
    renderWithClient(<AnalyticsPage search={{ tab: 'sales' }} />)
    await screen.findByRole('region', { name: 'New leads' })

    fireEvent.click(screen.getByRole('button', { name: 'Last 90 days' }))
    expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({ search: { tab: 'sales', period: '90d', origin: undefined } }))

    fireEvent.click(screen.getByRole('button', { name: 'Imported' }))
    expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({ search: { tab: 'sales', period: undefined, origin: 'imported' } }))

    fireEvent.keyDown(screen.getByRole('tab', { name: /Sales/ }), { key: 'ArrowRight' })
    expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({ search: { tab: 'operations', period: undefined, origin: undefined } }))
  })

  it('asks the server for the chosen period and filter', async () => {
    answer('/api/v2/owner/analytics/sections/sales?period=7d&origin=manual', { body: SALES })
    renderWithClient(<AnalyticsPage search={{ tab: 'sales', period: '7d', origin: 'manual' }} />)

    expect(await screen.findByRole('region', { name: 'New leads' })).toBeTruthy()
    expect(screen.getByText(/Imported means the Lead came from a CSV import/)).toBeTruthy()
  })

  it('says so when the whole section fails, and when the session has ended', { timeout: 20_000 }, async () => {
    answer('/api/v2/owner/analytics/sections/money', { status: 500, body: { success: false, message: 'boom' } })
    renderWithClient(<AnalyticsPage search={{ tab: 'money' }} />)
    expect(await screen.findByText('These figures could not be loaded', {}, { timeout: 8000 })).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
    cleanup()

    answer('/api/v2/owner/analytics/sections/money', { status: 401, body: { success: false, message: 'Sign in to continue', code: 'UNAUTHORIZED' } })
    renderWithClient(<AnalyticsPage search={{ tab: 'money' }} />)
    expect(await screen.findByText('Your session has ended')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy()
    cleanup()

    answer('/api/v2/owner/analytics/sections/money', { status: 404, body: { success: false, message: 'Not found' } })
    renderWithClient(<AnalyticsPage search={{ tab: 'money' }} />)
    expect(await screen.findByText('Analytics is not available here')).toBeTruthy()
  })

  it('shows Money as not available when Invoices cannot answer', async () => {
    const notBuilt = { state: 'not-built' as const, value: null, message: 'Invoices are not built yet, so there is no money figure. This is not zero.' }

    answer('/api/v2/owner/analytics/sections/money', {
      body: section('money', [
        {
          key: 'money',
          label: 'Money',
          source: 'backend2.invoices',
          notes: [],
          metrics: [metric('money.received', { unit: 'money', ...notBuilt }), metric('invoices.overdue', notBuilt)],
          breakdowns: [breakdown('invoices.status', { ...notBuilt, total: null })],
        },
      ]),
    })
    renderWithClient(<AnalyticsPage search={{ tab: 'money' }} />)

    expect(await screen.findByText('No money figures yet')).toBeTruthy()
    expect(screen.getByText(/This is not zero/)).toBeTruthy()
  })
})

/* ================================================================= overview */

const MONTHS = ['2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']
const block = { timezone: 'Europe/Berlin' as const, asOf: AS_OF, description: 'What it counts.', source: 'backend2.invoices' }
const zeros = () => MONTHS.map(() => 0)

const board = (over: Partial<AnalyticsOverviewResponse['board']> = {}): AnalyticsOverviewResponse['board'] => ({
  receivedByMonth: { ...block, key: 'money.receivedByMonth', label: 'Money in', state: 'ready', months: MONTHS, currencies: [] },
  outstanding: metric('invoices.outstanding', { scope: 'current', value: 0, amounts: [] }),
  paidOnTime: metric('invoices.paidOnTime', { unit: 'ratio', scope: 'last-90-days', state: 'empty', value: null, message: 'No rate yet.', rate: { numerator: 0, denominator: 0, numeratorLabel: '', denominatorLabel: '' } }),
  visitsHeatmap: {
    ...block,
    key: 'website.visitsHeatmap',
    label: 'When people visit',
    source: 'cloudflare',
    state: 'not-connected',
    message: 'Website statistics are not connected yet.',
    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    slots: ['00–06', '06–09', '09–12', '12–15', '15–18', '18–21', '21–24'],
    cells: [],
    total: null,
  },
  funnel: [
    metric('website.visitors', { state: 'not-connected', value: null, message: 'Website statistics are not connected yet.' }),
    metric('inbox.new', { value: 0 }),
    metric('booking.made', { value: 0 }),
    metric('clients.new', { value: 0 }),
    metric('invoices.paidInFull', { value: 0 }),
  ],
  ...over,
})

const EMPTY_OVERVIEW: AnalyticsOverviewResponse = {
  period: PERIOD,
  asOf: AS_OF,
  timezone: 'Europe/Berlin',
  headline: [
    metric('money.received', { unit: 'money', value: null, amounts: [] }),
    metric('invoices.overdue', { value: 0, amounts: [] }),
    metric('website.visitors', { state: 'not-connected', value: null, message: 'Website statistics are not connected yet.' }),
    metric('inbox.unread', { value: 0 }),
  ],
  glimpse: [metric('leads.followUpsDue', { value: 0 }), metric('booking.upcoming', { value: 0 })],
  board: board(),
}

const eur = { currency: 'EUR', oneOff: zeros(), subscription: zeros(), total: zeros() }

eur.oneOff[11] = 60000
eur.subscription[11] = 29500
eur.total[11] = 89500
eur.total[10] = 200000
eur.oneOff[10] = 200000

const OVERVIEW: AnalyticsOverviewResponse = {
  ...EMPTY_OVERVIEW,
  headline: [
    metric('money.received', { unit: 'money', value: null, amounts: [{ currency: 'EUR', minor: 89500 }] }),
    metric('invoices.overdue', { value: 1, amounts: [{ currency: 'EUR', minor: 30000 }] }),
    metric('website.visitors', {
      source: 'cloudflare',
      value: 1284,
      previous: { value: 1146, from: '', to: '' },
      series: series([30, 42, 51, 38, 45]),
    }),
    metric('inbox.unread', { state: 'error', value: null, message: 'This figure could not be loaded just now.' }),
  ],
  glimpse: [metric('leads.followUpsDue', { value: 2 }), metric('booking.upcoming', { value: 0 })],
  board: board({
    receivedByMonth: {
      ...board().receivedByMonth,
      currencies: [eur, { currency: 'USD', oneOff: zeros().map((_, i) => (i === 11 ? 100000 : 0)), subscription: zeros(), total: zeros().map((_, i) => (i === 11 ? 100000 : 0)) }],
    },
    outstanding: metric('invoices.outstanding', { scope: 'current', value: 3, amounts: [{ currency: 'EUR', minor: 69000 }] }),
    paidOnTime: metric('invoices.paidOnTime', {
      unit: 'ratio',
      scope: 'last-90-days',
      value: 9 / 11,
      rate: { numerator: 9, denominator: 11, numeratorLabel: '', denominatorLabel: '' },
    }),
    funnel: [
      metric('website.visitors', { source: 'cloudflare', value: 1284 }),
      metric('inbox.new', { value: 38 }),
      metric('booking.made', { value: 12 }),
      metric('clients.new', { state: 'error', value: null, message: 'This figure could not be loaded just now.' }),
      metric('invoices.paidInFull', { value: 4 }),
    ],
  }),
}

describe('the Overview', () => {
  it('shows this month’s money, visits and what is owed, each currency apart', async () => {
    answer('/api/v2/owner/analytics/overview?period=30d', { body: OVERVIEW })
    renderWithClient(<OverviewPage name="Yaman Warda" />)

    const received = await screen.findByRole('region', { name: 'Received' })

    await waitFor(() => expect(received.textContent).toContain('€895'))
    expect(received.textContent).toContain('Received · September')
    expect(received.textContent).toContain('−55%')
    expect(received.textContent).toContain('vs all of August')
    expect(received.textContent).toContain('US$1,000')
    expect(received.textContent).toContain('One-off €600')
    expect(received.textContent).toContain('Subscriptions €295')

    const visits = screen.getByRole('region', { name: 'Visits' })

    expect(visits.textContent).toContain('1,284')
    expect(visits.textContent).toContain('+12% vs the 30 days before')

    const outstanding = screen.getByRole('region', { name: 'Outstanding' })

    expect(outstanding.textContent).toContain('€690')
    expect(outstanding.textContent).toContain('3 open invoices · 1 overdue')

    const onTime = screen.getByRole('region', { name: 'Paid on time' })

    expect(within(onTime).getByRole('img').getAttribute('aria-label')).toContain('82%')
    expect(onTime.textContent).toContain('9 on time')
    expect(onTime.textContent).toContain('2 late')
  })

  it('draws money in by month, with a table behind the chart and a period switch', async () => {
    answer('/api/v2/owner/analytics/overview?period=30d', { body: OVERVIEW })
    renderWithClient(<OverviewPage name="Yaman Warda" />)

    const card = await screen.findByRole('region', { name: 'Money in' })

    await waitFor(() => expect(card.textContent).toContain('Paid invoices per month, 2026'))
    expect(within(card).getByRole('table').textContent).toContain('September 2026€895')
    expect(within(card).getAllByRole('row')).toHaveLength(1 + 9)

    fireEvent.click(within(card).getByRole('button', { name: '6 months' }))
    expect(within(card).getAllByRole('row')).toHaveLength(1 + 6)
    expect(within(card).getByRole('button', { name: '6 months' }).getAttribute('aria-pressed')).toBe('true')

    // Dollars are a separate line, never added to euros.
    fireEvent.click(within(card).getByRole('button', { name: 'USD' }))
    expect(within(card).getByRole('table').textContent).toContain('September 2026US$1,000')
  })

  it('follows visitors to paid on one scale, and says which steps are missing', async () => {
    answer('/api/v2/owner/analytics/overview?period=30d', { body: OVERVIEW })
    renderWithClient(<OverviewPage name="Yaman Warda" />)

    const funnel = await screen.findByRole('region', { name: 'From visitor to paid' })

    await waitFor(() => expect(funnel.textContent).toContain('3.0% write to you'))
    expect(funnel.textContent).toContain('32%') // 12 bookings of 38 messages
    expect(within(funnel).getByText('Could not load')).toBeTruthy()

    const needs = screen.getByRole('region', { name: 'Needs you' })

    expect(needs.textContent).toContain('1 invoice overdue')
    expect(needs.textContent).toContain('€300 still to pay')
    expect(needs.textContent).toContain('2 follow-ups are due')
    expect(needs.textContent).toContain('Inbox: could not load')
    expect(needs.textContent).not.toContain('appointment')

    const grid = screen.getByRole('region', { name: 'When people visit' })

    expect(within(grid).getByText('Not connected')).toBeTruthy()
  })

  it('shows friendly empty states on a day without data, and no invented number', async () => {
    answer('/api/v2/owner/analytics/overview?period=30d', { body: EMPTY_OVERVIEW })
    renderWithClient(<OverviewPage name="Yaman Warda" />)

    const received = await screen.findByRole('region', { name: 'Received' })

    await waitFor(() => expect(received.textContent).toContain('No payments yet this month'))
    expect(screen.getByRole('region', { name: 'Money in' }).textContent).toContain('Your first paid invoice draws this line')
    expect(screen.getByRole('region', { name: 'Paid on time' }).textContent).toContain('Appears after the first invoice is paid in full')
    expect(screen.getByRole('region', { name: 'Outstanding' }).textContent).toContain('No open invoices.')
    expect(screen.getByRole('region', { name: 'Needs you' }).textContent).toContain('Nothing needs you')

    const visits = screen.getByRole('region', { name: 'Visits' })

    expect(within(visits).getByText('Not connected')).toBeTruthy()
    expect(visits.textContent).not.toMatch(/\b0\b/)
    expect(screen.getByRole('link', { name: /Open analytics/ }).getAttribute('href')).toBe('/dashboard/analytics')
  })

  it('shows one alert, not zeros, when the overview fails', { timeout: 20_000 }, async () => {
    answer('/api/v2/owner/analytics/overview?period=30d', { status: 500, body: { success: false } })
    renderWithClient(<OverviewPage name="Yaman Warda" />)

    expect(await screen.findByText('The overview could not be loaded.', {}, { timeout: 8000 })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Received' }).textContent).toContain('Could not load')
    expect(screen.getByRole('region', { name: 'Received' }).textContent).not.toMatch(/\b0\b/)
    expect(screen.getByRole('region', { name: 'Outstanding' }).textContent).toContain('Could not load')
  })
})
