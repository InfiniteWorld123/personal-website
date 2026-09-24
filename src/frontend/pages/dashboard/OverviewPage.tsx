import { type ReactNode, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CalendarDays, ChartLine, Clock, Euro, Handshake, Inbox } from 'lucide-react'
import type {
  AnalyticsMetric,
  AnalyticsOverviewResponse,
  MetricState,
  MonthlyMoneyBlock,
  MonthlyMoneyCurrency,
  VisitHeatmapBlock,
} from '#/backend2/contracts/analytics.contract'
import { DashboardPage, PageHead } from '#/frontend/dashboard/primitives'
import {
  STATE_VALUE,
  berlinLongDate,
  formatCount,
  formatDelta,
  formatMoney,
  formatRatio,
  greeting,
} from '#/frontend/features/analytics-v2/format'
import { useOverview } from '#/frontend/features/analytics-v2/queries'
import { cn } from '#/frontend/lib/utils'
import { ModuleLink, StateChip } from './analytics/analytics-cards'
import {
  EmptyNote,
  FunnelBar,
  Gauge,
  Heatmap,
  HiddenTable,
  MoneyCurve,
  Sparkline,
} from './overview/overview-charts'

/**
 * What `/dashboard` opens on, as approved in the Overview Design Lab
 * (Direction A "Hatch", 24 Sep 2026): money received this month, visits and
 * what is still owed; money in per month with the paid-on-time gauge; when
 * people visit, the path from visitor to paid, and what needs the owner.
 *
 * Every number is real and read from Backend2 in one request
 * (`/api/v2/owner/analytics/overview`). A figure whose source is not
 * connected, not built or failing says so in words and is never shown as 0;
 * one failing source leaves the others standing.
 */

const OVERVIEW_PERIOD = '30d' as const
const ICON = 'size-4'

type Unready = Exclude<MetricState, 'ready'>
type Status = { state: MetricState; message?: string }

const DID_NOT_ARRIVE = 'This figure did not arrive. The others are unaffected.'

const statusOf = (failed: boolean, item: { state: MetricState; message?: string } | undefined): Status =>
  failed || !item ? { state: 'error', message: DID_NOT_ARRIVE } : { state: item.state, message: item.message }

const findMetric = (list: AnalyticsMetric[] | undefined, key: string) => list?.find((metric) => metric.key === key)

const readyValue = (metric: AnalyticsMetric | undefined): number | null =>
  metric?.state === 'ready' && metric.value !== null ? metric.value : null

const plural = (count: number, one: string, many: string) => `${formatCount(count)} ${count === 1 ? one : many}`

/** Whole euros when there are no cents, as the lab shows them. */
const money = (currency: string, minor: number) => formatMoney({ currency, minor }, { cents: minor % 100 !== 0 })

const MONTH_LONG = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' })
const MONTH_SHORT = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })
const MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const monthDate = (iso: string) => new Date(`${iso}T00:00:00Z`)

/** Euros first when there are any; never two currencies added together. */
const primaryCurrency = (block: MonthlyMoneyBlock | undefined): MonthlyMoneyCurrency | undefined =>
  block?.currencies.find((entry) => entry.currency === 'EUR') ?? block?.currencies[0]

/* ------------------------------------------------------------------- pieces */

function Card({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <section aria-label={label} className={cn('dash-panel flex h-full min-w-0 flex-col gap-2.5 px-4 py-4 sm:px-[18px]', className)}>
      {children}
    </section>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <h2 className="text-[10.5px] font-bold tracking-[0.14em] text-[var(--dash-quiet)] uppercase">{children}</h2>
}

function Title({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <h2 className="text-[13.5px] font-semibold">{title}</h2>
      {sub ? <p className="text-[11.5px] text-[var(--dash-quiet)]">{sub}</p> : null}
    </div>
  )
}

function Head({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5">
      {children}
      {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
    </div>
  )
}

function Quiet({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[11.5px] leading-snug text-[var(--dash-quiet)]', className)}>{children}</p>
}

function Delta({ children }: { children: ReactNode }) {
  return (
    <span className="dash-tone-grey inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap tabular-nums">
      {children}
    </span>
  )
}

/** A figure that is not a number: its state in words, never a zero. */
function UnreadyBody({ status, hint }: { status: Status & { state: Unready }; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 py-1">
      <p
        className={cn(
          'text-[15px] font-semibold',
          status.state === 'error' ? 'text-[var(--dash-red-ink)]' : 'text-[var(--dash-quiet)]',
        )}
      >
        {STATE_VALUE[status.state]}
      </p>
      {status.message ? <Quiet>{status.message}</Quiet> : null}
      {hint ? <Quiet>{hint}</Quiet> : null}
    </div>
  )
}

function Skeleton({ lines = 2, tall }: { lines?: number; tall?: boolean }) {
  return (
    <div className="flex flex-col gap-2 py-1" aria-hidden="true">
      <span className={cn('dash-skeleton w-28', tall ? 'h-9' : 'h-7')} />
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="dash-skeleton h-3 w-40" />
      ))}
    </div>
  )
}

/** Two or three options, one pressed. */
function Switch<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<[T, string]>
  onChange: (next: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-[9px] bg-[var(--dash-chip)] p-0.5">
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            'rounded-[7px] px-2.5 py-1 text-[12px] font-medium text-[var(--dash-quiet)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--dash-blue)]',
            value === key && 'bg-[var(--dash-surface)] text-[var(--dash-ink)] shadow-[0_1px_2px_rgba(16,23,47,0.08)]',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------- row 1 */

function ReceivedCard({ block, loading, failed }: { block?: MonthlyMoneyBlock; loading: boolean; failed: boolean }) {
  const [range, setRange] = useState<'month' | 'year'>('month')
  const status = statusOf(failed, block)
  const months = block?.months ?? []
  const lastIndex = months.length - 1
  const thisMonth = months[lastIndex]
  const primary = primaryCurrency(block)
  const others = (block?.currencies ?? []).filter((entry) => entry !== primary)
  const year = thisMonth?.slice(0, 4)
  const yearIndexes = months.map((month, index) => (month.slice(0, 4) === year ? index : -1)).filter((index) => index >= 0)
  const pick = (values: number[]) =>
    range === 'month' ? (values[lastIndex] ?? 0) : yearIndexes.reduce((sum, index) => sum + (values[index] ?? 0), 0)

  const heading = thisMonth ? (range === 'month' ? MONTH_LONG.format(monthDate(thisMonth)) : year) : ''
  const currency = primary?.currency ?? 'EUR'
  const total = primary ? pick(primary.total) : 0
  const oneOff = primary ? pick(primary.oneOff) : 0
  const recurring = primary ? pick(primary.subscription) : 0
  const previous = primary && lastIndex > 0 ? primary.total[lastIndex - 1]! : null
  const previousName = lastIndex > 0 ? MONTH_LONG.format(monthDate(months[lastIndex - 1]!)) : ''
  const delta = range === 'month' && previous !== null && previous > 0 ? formatDelta(total, previous) : null
  const showSplit = total > 0 && oneOff >= 0 && recurring >= 0

  return (
    <Card label="Received">
      <Head aside={status.state === 'ready' ? <Switch label="Received over" value={range} options={[['month', 'Month'], ['year', 'Year']]} onChange={setRange} /> : loading ? null : <StateChip state={status.state} />}>
        <Eyebrow>Received{heading ? ` · ${heading}` : ''}</Eyebrow>
      </Head>
      {loading ? (
        <Skeleton tall />
      ) : status.state !== 'ready' ? (
        <UnreadyBody status={status as Status & { state: Unready }} />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
            <p className="dash-figure text-[34px] sm:text-[40px]">{money(currency, total)}</p>
            {delta ? (
              <span className="flex items-center gap-1.5 pb-1">
                <Delta>{delta}</Delta>
                <span className="text-[11px] text-[var(--dash-quiet)]">vs all of {previousName}</span>
              </span>
            ) : null}
          </div>
          {others.map((entry) => (
            <Quiet key={entry.currency}>
              and <b className="font-semibold text-[var(--dash-ink)]">{money(entry.currency, pick(entry.total))}</b>, counted apart
            </Quiet>
          ))}
          {showSplit ? (
            <>
              <div className="flex h-[30px] gap-0.5 overflow-hidden rounded-[9px]" role="img" aria-label={`One-off invoices ${money(currency, oneOff)}, subscriptions ${money(currency, recurring)}`}>
                {oneOff > 0 ? (
                  <span
                    title={`One-off invoices: ${money(currency, oneOff)}`}
                    className="flex items-center overflow-hidden bg-[var(--dash-series-1)] px-2.5 text-[11px] font-semibold whitespace-nowrap text-white"
                    style={{ flex: oneOff }}
                  >
                    {oneOff / total >= 0.2 ? 'One-off' : ''}
                  </span>
                ) : null}
                {recurring > 0 ? (
                  <span
                    title={`Subscriptions: ${money(currency, recurring)}`}
                    className="flex items-center overflow-hidden bg-[var(--dash-series-1)]/60 px-2.5 text-[11px] font-semibold whitespace-nowrap text-white"
                    style={{ flex: recurring }}
                  >
                    {recurring / total >= 0.2 ? 'Subscriptions' : ''}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-[var(--dash-quiet)]">
                <span>
                  <i aria-hidden="true" className="me-1.5 inline-block size-2 rounded-[3px] bg-[var(--dash-series-1)]" />
                  One-off {money(currency, oneOff)}
                </span>
                <span>
                  <i aria-hidden="true" className="me-1.5 inline-block size-2 rounded-[3px] bg-[var(--dash-series-1)]/60" />
                  Subscriptions {money(currency, recurring)}
                </span>
              </div>
            </>
          ) : total === 0 ? (
            <EmptyNote icon={<Euro className={ICON} />}>
              {range === 'month' ? 'No payments yet this month.' : 'No payments yet this year.'} Your first paid invoice fills this bar.
            </EmptyNote>
          ) : (
            <Quiet>After refunds recorded in the same {range}.</Quiet>
          )}
        </>
      )}
    </Card>
  )
}

function VisitsCard({ metric, loading, failed }: { metric?: AnalyticsMetric; loading: boolean; failed: boolean }) {
  const status = statusOf(failed, metric)
  const value = readyValue(metric)
  const points = metric?.series?.points.map((point) => point.value) ?? []
  const delta = value !== null ? formatDelta(value, metric?.previous?.value) : null

  return (
    <Card label="Visits">
      <Head aside={status.state === 'ready' ? <span className="text-[11px] text-[var(--dash-quiet)]">Cloudflare</span> : loading ? null : <StateChip state={status.state} />}>
        <Eyebrow>Visits · 30 days</Eyebrow>
      </Head>
      {loading ? (
        <Skeleton />
      ) : value === null ? (
        <UnreadyBody
          status={status as Status & { state: Unready }}
          hint={status.state === 'not-connected' ? 'Counting starts the day Cloudflare Web Analytics is switched on for the public site.' : undefined}
        />
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <p className="dash-figure text-[30px]">{formatCount(value)}</p>
            {value > 0 ? <Sparkline values={points} /> : null}
          </div>
          <Quiet>
            {value === 0 ? 'No visits were counted in the last 30 days.' : delta ? `${delta} vs the 30 days before` : 'Visits on public pages'}
          </Quiet>
        </>
      )}
    </Card>
  )
}

function OutstandingCard({
  metric,
  overdue,
  loading,
  failed,
}: {
  metric?: AnalyticsMetric
  overdue?: AnalyticsMetric
  loading: boolean
  failed: boolean
}) {
  const status = statusOf(failed, metric)
  const count = readyValue(metric)
  const late = readyValue(overdue)
  const amounts = metric?.amounts ?? []
  const first = amounts.find((amount) => amount.currency === 'EUR') ?? amounts[0]

  return (
    <Card label="Outstanding">
      <Head aside={status.state === 'ready' ? <ModuleLink href="/dashboard/invoices">Invoices</ModuleLink> : loading ? null : <StateChip state={status.state} />}>
        <Eyebrow>Outstanding</Eyebrow>
      </Head>
      {loading ? (
        <Skeleton />
      ) : count === null ? (
        <UnreadyBody status={status as Status & { state: Unready }} />
      ) : (
        <>
          <p className="dash-figure text-[30px]">{first ? money(first.currency, first.minor) : money('EUR', 0)}</p>
          {amounts
            .filter((amount) => amount !== first)
            .map((amount) => (
              <Quiet key={amount.currency}>and {money(amount.currency, amount.minor)}, counted apart</Quiet>
            ))}
          <Quiet>
            {count === 0 ? (
              'No open invoices.'
            ) : (
              <>
                {plural(count, 'open invoice', 'open invoices')}
                {late !== null && late > 0 ? (
                  <>
                    {' · '}
                    <span className="font-semibold text-[var(--dash-red-ink)]">{formatCount(late)} overdue</span>
                  </>
                ) : null}
              </>
            )}
          </Quiet>
        </>
      )}
    </Card>
  )
}

/* --------------------------------------------------------------- row 2 */

function MoneyInCard({ block, loading, failed }: { block?: MonthlyMoneyBlock; loading: boolean; failed: boolean }) {
  const [range, setRange] = useState<'6m' | 'year'>('year')
  const [chosen, setChosen] = useState<string | null>(null)
  const status = statusOf(failed, block)
  const months = block?.months ?? []
  const year = months.at(-1)?.slice(0, 4) ?? ''
  const start = range === '6m' ? Math.max(0, months.length - 6) : Math.max(0, months.findIndex((month) => month.slice(0, 4) === year))
  const shown = months.slice(start)
  const currencies = block?.currencies ?? []
  const entry = currencies.find((item) => item.currency === chosen) ?? primaryCurrency(block)
  const currency = entry?.currency ?? 'EUR'
  const values = entry ? entry.total.slice(start) : shown.map(() => 0)
  const sub =
    range === '6m' ? 'Paid invoices per month, last 6 months' : year ? `Paid invoices per month, ${year}` : 'Paid invoices per month'
  const summary = values.every((value) => value === 0)
    ? `${sub}: nothing received yet.`
    : `${sub}, in ${currency}: ` +
      shown.map((month, index) => `${MONTH_SHORT.format(monthDate(month))} ${money(currency, values[index]!)}`).join(', ') +
      '.'

  return (
    <Card label="Money in">
      <Head
        aside={
          status.state === 'ready' ? (
            <>
              {currencies.length > 1 ? (
                <Switch
                  label="Currency"
                  value={currency}
                  options={currencies.map((item) => [item.currency, item.currency] as [string, string])}
                  onChange={setChosen}
                />
              ) : null}
              <Switch label="Months shown" value={range} options={[['6m', '6 months'], ['year', 'This year']]} onChange={setRange} />
            </>
          ) : (
            loading ? null : <StateChip state={status.state} />
          )
        }
      >
        <Title title="Money in" sub={sub} />
      </Head>
      {loading ? (
        <span className="dash-skeleton h-[200px] w-full rounded-lg" aria-hidden="true" />
      ) : status.state !== 'ready' ? (
        <UnreadyBody status={status as Status & { state: Unready }} />
      ) : (
        <>
          <MoneyCurve
            labels={shown.map((month) => MONTH_SHORT.format(monthDate(month)))}
            longLabels={shown.map((month) => MONTH_YEAR.format(monthDate(month)))}
            values={values}
            format={(minor) => money(currency, minor)}
            axisFormat={(minor) => formatMoney({ currency, minor }, { cents: false })}
            summary={summary}
            emptyText="Your first paid invoice draws this line"
          />
          <HiddenTable
            caption={`${sub} (${currency}, after refunds)`}
            head={['Month', 'Received']}
            rows={shown.map((month, index) => [MONTH_YEAR.format(monthDate(month)), money(currency, values[index]!)])}
          />
          <Quiet>After refunds. The current month is the month so far.{currencies.length > 1 ? ' Each currency is shown on its own.' : ''}</Quiet>
        </>
      )}
    </Card>
  )
}

function PaidOnTimeCard({ metric, loading, failed }: { metric?: AnalyticsMetric; loading: boolean; failed: boolean }) {
  const status = statusOf(failed, metric)
  const onTime = metric?.rate?.numerator ?? 0
  const late = (metric?.rate?.denominator ?? 0) - onTime
  const share = readyValue(metric)

  return (
    <Card label="Paid on time" className="items-center justify-between">
      <div className="flex w-full items-center justify-between gap-2">
        <h2 className="text-[13.5px] font-semibold">Paid on time</h2>
        {status.state === 'ready' || status.state === 'empty' ? (
          <span className="text-[11px] text-[var(--dash-quiet)]">last 90 days</span>
        ) : (
          loading ? null : <StateChip state={status.state} />
        )}
      </div>
      {loading ? (
        <span className="dash-skeleton h-[110px] w-[200px] rounded-full" aria-hidden="true" />
      ) : status.state === 'ready' || status.state === 'empty' ? (
        <>
          <Gauge
            share={share}
            caption="of invoices"
            label={
              share === null
                ? 'Paid on time: no invoice was paid in full in the last 90 days.'
                : `Paid on time: ${formatRatio(share)} of invoices paid in full in the last 90 days — ${formatCount(onTime)} on time, ${formatCount(late)} late.`
            }
          />
          <div className="flex flex-wrap justify-center gap-x-3.5 gap-y-1 text-[11px] text-[var(--dash-quiet)]">
            {share === null ? (
              <span>Appears after the first invoice is paid in full.</span>
            ) : (
              <>
                <span>
                  <i aria-hidden="true" className="me-1.5 inline-block size-2 rounded-[3px] bg-[var(--dash-series-1)]" />
                  {formatCount(onTime)} on time
                </span>
                <span>
                  <i aria-hidden="true" className="me-1.5 inline-block size-2 rounded-[3px] bg-[var(--dash-chip)]" />
                  {formatCount(late)} late
                </span>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="w-full">
          <UnreadyBody status={status as Status & { state: Unready }} />
        </div>
      )}
    </Card>
  )
}

/* --------------------------------------------------------------- row 3 */

function HeatmapCard({ block, loading, failed }: { block?: VisitHeatmapBlock; loading: boolean; failed: boolean }) {
  const status = statusOf(failed, block)
  const weekdays = block?.weekdays ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const slots = block?.slots ?? ['00–06', '06–09', '09–12', '12–15', '15–18', '18–21', '21–24']
  const ready = status.state === 'ready'
  const cells = ready ? (block?.cells ?? []) : []
  let busiest: { day: string; slot: string; value: number } | null = null

  cells.forEach((row, r) =>
    row.forEach((value, c) => {
      if (value > 0 && (!busiest || value > busiest.value)) busiest = { day: weekdays[r]!, slot: slots[c]!, value }
    }),
  )

  const found = busiest as { day: string; slot: string; value: number } | null
  const summary = !ready
    ? 'When people visit: not available.'
    : !found
      ? 'When people visit: no visits counted in the last 30 days.'
      : `When people visit, by weekday and time in Berlin, last 30 days. Busiest: ${found.day} ${found.slot} with ${plural(found.value, 'visit', 'visits')}.`

  return (
    <Card label="When people visit">
      <Head aside={ready ? undefined : loading ? null : <StateChip state={status.state} />}>
        <Title title="When people visit" sub="Weekday × time, Berlin · 30 days" />
      </Head>
      {loading ? (
        <span className="dash-skeleton h-[170px] w-full rounded-lg" aria-hidden="true" />
      ) : (
        <>
          <Heatmap weekdays={weekdays} slots={slots} cells={cells} muted={!ready} summary={summary} unit={['visit', 'visits']} />
          {ready ? (
            <>
              <HiddenTable
                caption="Visits by weekday and time slot (Berlin)"
                head={['Weekday and time', 'Visits']}
                rows={cells.flatMap((row, r) => row.map((value, c) => [`${weekdays[r]} ${slots[c]}`, formatCount(value)] as [string, string]))}
              />
              <Quiet>
                {found
                  ? `Busiest: ${found.day} ${found.slot}. Cloudflare samples page loads, so these are close estimates.`
                  : 'No visits were counted in the last 30 days.'}
              </Quiet>
            </>
          ) : (
            <UnreadyBody status={status as Status & { state: Unready }} />
          )}
        </>
      )}
    </Card>
  )
}

const STEP_NAMES: Array<[string, string]> = [
  ['inbox.new', 'Messages'],
  ['booking.made', 'Bookings'],
  ['clients.new', 'Clients'],
  ['invoices.paidInFull', 'Paid'],
]

const share = (part: number, whole: number) => {
  const ratio = part / whole

  return `${ratio > 0 && ratio < 0.1 ? (ratio * 100).toFixed(1) : Math.round(ratio * 100)}%`
}

function FunnelCard({ funnel, loading, failed }: { funnel?: AnalyticsMetric[]; loading: boolean; failed: boolean }) {
  const visits = findMetric(funnel, 'website.visitors')
  const visitsValue = failed ? null : readyValue(visits)
  const visitsStatus = statusOf(failed, visits)
  const steps = STEP_NAMES.map(([key, name]) => {
    const metric = findMetric(funnel, key)

    return { key, name, metric, value: failed ? null : readyValue(metric), status: statusOf(failed, metric) }
  })
  const messages = steps[0]!.value
  const top = Math.max(0, ...steps.map((step) => step.value ?? 0))

  return (
    <Card label="From visitor to paid">
      <Head aside={<span className="text-[11px] text-[var(--dash-quiet)]">30 days</span>}>
        <h2 className="text-[13.5px] font-semibold">From visitor to paid</h2>
      </Head>
      {loading ? (
        <Skeleton lines={4} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10.5px] font-bold tracking-[0.14em] text-[var(--dash-quiet)] uppercase">Visits</p>
              {visitsValue === null ? (
                <p className={cn('text-[14px] font-semibold', visitsStatus.state === 'error' ? 'text-[var(--dash-red-ink)]' : 'text-[var(--dash-quiet)]')}>
                  {STATE_VALUE[visitsStatus.state as Unready]}
                </p>
              ) : (
                <p className="dash-figure text-[22px]">{formatCount(visitsValue)}</p>
              )}
            </div>
            <span className="dash-tone-blue rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap">
              {visitsValue !== null && visitsValue > 0 && messages !== null
                ? `${share(messages, visitsValue)} write to you`
                : visitsValue === null
                  ? 'visits not counted yet'
                  : 'waiting for visits'}
            </span>
          </div>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {steps.map((step, index) => {
              const before = index > 0 ? steps[index - 1]!.value : null
              const conversion =
                // Steps are counted apart, so a later one can outgrow the one before: no "300 %".
                index > 0 && step.value !== null && before !== null && before > 0 && step.value <= before
                  ? share(step.value, before)
                  : null

              return (
                <li key={step.key} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2.5 text-[12.5px]">
                  <span className="font-medium text-[var(--dash-quiet)]">{step.name}</span>
                  <FunnelBar
                    share={step.value !== null && top > 0 ? step.value / top : 0}
                    step={index}
                    title={step.name}
                    body={
                      step.value === null
                        ? STATE_VALUE[step.status.state as Unready]
                        : `${formatCount(step.value)}${conversion ? ` · ${conversion} of the step before` : ''}`
                    }
                  />
                  <span className="min-w-[52px] text-end font-semibold tabular-nums">
                    {step.value === null ? (
                      <span className={cn('text-[11px] font-medium', step.status.state === 'error' ? 'text-[var(--dash-red-ink)]' : 'text-[var(--dash-quiet)]')}>
                        {STATE_VALUE[step.status.state as Unready]}
                      </span>
                    ) : (
                      <>
                        {formatCount(step.value)}
                        {conversion ? <small className="ms-1 text-[10.5px] font-medium text-[var(--dash-quiet)]">{conversion}</small> : null}
                      </>
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
          <Quiet>
            Messages are conversations others started (email, contact form, booking). Each step is counted on its own
            in these 30 days — not the same people followed through.
          </Quiet>
        </>
      )}
    </Card>
  )
}

/* ----------------------------------------------------------------- needs you */

type NeedRow = { key: string; tone: 'red' | 'blue' | 'grey'; icon: ReactNode; title: string; detail: string; link: string; linkLabel: string }

function NeedsCard({ data, loading, failed }: { data?: AnalyticsOverviewResponse; loading: boolean; failed: boolean }) {
  const overdue = findMetric(data?.headline, 'invoices.overdue')
  const followUps = findMetric(data?.glimpse, 'leads.followUpsDue')
  const unread = findMetric(data?.headline, 'inbox.unread')
  const upcoming = findMetric(data?.glimpse, 'booking.upcoming')
  const rows: NeedRow[] = []
  const gaps: Array<{ key: string; label: string; icon: ReactNode; status: Status }> = []

  const consider = (
    key: string,
    label: string,
    icon: ReactNode,
    metric: AnalyticsMetric | undefined,
    build: (count: number) => Omit<NeedRow, 'key' | 'icon'>,
  ) => {
    const count = failed ? null : readyValue(metric)

    if (count === null) gaps.push({ key, label, icon, status: statusOf(failed, metric) })
    else if (count > 0) rows.push({ key, icon, ...build(count) })
  }

  consider('overdue', 'Overdue invoices', <Euro className={ICON} />, overdue, (count) => ({
    tone: 'red',
    title: `${plural(count, 'invoice', 'invoices')} overdue`,
    detail:
      (overdue?.amounts ?? []).length > 0
        ? `${(overdue?.amounts ?? []).map((amount) => money(amount.currency, amount.minor)).join(' · ')} still to pay`
        : 'Past their due date',
    link: '/dashboard/invoices',
    linkLabel: 'Invoices',
  }))
  consider('follow-ups', 'Follow-ups', <Handshake className={ICON} />, followUps, (count) => ({
    tone: 'blue',
    title: `${plural(count, 'follow-up is', 'follow-ups are')} due`,
    detail: 'Leads you promised to get back to',
    link: '/dashboard/leads/follow-ups?when=due',
    linkLabel: 'Leads',
  }))
  consider('unread', 'Inbox', <Inbox className={ICON} />, unread, (count) => ({
    tone: 'grey',
    title: plural(count, 'unread conversation', 'unread conversations'),
    detail: 'Waiting in the Inbox',
    link: '/dashboard/inbox',
    linkLabel: 'Inbox',
  }))
  consider('upcoming', 'Appointments', <CalendarDays className={ICON} />, upcoming, (count) => ({
    tone: 'blue',
    title: `${plural(count, 'appointment', 'appointments')} in the next 7 days`,
    detail: 'Confirmed bookings, by when they take place',
    link: '/dashboard/calendar',
    linkLabel: 'Calendar',
  }))

  return (
    <Card label="Needs you">
      <h2 className="text-[13.5px] font-semibold">Needs you</h2>
      {loading ? (
        <Skeleton lines={3} />
      ) : rows.length === 0 && gaps.length === 0 ? (
        <EmptyNote icon={<Clock className={ICON} />}>
          <b className="font-semibold text-[var(--dash-ink)]">Nothing needs you</b>
          <br />
          Follow-ups, overdue invoices and unread mail land here when they happen.
        </EmptyNote>
      ) : (
        <ul className="m-0 list-none p-0">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-3 border-t border-[var(--dash-soft)] py-2.5 text-[13px] first:border-0">
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-[10px]',
                  row.tone === 'red' ? 'dash-tone-red' : row.tone === 'blue' ? 'dash-tone-blue' : 'dash-tone-grey',
                )}
              >
                {row.icon}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block font-semibold">{row.title}</b>
                <small className="block text-[11.5px] text-[var(--dash-quiet)]">{row.detail}</small>
              </span>
              <ModuleLink href={row.link}>
                {row.linkLabel}
                <span className="sr-only">: {row.title}</span>
              </ModuleLink>
            </li>
          ))}
          {gaps.map((gap) => (
            <li key={gap.key} className="flex items-center gap-3 border-t border-[var(--dash-soft)] py-2.5 text-[13px] first:border-0">
              <span aria-hidden="true" className="dash-tone-grey grid size-8 shrink-0 place-items-center rounded-[10px]">
                {gap.icon}
              </span>
              <span className="min-w-0 flex-1">
                <b className={cn('block font-semibold', gap.status.state === 'error' ? 'text-[var(--dash-red-ink)]' : 'text-[var(--dash-quiet)]')}>
                  {gap.label}: {STATE_VALUE[gap.status.state as Unready].toLowerCase()}
                </b>
                {gap.status.message ? <small className="block text-[11.5px] text-[var(--dash-quiet)]">{gap.status.message}</small> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* --------------------------------------------------------------------- page */

export function OverviewPage({ name }: { name?: string }) {
  const overview = useOverview(OVERVIEW_PERIOD)
  const now = new Date()
  const firstName = name?.trim().split(/\s+/u)[0]
  const data = overview.data
  const loading = overview.isPending
  const failed = overview.isError && !data
  const board = data?.board
  const common = { loading, failed }

  return (
    <DashboardPage className="@container gap-4">
      <PageHead
        eyebrow="OVERVIEW"
        title={
          <span suppressHydrationWarning>
            {greeting(now)}
            {firstName ? `, ${firstName}` : ''}
          </span>
        }
        actions={
          <Link to="/dashboard/analytics" className="dash-btn dash-btn-quiet">
            <ChartLine className="size-4" aria-hidden="true" />
            Open analytics
          </Link>
        }
        description={<span suppressHydrationWarning>{berlinLongDate(now)} · last 30 days</span>}
        className="dash-rise dash-rise-1"
      />

      {failed ? (
        <div role="alert" className="dash-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
          <span>
            <b className="font-semibold">The overview could not be loaded.</b>{' '}
            <span className="text-[var(--dash-quiet)]">Nothing is shown in its place.</span>
          </span>
          <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12.5px]" onClick={() => void overview.refetch()}>
            Try again
          </button>
        </div>
      ) : null}

      <div className="dash-rise dash-rise-2 grid grid-cols-1 gap-3.5 @xl:grid-cols-2 @4xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="@xl:col-span-2 @4xl:col-span-1 flex min-w-0 flex-col">
          <ReceivedCard block={board?.receivedByMonth} {...common} />
        </div>
        <VisitsCard metric={findMetric(data?.headline, 'website.visitors')} {...common} />
        <OutstandingCard metric={board?.outstanding} overdue={findMetric(data?.headline, 'invoices.overdue')} {...common} />
      </div>

      <div className="dash-rise dash-rise-3 grid grid-cols-1 gap-3.5 @4xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <MoneyInCard block={board?.receivedByMonth} {...common} />
        <PaidOnTimeCard metric={board?.paidOnTime} {...common} />
      </div>

      <div className="dash-rise dash-rise-4 grid grid-cols-1 gap-3.5 @xl:grid-cols-2 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
        <HeatmapCard block={board?.visitsHeatmap} {...common} />
        <FunnelCard funnel={board?.funnel} {...common} />
        <div className="@xl:col-span-2 @4xl:col-span-1 flex min-w-0 flex-col">
          <NeedsCard data={data} {...common} />
        </div>
      </div>
    </DashboardPage>
  )
}
