import {
  type FxProposal,
  type FxRate,
  convertMinor,
  parseRateMicro,
} from '../../contracts/invoice.contract'
import { type Page, toPage } from '../../contracts/pagination.contract'
import { getDb } from '../../db/client'
import { badRequest, fxUnavailable } from '../../http/error'
import { now, today } from './invoice.clock'

/**
 * EUR → USD price proposals, with an audit trail.
 *
 * The source is the European Central Bank's daily reference rate: free, no
 * key, published on working days around 16:00 CET. It proposes a customer
 * price — the owner reviews it and may type their own rate — and it is **not**
 * the conversion used for tax reporting, which remains an open question.
 *
 * Every rate used is stored (`v2_exchange_rates`): what it was, for which
 * day, and whether the ECB or the owner supplied it. A proposal never changes
 * an invoice or subscription by itself; the owner copies the amount and the
 * rate id travels with it for the record. When the ECB cannot be reached,
 * the most recent stored ECB rate up to 7 days old is offered, labelled with
 * its own date; older than that, the owner is asked to enter a rate.
 */

export type EcbSource = { latest: () => Promise<{ rate: string; date: string }> }

const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'

/** Reads the one number that matters out of the ECB's daily XML. */
export const parseEcbDaily = (xml: string): { rate: string; date: string } | null => {
  const date = /time=['"](\d{4}-\d{2}-\d{2})['"]/u.exec(xml)?.[1]
  const rate = /currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/u.exec(xml)?.[1]

  if (!date || !rate || parseRateMicro(rate) === null) return null

  return { rate, date }
}

const fetchEcb: EcbSource = {
  latest: async () => {
    const response = await fetch(ECB_URL, { signal: AbortSignal.timeout(8000) })

    if (!response.ok) throw new Error(`ECB answered ${response.status}`)

    const parsed = parseEcbDaily(await response.text())

    if (!parsed) throw new Error('ECB response had no USD rate')

    return parsed
  },
}

let override: EcbSource | undefined

export const useEcbSourceForTest = (source: EcbSource | undefined): void => {
  override = source
}

type RateRow = { id: string; rate: string | number; rate_date: string; source: 'ecb' | 'manual'; fetched_at: Date }

const toRate = (row: RateRow): FxRate => ({
  id: row.id,
  base: 'EUR',
  quote: 'USD',
  rate: String(Number(row.rate)),
  rateDate: row.rate_date,
  source: row.source,
  fetchedAt: new Date(row.fetched_at).toISOString(),
})

const COLUMNS = 'id, rate, rate_date::text AS rate_date, source, fetched_at'

export const findRate = async (id: string): Promise<FxRate | null> => {
  const { rows } = await getDb().query<RateRow>(`SELECT ${COLUMNS} FROM v2_exchange_rates WHERE id = $1`, [id])

  return rows[0] ? toRate(rows[0]) : null
}

const latestEcb = async (): Promise<RateRow | null> => {
  const { rows } = await getDb().query<RateRow>(
    `SELECT ${COLUMNS} FROM v2_exchange_rates WHERE source = 'ecb'
      ORDER BY rate_date DESC, fetched_at DESC LIMIT 1`,
  )

  return rows[0] ?? null
}

const insertRate = async (input: { rate: string; date: string; source: 'ecb' | 'manual' }): Promise<RateRow> => {
  const db = getDb()

  if (input.source === 'ecb') {
    const { rows } = await db.query<RateRow>(
      `INSERT INTO v2_exchange_rates (base_currency, quote_currency, rate, rate_date, source)
       VALUES ('EUR', 'USD', $1, $2, 'ecb')
       ON CONFLICT (base_currency, quote_currency, rate_date) WHERE source = 'ecb'
       DO UPDATE SET fetched_at = CURRENT_TIMESTAMP
       RETURNING ${COLUMNS}`,
      [input.rate, input.date],
    )

    return rows[0]!
  }

  const { rows } = await db.query<RateRow>(
    `INSERT INTO v2_exchange_rates (base_currency, quote_currency, rate, rate_date, source)
     VALUES ('EUR', 'USD', $1, $2, 'manual') RETURNING ${COLUMNS}`,
    [input.rate, input.date],
  )

  return rows[0]!
}

const SIX_HOURS = 6 * 60 * 60 * 1000

/** The ECB rate to propose now, fetching at most every six hours. */
const currentEcbRate = async (): Promise<RateRow> => {
  const stored = await latestEcb()

  if (stored && now().getTime() - new Date(stored.fetched_at).getTime() < SIX_HOURS) return stored

  try {
    const fresh = await (override ?? fetchEcb).latest()

    return await insertRate({ rate: fresh.rate, date: fresh.date, source: 'ecb' })
  } catch {
    const ageDays = stored ? (Date.parse(today()) - Date.parse(stored.rate_date)) / 86_400_000 : Infinity

    if (stored && ageDays <= 7) return stored

    throw fxUnavailable()
  }
}

export const proposeConversion = async (input: { amountMinor: number; rate?: string }): Promise<FxProposal> => {
  let row: RateRow

  if (input.rate !== undefined) {
    if (parseRateMicro(input.rate) === null) throw badRequest('Enter the rate like 1.0875')

    row = await insertRate({ rate: input.rate, date: today(), source: 'manual' })
  } else {
    row = await currentEcbRate()
  }

  const rate = toRate(row)

  return {
    rateId: rate.id,
    rate: rate.rate,
    rateDate: rate.rateDate,
    source: rate.source,
    from: 'EUR',
    to: 'USD',
    fromMinor: input.amountMinor,
    toMinor: convertMinor(input.amountMinor, parseRateMicro(rate.rate)!),
  }
}

export const listRates = async (input: { page: number; pageSize: number }): Promise<Page<FxRate>> => {
  const db = getDb()
  const { rows: counted } = await db.query<{ total: string | number }>('SELECT count(*) AS total FROM v2_exchange_rates')
  const { rows } = await db.query<RateRow>(
    `SELECT ${COLUMNS} FROM v2_exchange_rates ORDER BY fetched_at DESC, id DESC LIMIT $1 OFFSET $2`,
    [input.pageSize, (input.page - 1) * input.pageSize],
  )

  return toPage({
    items: rows.map(toRate),
    page: input.page,
    pageSize: input.pageSize,
    total: Number(counted[0]?.total ?? 0),
  })
}
