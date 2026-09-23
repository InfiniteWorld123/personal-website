import {
  type AnalyticsGroup,
  type AnalyticsMetric,
  type AnalyticsOverviewResponse,
  type AnalyticsPeriod,
  type AnalyticsSection,
  type AnalyticsSectionResponse,
  ANALYTICS_TIME_ZONE,
  LEAD_ORIGIN_NOTE,
  type LeadOrigin,
  SECTION_LABELS,
} from '../../contracts/analytics.contract'
import {
  ASSISTANT,
  BLOG,
  BLOG_NOTES,
  BOOKING,
  BOOKING_NOTES,
  CLIENTS,
  CLIENTS_NOTES,
  INBOX,
  INBOX_NOTES,
  LEADS,
  LEADS_NOTES,
  MEDIA,
  MONEY,
  NOT_BUILT,
  SOURCES,
  WEBSITE,
} from './analytics.definitions'
import {
  type BreakdownDef,
  type BuildContext,
  type MetricDef,
  type Part,
  UNAVAILABLE_MESSAGES,
  fillSeries,
  group,
  part,
  rateMetric,
  readyBreakdown,
  readyMetric,
  runParts,
  unavailableBreakdown,
  unavailableMetric,
} from './analytics.metric'
import { readsFromV2 } from '../../public-source'
import * as repo from './analytics.repo'
import { type AnalyticsSources, currentSources } from './analytics.sources'
import type { AssistantAnalyticsSource } from './sources/assistant'
import type { MoneyAnalyticsSource } from './sources/money'

/**
 * Analytics and the Overview: figures assembled from each module's own data
 * (`docs/v2/analytics.md`).
 *
 * Every figure is built by a `Part` that reads one source. A part that fails
 * marks only its own figures `error`; everything else in the same response
 * is unaffected. A source that does not exist yet answers `not-built`, a
 * provider that is not configured `not-connected` — never a zero.
 */

const SECTION_BREAKDOWN_ITEMS = 8

type Context = BuildContext & { sources: AnalyticsSources; now: Date; window: repo.Window }

const contextFor = (period: AnalyticsPeriod, sources: AnalyticsSources, now: Date): Context => ({
  asOf: now.toISOString(),
  period,
  sources,
  now,
  window: repo.windowOf(period),
})

/** Figures whose source cannot answer at all: nothing is read. */
const unavailablePart = (
  ctx: Context,
  input: {
    metrics: MetricDef[]
    breakdowns?: BreakdownDef[]
    state: 'not-built' | 'not-connected'
    message: string
    source?: string
  },
): Part =>
  part({
    metrics: input.metrics,
    breakdowns: input.breakdowns,
    load: async () => null,
    build: () => ({
      metrics: input.metrics.map((def) =>
        unavailableMetric(input.source ? { ...def, source: input.source } : def, ctx, input.state, input.message),
      ),
      breakdowns: (input.breakdowns ?? []).map((def) =>
        unavailableBreakdown(input.source ? { ...def, source: input.source } : def, ctx, input.state, input.message),
      ),
    }),
  })

/* ------------------------------------------------------------------ website */

const websiteSummaryPart = (ctx: Context, metrics: Array<'visitors' | 'pageviews'>): Part => {
  const defs = metrics.map((name) => WEBSITE[name])
  const source = ctx.sources.website

  if (!source.connected) {
    return unavailablePart(ctx, {
      metrics: defs,
      state: 'not-connected',
      message: UNAVAILABLE_MESSAGES.notConnected,
    })
  }

  return part({
    metrics: defs,
    load: () => source.readSummary(ctx.period),
    build: (snapshot) => ({
      metrics: metrics.map((name) => {
        const isVisitors = name === 'visitors'
        const note = [`Explore further in PostHog: ${snapshot.exploreUrl}`]

        return readyMetric(WEBSITE[name], ctx, isVisitors ? snapshot.visitors : snapshot.pageviews, {
          previous: isVisitors ? snapshot.previousVisitors : snapshot.previousPageviews,
          series: {
            bucket: ctx.period.bucket,
            points: isVisitors ? snapshot.visitorsSeries : snapshot.pageviewsSeries,
          },
          asOf: snapshot.fetchedAt,
          notes: note,
        })
      }),
    }),
  })
}

const websiteTopPagesPart = (ctx: Context): Part => {
  const source = ctx.sources.website

  if (!source.connected) {
    return unavailablePart(ctx, {
      metrics: [],
      breakdowns: [WEBSITE.topPages],
      state: 'not-connected',
      message: UNAVAILABLE_MESSAGES.notConnected,
    })
  }

  return part({
    metrics: [],
    breakdowns: [WEBSITE.topPages],
    load: async () => ({
      // The same query the summary runs, so it comes from the provider cache.
      summary: await source.readSummary(ctx.period),
      pages: await source.readTopPages(ctx.period, { page: 1, pageSize: SECTION_BREAKDOWN_ITEMS }),
    }),
    build: ({ summary, pages }) => {
      const breakdown = readyBreakdown(WEBSITE.topPages, ctx, {
        items: pages.items.map((page) => ({ key: page.path, label: page.path, value: page.pageviews })),
        total: summary.pageviews,
        truncated: pages.total > pages.items.length,
        emptyMessage: 'No public pageviews were recorded in this period.',
      })

      return {
        breakdowns: [
          { ...breakdown, asOf: pages.fetchedAt < summary.fetchedAt ? pages.fetchedAt : summary.fetchedAt },
        ],
      }
    },
  })
}

const buildWebsite = async (ctx: Context): Promise<AnalyticsGroup[]> => [
  await group(ctx, {
    key: 'traffic',
    label: 'Visitors',
    source: SOURCES.posthog,
    notes: [
      'Only public pages count. The Dashboard, admin pages and the API are never included.',
      'Public tracking is switched off until privacy and cost are separately approved.',
    ],
    parts: [websiteSummaryPart(ctx, ['visitors', 'pageviews']), websiteTopPagesPart(ctx)],
  }),
  await group(ctx, {
    key: 'actions',
    label: 'What visitors did',
    source: SOURCES.booking,
    notes: ['Counted from Backend2 records of finished actions, not from clicks.'],
    parts: [
      part({
        metrics: [WEBSITE.onlineBookings],
        load: () => repo.bookingCounts(ctx.window, ctx.now),
        build: (counts) => ({
          metrics: [
            readyMetric(WEBSITE.onlineBookings, ctx, counts.booked_online_now, {
              previous: counts.booked_online_prev,
            }),
          ],
        }),
      }),
      /*
       * Counted only once the public form really sends to Backend2
       * (`PUBLIC_V2_MODULES` lists `contact`); before that the live form
       * writes to the legacy system and a V2 count would be a false zero.
       */
      readsFromV2('contact')
        ? part({
            metrics: [WEBSITE.contactSubmissions],
            load: () => repo.inboxCounts(ctx.window),
            build: (counts) => ({
              metrics: [
                readyMetric(WEBSITE.contactSubmissions, ctx, counts.contact_now, { previous: counts.contact_prev }),
              ],
            }),
          })
        : unavailablePart(ctx, {
            metrics: [WEBSITE.contactSubmissions],
            state: 'not-connected',
            message: NOT_BUILT.contact,
          }),
    ],
  }),
  await group(ctx, {
    key: 'content',
    label: 'On the website now',
    source: 'backend2',
    parts: [
      part({
        metrics: [WEBSITE.projectsLive, WEBSITE.servicesLive],
        load: () => repo.catalogueCounts(),
        build: (counts) => ({
          metrics: [
            readyMetric(WEBSITE.projectsLive, ctx, counts.projects_live),
            readyMetric(WEBSITE.servicesLive, ctx, counts.services_live),
          ],
        }),
      }),
      part({
        metrics: [BLOG.live],
        load: () => repo.blogCounts(ctx.window),
        build: (counts) => ({ metrics: [readyMetric(BLOG.live, ctx, counts.live)] }),
      }),
    ],
  }),
]

/* -------------------------------------------------------------------- sales */

const topItems = (rows: Array<{ id: string; name: string; value: number }>) =>
  rows.map((row) => ({ key: row.id, label: row.name, value: row.value }))

const buildSales = async (ctx: Context, origin: LeadOrigin): Promise<AnalyticsGroup[]> => {
  const originNotes = origin === 'all' ? [] : [LEAD_ORIGIN_NOTE]
  const leadsGroup = await group(ctx, {
    key: 'leads',
    label: 'Leads',
    source: SOURCES.leads,
    notes: [...LEADS_NOTES, ...originNotes],
    parts: [
      part({
        metrics: [LEADS.new, LEADS.active, LEADS.won, LEADS.lost, LEADS.wonRate],
        load: async () => ({
          counts: await repo.leadCounts(ctx.window, origin),
          series: await repo.leadNewSeries(ctx.window, origin),
        }),
        build: ({ counts, series }) => ({
          metrics: [
            readyMetric(LEADS.new, ctx, counts.new_now, {
              previous: counts.new_prev,
              series: fillSeries(ctx.period, series),
            }),
            readyMetric(LEADS.active, ctx, counts.active),
            readyMetric(LEADS.won, ctx, counts.won_now, { previous: counts.won_prev }),
            readyMetric(LEADS.lost, ctx, counts.lost_now, { previous: counts.lost_prev }),
            rateMetric(LEADS.wonRate, ctx, {
              numerator: counts.won_now,
              denominator: counts.won_now + counts.lost_now,
              numeratorLabel: 'Won in the period',
              denominatorLabel: 'Won + Lost in the period',
              previous: {
                numerator: counts.won_prev,
                denominator: counts.won_prev + counts.lost_prev,
              },
              emptyMessage: 'No lead was Won or Lost in this period, so there is no rate.',
            }),
          ],
        }),
      }),
      part({
        metrics: [LEADS.followUpsDue, LEADS.followUpsNextWeek],
        load: () => repo.leadFollowUps(ctx.now, origin),
        build: (counts) => ({
          metrics: [
            readyMetric(LEADS.followUpsDue, ctx, counts.due),
            readyMetric(LEADS.followUpsNextWeek, ctx, counts.next_week),
          ],
        }),
      }),
      part({
        metrics: [],
        breakdowns: [LEADS.stages],
        load: () => repo.leadStages(origin),
        build: (stages) => ({
          breakdowns: [
            readyBreakdown(LEADS.stages, ctx, {
              items: stages.map((stage) => ({ key: stage.id, label: stage.name, value: stage.value })),
              total: stages.reduce((sum, stage) => sum + stage.value, 0),
              emptyMessage: 'There are no leads yet.',
            }),
          ],
        }),
      }),
      part({
        metrics: [],
        breakdowns: [LEADS.sources],
        load: () => repo.leadSources(ctx.window, origin, { limit: SECTION_BREAKDOWN_ITEMS, offset: 0 }),
        build: (ranked) => ({
          breakdowns: [
            readyBreakdown(LEADS.sources, ctx, {
              items: topItems(ranked.rows),
              total: ranked.sum,
              truncated: ranked.total > ranked.rows.length,
              emptyMessage: 'No new leads in this period.',
            }),
          ],
        }),
      }),
      part({
        metrics: [],
        breakdowns: [LEADS.lostReasons],
        load: () =>
          repo.leadLostReasons(ctx.window, origin, { limit: SECTION_BREAKDOWN_ITEMS, offset: 0 }),
        build: (ranked) => ({
          breakdowns: [
            readyBreakdown(LEADS.lostReasons, ctx, {
              items: topItems(ranked.rows),
              total: ranked.sum,
              truncated: ranked.total > ranked.rows.length,
              emptyMessage: 'No lead was Lost in this period.',
            }),
          ],
        }),
      }),
    ],
  })

  const clientsGroup = await group(ctx, {
    key: 'clients',
    label: 'Clients',
    source: SOURCES.clients,
    notes: CLIENTS_NOTES,
    parts: [
      part({
        metrics: [CLIENTS.new, CLIENTS.fromLeads, CLIENTS.direct, CLIENTS.active, CLIENTS.inactive],
        breakdowns: [CLIENTS.origin],
        load: async () => ({
          counts: await repo.clientCounts(ctx.window),
          series: await repo.clientNewSeries(ctx.window),
        }),
        build: ({ counts, series }) => {
          const direct = counts.new_now - counts.from_lead_now

          return {
            metrics: [
              readyMetric(CLIENTS.new, ctx, counts.new_now, {
                previous: counts.new_prev,
                series: fillSeries(ctx.period, series),
              }),
              readyMetric(CLIENTS.fromLeads, ctx, counts.from_lead_now),
              readyMetric(CLIENTS.direct, ctx, direct),
              readyMetric(CLIENTS.active, ctx, counts.active),
              readyMetric(CLIENTS.inactive, ctx, counts.inactive),
            ],
            breakdowns: [
              readyBreakdown(CLIENTS.origin, ctx, {
                items: [
                  { key: 'from-lead', label: 'From a Won lead', value: counts.from_lead_now },
                  { key: 'direct', label: 'Added directly', value: direct },
                ],
                total: counts.new_now,
                emptyMessage: 'No new clients in this period.',
              }),
            ],
          }
        },
      }),
    ],
  })

  return [leadsGroup, clientsGroup]
}

/* --------------------------------------------------------------- operations */

const METHOD_LABELS: Array<[string, string]> = [
  ['video', 'Video call'],
  ['in_person', 'In person'],
  ['phone', 'Phone'],
]

const buildOperations = async (ctx: Context): Promise<AnalyticsGroup[]> => [
  await group(ctx, {
    key: 'booking',
    label: 'Calendar',
    source: SOURCES.booking,
    notes: BOOKING_NOTES,
    parts: [
      part({
        metrics: [
          BOOKING.made,
          BOOKING.completed,
          BOOKING.cancelled,
          BOOKING.noShow,
          BOOKING.noShowRate,
          BOOKING.upcoming,
        ],
        breakdowns: [BOOKING.status],
        load: async () => ({
          counts: await repo.bookingCounts(ctx.window, ctx.now),
          series: await repo.bookingMadeSeries(ctx.window),
        }),
        build: ({ counts, series }) => ({
          metrics: [
            readyMetric(BOOKING.made, ctx, counts.booked_now, {
              previous: counts.booked_prev,
              series: fillSeries(ctx.period, series),
            }),
            readyMetric(BOOKING.completed, ctx, counts.completed_now, { previous: counts.completed_prev }),
            readyMetric(BOOKING.cancelled, ctx, counts.cancelled_now, { previous: counts.cancelled_prev }),
            readyMetric(BOOKING.noShow, ctx, counts.no_show_now, { previous: counts.no_show_prev }),
            rateMetric(BOOKING.noShowRate, ctx, {
              numerator: counts.no_show_now,
              denominator: counts.completed_now + counts.no_show_now,
              numeratorLabel: 'No-shows in the period',
              denominatorLabel: 'Completed + No-show in the period',
              previous: {
                numerator: counts.no_show_prev,
                denominator: counts.completed_prev + counts.no_show_prev,
              },
              emptyMessage: 'No appointment in this period was marked Completed or No-show.',
            }),
            readyMetric(BOOKING.upcoming, ctx, counts.upcoming),
          ],
          breakdowns: [
            readyBreakdown(BOOKING.status, ctx, {
              items: [
                { key: 'confirmed', label: 'Confirmed', value: counts.confirmed_now },
                { key: 'completed', label: 'Completed', value: counts.completed_now },
                { key: 'cancelled', label: 'Cancelled', value: counts.cancelled_now },
                { key: 'no_show', label: 'No-show', value: counts.no_show_now },
              ],
              total:
                counts.confirmed_now + counts.completed_now + counts.cancelled_now + counts.no_show_now,
              emptyMessage: 'No appointments in this period.',
            }),
          ],
        }),
      }),
      part({
        metrics: [],
        breakdowns: [BOOKING.methods],
        load: () => repo.bookingMethods(ctx.window),
        build: (methods) => {
          const items = METHOD_LABELS.map(([key, label]) => ({ key, label, value: methods.get(key) ?? 0 }))

          return {
            breakdowns: [
              readyBreakdown(BOOKING.methods, ctx, {
                items,
                total: items.reduce((sum, item) => sum + item.value, 0),
                emptyMessage: 'No appointments in this period.',
              }),
            ],
          }
        },
      }),
    ],
  }),
  await group(ctx, {
    key: 'inbox',
    label: 'Inbox',
    source: SOURCES.inbox,
    notes: INBOX_NOTES,
    parts: [
      part({
        metrics: [INBOX.unread, INBOX.new],
        breakdowns: [INBOX.origins],
        load: async () => ({
          counts: await repo.inboxCounts(ctx.window),
          series: await repo.inboxNewSeries(ctx.window),
        }),
        build: ({ counts, series }) => {
          const items = [
            { key: 'incoming', label: 'Email', value: counts.incoming_now },
            { key: 'contact', label: 'Contact form', value: counts.contact_now },
            { key: 'booking', label: 'Booking', value: counts.booking_now },
            { key: 'outgoing', label: 'Started by you', value: counts.outgoing_now },
          ]

          return {
            metrics: [
              readyMetric(INBOX.unread, ctx, counts.unread),
              readyMetric(INBOX.new, ctx, counts.new_now, {
                previous: counts.new_prev,
                series: fillSeries(ctx.period, series),
              }),
            ],
            breakdowns: [
              readyBreakdown(INBOX.origins, ctx, {
                items,
                total: items.reduce((sum, item) => sum + item.value, 0),
                emptyMessage: 'No conversations started in this period.',
              }),
            ],
          }
        },
      }),
    ],
  }),
  await group(ctx, {
    key: 'media',
    label: 'Media',
    source: SOURCES.media,
    notes: ['File names are never shown here.'],
    parts: [
      part({
        metrics: [MEDIA.files, MEDIA.bytes, MEDIA.added, MEDIA.public],
        breakdowns: [MEDIA.kinds, MEDIA.kindBytes],
        load: () => repo.mediaCounts(ctx.window),
        build: (counts) => ({
          metrics: [
            readyMetric(MEDIA.files, ctx, counts.files),
            readyMetric(MEDIA.bytes, ctx, counts.bytes),
            readyMetric(MEDIA.added, ctx, counts.added_now, { previous: counts.added_prev }),
            readyMetric(MEDIA.public, ctx, counts.public_files),
          ],
          breakdowns: [
            readyBreakdown(MEDIA.kinds, ctx, {
              items: [
                { key: 'image', label: 'Images', value: counts.images },
                { key: 'video', label: 'Videos', value: counts.videos },
                { key: 'document', label: 'Documents', value: counts.documents },
              ],
              total: counts.files,
              emptyMessage: 'The Media library is empty.',
            }),
            readyBreakdown(MEDIA.kindBytes, ctx, {
              items: [
                { key: 'image', label: 'Images', value: counts.image_bytes },
                { key: 'video', label: 'Videos', value: counts.video_bytes },
                { key: 'document', label: 'Documents', value: counts.document_bytes },
              ],
              total: counts.bytes,
              emptyMessage: 'The Media library is empty.',
            }),
          ],
        }),
      }),
    ],
  }),
  await group(ctx, {
    key: 'blog',
    label: 'Blog',
    source: SOURCES.blog,
    notes: BLOG_NOTES,
    parts: [
      part({
        metrics: [
          BLOG.live,
          BLOG.firstPublished,
          BLOG.comments,
          BLOG.unseenComments,
          BLOG.reads,
          BLOG.likes,
        ],
        load: async () => ({
          counts: await repo.blogCounts(ctx.window),
          series: await repo.blogCommentSeries(ctx.window),
        }),
        build: ({ counts, series }) => ({
          metrics: [
            readyMetric(BLOG.live, ctx, counts.live),
            readyMetric(BLOG.firstPublished, ctx, counts.first_now, { previous: counts.first_prev }),
            readyMetric(BLOG.comments, ctx, counts.comments_now, {
              previous: counts.comments_prev,
              series: fillSeries(ctx.period, series),
            }),
            readyMetric(BLOG.unseenComments, ctx, counts.unseen),
            readyMetric(BLOG.reads, ctx, counts.reads),
            readyMetric(BLOG.likes, ctx, counts.likes),
          ],
        }),
      }),
    ],
  }),
]

/* -------------------------------------------------------------------- money */

const moneyMetric = (
  def: MetricDef,
  ctx: Context,
  amounts: Array<{ currency: string; minor: number }>,
  previous?: Array<{ currency: string; minor: number }>,
): AnalyticsMetric => {
  const metric: AnalyticsMetric = { ...readyMetric(def, ctx, 0), value: null, amounts: sortAmounts(amounts) }

  if (previous) {
    metric.previous = {
      value: null,
      amounts: sortAmounts(previous),
      from: ctx.period.previous.from,
      to: ctx.period.previous.to,
    }
  }

  return metric
}

/** Deterministic, and one entry per currency: never added across currencies. */
const sortAmounts = (amounts: Array<{ currency: string; minor: number }>) =>
  [...amounts]
    .map((amount) => ({ currency: amount.currency.toUpperCase(), minor: amount.minor }))
    .sort((a, b) => a.currency.localeCompare(b.currency))

type MoneyFigure = 'received' | 'refunds' | 'overdue' | 'outstanding'

const moneyPart = (
  ctx: Context,
  source: MoneyAnalyticsSource | null,
  figures: MoneyFigure[],
  withStatus: boolean,
): Part => {
  const defs = figures.map((name) => MONEY[name])
  const breakdowns = withStatus ? [MONEY.status] : []

  if (!source) {
    return unavailablePart(ctx, {
      metrics: defs,
      breakdowns,
      state: 'not-built',
      message: NOT_BUILT.money,
    })
  }

  const own = (def: MetricDef): MetricDef => ({ ...def, source: source.source })

  return part({
    metrics: defs.map(own),
    breakdowns: breakdowns.map((def) => ({ ...def, source: source.source })),
    load: () => source.read(ctx.period, ctx.now),
    build: (snapshot) => ({
      metrics: figures.map((name) => {
        const figure = own(MONEY[name])

        if (name === 'received') return moneyMetric(figure, ctx, snapshot.receivedNet, snapshot.previousReceivedNet)
        if (name === 'refunds') return moneyMetric(figure, ctx, snapshot.refunds)

        const balance = name === 'overdue' ? snapshot.overdue : snapshot.outstanding

        return { ...readyMetric(figure, ctx, balance.count), amounts: sortAmounts(balance.balance) }
      }),
      breakdowns: withStatus
        ? [
            readyBreakdown({ ...MONEY.status, source: source.source }, ctx, {
              items: snapshot.statusMix.map((row) => ({ key: row.status, label: row.label, value: row.count })),
              total: snapshot.statusMix.reduce((sum, row) => sum + row.count, 0),
              emptyMessage: 'There are no issued invoices yet.',
            }),
          ]
        : [],
    }),
  })
}

const buildMoney = async (ctx: Context): Promise<AnalyticsGroup[]> => [
  await group(ctx, {
    key: 'money',
    label: 'Money',
    source: ctx.sources.money?.source ?? SOURCES.invoices,
    notes: [
      'EUR and USD are shown separately and never added together.',
      'This is not tax or profit accounting.',
    ],
    parts: [moneyPart(ctx, ctx.sources.money, ['received', 'refunds', 'overdue', 'outstanding'], true)],
  }),
]

/* ---------------------------------------------------------------- assistant */

const assistantPart = (ctx: Context, source: AssistantAnalyticsSource | null): Part => {
  const defs = [ASSISTANT.conversations, ASSISTANT.unanswered, ASSISTANT.referrals, ASSISTANT.cost]

  if (!source) {
    return unavailablePart(ctx, { metrics: defs, state: 'not-built', message: NOT_BUILT.assistant })
  }

  const own = (def: MetricDef): MetricDef => ({ ...def, source: source.source })
  const optional = (def: MetricDef, value: number | null) =>
    value === null
      ? unavailableMetric(own(def), ctx, 'not-built', NOT_BUILT.assistantOutcome)
      : readyMetric(own(def), ctx, value)

  return part({
    metrics: defs.map(own),
    load: () => source.read(ctx.period, ctx.now),
    build: (snapshot) => ({
      metrics: [
        readyMetric(own(ASSISTANT.conversations), ctx, snapshot.conversations, {
          previous: snapshot.previousConversations,
        }),
        optional(ASSISTANT.unanswered, snapshot.unanswered),
        optional(ASSISTANT.referrals, snapshot.referralClicks),
        snapshot.cost === null
          ? unavailableMetric(own(ASSISTANT.cost), ctx, 'not-built', NOT_BUILT.assistantOutcome)
          : moneyMetric(own(ASSISTANT.cost), ctx, snapshot.cost),
      ],
    }),
  })
}

const buildAssistant = async (ctx: Context): Promise<AnalyticsGroup[]> => [
  await group(ctx, {
    key: 'assistant',
    label: 'Public AI assistant',
    source: ctx.sources.assistant?.source ?? SOURCES.assistant,
    notes: ['Statistics only. No conversation text is shown here or sent to any analytics provider.'],
    parts: [assistantPart(ctx, ctx.sources.assistant)],
  }),
]

/* ----------------------------------------------------------------- entries */

export const getSection = async (input: {
  section: AnalyticsSection
  period: AnalyticsPeriod
  now: Date
  filters: { origin?: LeadOrigin }
}): Promise<AnalyticsSectionResponse> => {
  const ctx = contextFor(input.period, currentSources(), input.now)
  const origin = input.filters.origin ?? 'all'

  const groups =
    input.section === 'website'
      ? await buildWebsite(ctx)
      : input.section === 'sales'
        ? await buildSales(ctx, origin)
        : input.section === 'operations'
          ? await buildOperations(ctx)
          : input.section === 'money'
            ? await buildMoney(ctx)
            : await buildAssistant(ctx)

  return {
    section: input.section,
    label: SECTION_LABELS[input.section],
    period: input.period,
    filters: input.section === 'sales' ? { origin } : {},
    asOf: ctx.asOf,
    timezone: ANALYTICS_TIME_ZONE,
    groups,
  }
}

/**
 * The short Overview: the four headline ideas and a compact glimpse of what
 * needs the owner now. Each figure is its own part, so an Inbox failure
 * leaves the follow-ups count standing, and the other way round.
 */
export const getOverview = async (input: {
  period: AnalyticsPeriod
  now: Date
}): Promise<AnalyticsOverviewResponse> => {
  const ctx = contextFor(input.period, currentSources(), input.now)

  const headline = await runParts(ctx, [
    moneyPart(ctx, ctx.sources.money, ['received', 'overdue'], false),
    websiteSummaryPart(ctx, ['visitors']),
    part({
      metrics: [INBOX.unread],
      load: () => repo.inboxUnread(),
      build: (unread) => ({ metrics: [readyMetric(INBOX.unread, ctx, unread)] }),
    }),
  ])

  const glimpse = await runParts(ctx, [
    part({
      metrics: [LEADS.followUpsDue],
      load: () => repo.leadFollowUps(ctx.now, 'all'),
      build: (counts) => ({ metrics: [readyMetric(LEADS.followUpsDue, ctx, counts.due)] }),
    }),
    part({
      metrics: [BOOKING.upcoming],
      load: () => repo.bookingUpcoming(ctx.now),
      build: (upcoming) => ({ metrics: [readyMetric(BOOKING.upcoming, ctx, upcoming)] }),
    }),
  ])

  return {
    period: input.period,
    asOf: ctx.asOf,
    timezone: ANALYTICS_TIME_ZONE,
    headline: headline.metrics,
    glimpse: glimpse.metrics,
  }
}
