import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The gapless series, under two clicks.
 *
 * `§14 UStG` wants a continuous sequence, and the one thing it cannot survive
 * is a number that belongs to no document. Two overlapping requests used to
 * reach the allocation together: under `READ COMMITTED` each saw the row as a
 * draft, each took a number, and the second `UPDATE` wrote its number over the
 * first's — leaving the first orphaned for ever, and the PDF already frozen in
 * the bucket printing a number the row no longer held.
 *
 * Proving that needs a database that actually blocks, so the fake below is a
 * small Postgres rather than a recorder: statement snapshots, row locks taken
 * by `FOR UPDATE` and by `ON CONFLICT ... DO UPDATE`, predicates re-checked
 * against the latest version once a lock is finally granted. It is told
 * nothing about which statement is the right one; it only follows those rules,
 * and the rules are what fail the broken shapes.
 *
 * Two windows matter, and each has its own test, because pinning only the
 * first leaves the second free to break:
 *
 * 1. A lock is taken **before** the number is handed out.
 * 2. That lock is still **held** while the number is handed out. Drop the
 *    transaction and the lock lives for one statement, the row is free again
 *    a moment later, and the hole is exactly as open as it was before.
 */

/* -------------------------------------------------------------------------- */
/* A database small enough to read, faithful enough to block                   */
/* -------------------------------------------------------------------------- */

const holder = vi.hoisted(() => ({ engine: null as unknown as Engine }))

vi.mock('#/shared/env', () => ({ env: { DATABASE_URL: 'postgres://localhost/test' } }))

vi.mock('#/backend/shared/image-storage', () => ({ resolveObjectStore: async () => null }))

vi.mock('#/backend/modules/invoices/client.service', () => ({
  getClient: async (id: string) => ({ id, name: 'A client' }),
}))

vi.mock('pg', () => ({
  Pool: class {
    query = (text: string, values?: unknown[]) => holder.engine.autocommit(text, values ?? [])
    connect = async () => holder.engine.connect()
    end = async () => {}
  },
}))

const THIS_YEAR = 2026
const TODAY = `${THIS_YEAR}-09-18`

/** Long enough for any real interleaving, short enough to beat vitest's 5s. */
const PATIENCE_MS = 1_500

type Line = {
  id: string
  position: number
  description: string
  detail: string
  quantity: number
  unit_cents: number
  tax_rate: number
}

type Invoice = {
  id: string
  status: string
  number: string | null
  numberYear: number | null
  kind: string
  correctsId: string | null
  clientId: string
  dealId: string | null
  moneyKind: string
  language: string
  totalCents: number
  netCents: number
  taxCents: number
  lines: Line[]
}

type Txn = {
  id: number
  held: Set<string>
  invoices: Map<string, Invoice>
  numbers: Map<number, number>
}

type Result = { rows: Record<string, unknown>[]; rowCount: number }

const deadline = <T,>(work: Promise<T>, what: string): Promise<T> =>
  Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), PATIENCE_MS),
    ),
  ])

class Engine {
  /** Committed state. */
  readonly invoices = new Map<string, Invoice>()
  readonly numbers = new Map<number, number>()

  private readonly owner = new Map<string, number>()
  private readonly waiters = new Map<string, Array<() => void>>()
  private lastTxn = 0
  private lastId = 0
  private hook: { prefix: string; fire: () => Promise<void> } | null = null
  private broken: RegExp | null = null

  /** How many statements are blocked on a lock right now. */
  waiting = 0

  seed(invoice: Partial<Invoice> & { id: string }): Invoice {
    const row: Invoice = {
      status: 'DRAFT',
      number: null,
      numberYear: null,
      kind: 'INVOICE',
      correctsId: null,
      clientId: 'client-1',
      dealId: null,
      moneyKind: 'BUILD',
      language: 'de',
      totalCents: 0,
      netCents: 0,
      taxCents: 0,
      lines: [],
      ...invoice,
    }

    this.invoices.set(row.id, row)

    return row
  }

  /**
   * Freezes whichever transaction next takes a lock whose key starts with
   * `prefix`, and hands back the means to let it go again. That is how two
   * requests are made to genuinely overlap inside a chosen window, rather than
   * to merely start together and finish in whatever order falls out.
   *
   * - `''` catches the first lock of all, which for a correct implementation
   *   is the locking read on the draft.
   * - `'numbers:'` catches the lock taken *inside* the allocating statement,
   *   after its snapshot of the invoice has already been read. A request
   *   parked there is mid-act, which is the window a one-statement lock leaves
   *   wide open.
   */
  holdAtLock(prefix: string): { reached: Promise<void>; release: () => void } {
    let reached!: () => void
    let released!: () => void
    const arrival = new Promise<void>((resolve) => (reached = resolve))
    const departure = new Promise<void>((resolve) => (released = resolve))

    this.hook = {
      prefix,
      fire: async () => {
        this.hook = null
        reached()
        await departure
      },
    }

    return { reached: deadline(arrival, `a transaction to take a "${prefix}" lock`), release: released }
  }

  /**
   * Makes the next statement matching `pattern` fail, the way a dropped
   * connection or a constraint does. Used to ask what the act leaves behind
   * when it cannot finish.
   */
  breakOn(pattern: RegExp): void {
    this.broken = pattern
  }

  /**
   * Waits until the other request is either blocked on a lock or has finished
   * without ever needing one. Both are outcomes worth asserting on, and
   * waiting only for the first would hang for ever on the shapes that never
   * block — which are precisely the broken ones.
   */
  async untilBlockedOr(settled: () => boolean): Promise<void> {
    const until = Date.now() + PATIENCE_MS

    while (Date.now() < until) {
      if (this.waiting > 0 || settled()) return
      await new Promise((resolve) => setTimeout(resolve, 1))
    }

    throw new Error('the second request neither blocked nor finished')
  }

  /* ---- locking ---------------------------------------------------------- */

  private async acquire(txn: Txn, key: string): Promise<void> {
    if (this.owner.get(key) === txn.id) return

    while (this.owner.has(key)) {
      this.waiting += 1
      try {
        await new Promise<void>((resolve) => {
          const queue = this.waiters.get(key) ?? []
          queue.push(resolve)
          this.waiters.set(key, queue)
        })
      } finally {
        this.waiting -= 1
      }
    }

    this.owner.set(key, txn.id)
    txn.held.add(key)

    if (this.hook && key.startsWith(this.hook.prefix)) await this.hook.fire()
  }

  private releaseAll(txn: Txn): void {
    for (const key of txn.held) {
      this.owner.delete(key)
      const queue = this.waiters.get(key)
      this.waiters.delete(key)
      queue?.forEach((wake) => wake())
    }

    txn.held.clear()
  }

  /* ---- visibility ------------------------------------------------------- */

  private readInvoice(txn: Txn, id: string): Invoice | undefined {
    return txn.invoices.get(id) ?? this.invoices.get(id)
  }

  private allInvoices(txn: Txn): Invoice[] {
    const merged = new Map(this.invoices)
    for (const [id, row] of txn.invoices) merged.set(id, row)

    return [...merged.values()]
  }

  private begin(): Txn {
    this.lastTxn += 1

    return { id: this.lastTxn, held: new Set(), invoices: new Map(), numbers: new Map() }
  }

  private commit(txn: Txn): void {
    for (const [id, row] of txn.invoices) this.invoices.set(id, row)
    for (const [year, next] of txn.numbers) this.numbers.set(year, next)
    this.releaseAll(txn)
  }

  private rollback(txn: Txn): void {
    this.releaseAll(txn)
  }

  /* ---- reading ---------------------------------------------------------- */

  /** One row in the exact shape `getInvoice` projects from. */
  private head(txn: Txn, row: Invoice): Record<string, unknown> {
    const credited = this.allInvoices(txn)
      .filter((o) => o.correctsId === row.id && o.kind === 'CREDIT_NOTE' && o.status === 'ISSUED')
      .reduce((sum, o) => sum + o.totalCents, 0)

    return {
      id: row.id,
      number: row.number,
      kind: row.kind,
      status: row.status,
      money_kind: row.moneyKind,
      client_id: row.clientId,
      client_name: 'Musterfirma GmbH',
      first_line: row.lines[0]?.description ?? null,
      issued_on: row.status === 'DRAFT' ? null : TODAY,
      due_on: null,
      total_cents: row.totalCents,
      paid_cents: 0,
      currency: 'EUR',
      pdf_key: null,
      letter_count: 0,
      last_letter_at: null,
      today: TODAY,
      credited_cents: credited,
      deal_id: row.dealId,
      language: row.language,
      note: '',
      net_cents: row.netCents,
      tax_cents: row.taxCents,
      corrects_id: row.correctsId,
      corrects_number: row.correctsId
        ? (this.readInvoice(txn, row.correctsId)?.number ?? null)
        : null,
      service_from: null,
      service_to: null,
      cl_id: row.clientId,
      cl_lead_id: null,
      cl_company: 'Musterfirma GmbH',
      cl_contact_name: 'Erika Muster',
      cl_email: 'erika@example.de',
      cl_phone: '',
      cl_street: 'Musterstr. 1',
      cl_street_extra: '',
      cl_postcode: '10115',
      cl_city: 'Berlin',
      cl_country: 'DE',
      cl_vat_id: '',
      cl_language: 'de',
      cl_notes: '',
      cl_created_at: new Date('2026-01-01T00:00:00Z'),
    }
  }

  /* ---- statements ------------------------------------------------------- */

  private async run(txn: Txn, text: string, values: unknown[]): Promise<Result> {
    const sql = text.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim()
    const first = values[0] as string

    if (this.broken?.test(sql)) {
      this.broken = null

      throw new Error('connection terminated unexpectedly')
    }

    if (/^SELECT .*\bFROM invoices\b.*\bFOR UPDATE\b/i.test(sql)) {
      // A locking read waits for whoever holds the row, then re-checks its
      // predicate against the version that transaction left behind.
      await this.acquire(txn, `invoice:${first}`)

      const row = this.readInvoice(txn, first)
      const matches = row && (!/status = 'DRAFT'/i.test(sql) || row.status === 'DRAFT')

      // Both columns, because a caller that selects `status` needs to tell a
      // row that is not a draft apart from a row that is not there at all.
      return matches
        ? { rows: [{ id: row!.id, status: row!.status }], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    }

    if (/INSERT INTO invoice_numbers/i.test(sql) && /UPDATE invoices/i.test(sql)) {
      // The `target` CTE reads this statement's snapshot, taken before
      // anything below has a chance to block.
      const target = this.readInvoice(txn, first)
      const selects = target && (!/status = 'DRAFT'/i.test(sql) || target.status === 'DRAFT')

      if (!selects) return { rows: [], rowCount: 0 }

      // `ON CONFLICT ... DO UPDATE` takes the conflicting row's lock, waits
      // for any transaction already holding it, and then re-reads the value.
      await this.acquire(txn, `numbers:${THIS_YEAR}`)

      const seq = txn.numbers.get(THIS_YEAR) ?? this.numbers.get(THIS_YEAR) ?? 1
      txn.numbers.set(THIS_YEAR, seq + 1)

      // The outer UPDATE re-reads the latest version and re-checks its own
      // WHERE against it — and `i.id = $1` is true whatever the status says.
      const latest = this.readInvoice(txn, first)

      if (!latest) return { rows: [], rowCount: 0 }

      const number = `${THIS_YEAR}-${String(seq).padStart(3, '0')}`

      txn.invoices.set(first, { ...latest, status: 'ISSUED', number, numberYear: THIS_YEAR })

      return { rows: [{ number }], rowCount: 1 }
    }

    if (/^INSERT INTO invoices\b/i.test(sql)) {
      this.lastId += 1
      const id = `new-${this.lastId}`

      txn.invoices.set(
        id,
        this.draftFrom(id, values),
      )

      return { rows: [{ id }], rowCount: 1 }
    }

    if (/^INSERT INTO invoice_lines\b/i.test(sql)) {
      const owner = this.readInvoice(txn, first)

      if (!owner) return { rows: [], rowCount: 0 }

      txn.invoices.set(first, {
        ...owner,
        lines: [
          ...owner.lines,
          {
            id: `line-${owner.lines.length + 1}`,
            position: values[1] as number,
            description: values[2] as string,
            detail: values[3] as string,
            quantity: values[4] as number,
            unit_cents: values[5] as number,
            tax_rate: values[6] as number,
          },
        ],
      })

      return { rows: [], rowCount: 1 }
    }

    if (/^UPDATE invoices SET status = 'CANCELLED'/i.test(sql)) {
      const row = this.readInvoice(txn, first)

      if (row) txn.invoices.set(first, { ...row, status: 'CANCELLED' })

      return { rows: [], rowCount: row ? 1 : 0 }
    }

    if (/^UPDATE invoices\s+SET client_id/i.test(sql)) {
      const row = this.readInvoice(txn, first)
      const matches = row && (!/status = 'DRAFT'/i.test(sql) || row.status === 'DRAFT')

      if (!matches) return { rows: [], rowCount: 0 }

      txn.invoices.set(first, {
        ...row!,
        clientId: values[1] as string,
        dealId: values[2] as string | null,
        moneyKind: values[3] as Invoice['moneyKind'],
        language: values[4] as Invoice['language'],
      })

      return { rows: [], rowCount: 1 }
    }

    if (/^UPDATE invoices SET net_cents/i.test(sql)) {
      const row = this.readInvoice(txn, first)

      if (!row) return { rows: [], rowCount: 0 }

      txn.invoices.set(first, {
        ...row,
        netCents: values[1] as number,
        taxCents: values[2] as number,
        totalCents: values[3] as number,
      })

      return { rows: [], rowCount: 1 }
    }

    if (/^DELETE FROM invoice_lines WHERE invoice_id/i.test(sql)) {
      const row = this.readInvoice(txn, first)

      if (!row) return { rows: [], rowCount: 0 }

      const removed = row.lines.length

      txn.invoices.set(first, { ...row, lines: [] })

      return { rows: [], rowCount: removed }
    }

    if (/FROM invoices i JOIN clients c/i.test(sql)) {
      const row = this.readInvoice(txn, first)

      return row ? { rows: [this.head(txn, row)], rowCount: 1 } : { rows: [], rowCount: 0 }
    }

    if (/FROM invoice_lines WHERE invoice_id/i.test(sql)) {
      const row = this.readInvoice(txn, first)

      return { rows: row ? [...row.lines] : [], rowCount: row?.lines.length ?? 0 }
    }

    if (/FROM payments WHERE invoice_id/i.test(sql)) return { rows: [], rowCount: 0 }

    if (/FROM lead_attachments/i.test(sql)) return { rows: [], rowCount: 0 }

    if (/FROM invoices WHERE corrects_id/i.test(sql)) {
      const rows = this.allInvoices(txn)
        .filter((row) => row.correctsId === first)
        .map((row) => ({ id: row.id, number: row.number, kind: row.kind }))

      return { rows, rowCount: rows.length }
    }

    throw new Error(`the fake database was asked something it does not model: ${sql}`)
  }

  private draftFrom(id: string, values: unknown[]): Invoice {
    return {
      id,
      status: 'DRAFT',
      number: null,
      numberYear: null,
      clientId: values[0] as string,
      dealId: values[1] as string | null,
      kind: values[2] as string,
      correctsId: values[3] as string,
      moneyKind: values[4] as string,
      language: values[5] as string,
      netCents: values[7] as number,
      taxCents: values[8] as number,
      totalCents: values[9] as number,
      lines: [],
    }
  }

  /** One statement on its own, the way a pool call outside a transaction runs. */
  async autocommit(text: string, values: unknown[]): Promise<Result> {
    const txn = this.begin()

    try {
      const result = await this.run(txn, text, values)
      this.commit(txn)

      return result
    } catch (error) {
      this.rollback(txn)
      throw error
    }
  }

  connect() {
    let open: Txn | null = null

    return {
      query: async (text: string, values?: unknown[]): Promise<Result> => {
        const verb = text.trim().slice(0, 8).toUpperCase()

        if (verb.startsWith('BEGIN')) {
          open = this.begin()

          return { rows: [], rowCount: 0 }
        }

        if (verb.startsWith('COMMIT')) {
          if (open) this.commit(open)
          open = null

          return { rows: [], rowCount: 0 }
        }

        if (verb.startsWith('ROLLBACK')) {
          if (open) this.rollback(open)
          open = null

          return { rows: [], rowCount: 0 }
        }

        return open ? this.run(open, text, values ?? []) : this.autocommit(text, values ?? [])
      },
      release: () => {},
    }
  }
}

import { closePool, withTransaction } from '#/backend/db/client'
import type { InvoiceWriteInput } from '#/shared/validation/invoice.validation'
import {
  allocateAndIssue,
  correctInvoice,
  updateInvoice,
} from '#/backend/modules/invoices/invoice.service'

let engine: Engine

beforeEach(() => {
  engine = new Engine()
  holder.engine = engine
})

afterEach(async () => {
  await closePool()
})

/* -------------------------------------------------------------------------- */
/* Issuing                                                                    */
/* -------------------------------------------------------------------------- */

describe('issuing one draft twice at once', () => {
  it('takes a lock before the number is handed out', async () => {
    engine.seed({ id: 'inv-1' })

    // Parked at its very first lock, which for a correct implementation is
    // the locking read on the draft itself.
    const gate = engine.holdAtLock('')

    const first = allocateAndIssue('inv-1', true)
    let settled = false
    let second!: Promise<string | null>

    try {
      await gate.reached
      second = allocateAndIssue('inv-1', true)
      second.finally(() => (settled = true)).catch(() => {})
      await engine.untilBlockedOr(() => settled)
    } finally {
      gate.release()
    }

    const results = await deadline(Promise.all([first, second]), 'both requests to finish')

    expect(results.filter((number) => number !== null)).toEqual(['2026-001'])
    expect(engine.numbers.get(THIS_YEAR)).toBe(2)
  })

  it('still holds that lock while the number is handed out', async () => {
    engine.seed({ id: 'inv-1' })

    /*
     * Parked *inside* the allocating statement: the snapshot of the invoice is
     * already read, the series row is held, and nothing has been committed.
     *
     * This is the window a lock that lives for one statement leaves open. Move
     * the locking read out of the transaction — `getDb()` for both statements
     * rather than `withTransaction` — and the second request sails through its
     * own locking read, reaches this same statement, and takes the next number
     * while the first is still standing here.
     */
    const gate = engine.holdAtLock('numbers:')

    const first = allocateAndIssue('inv-1', true)
    let settled = false
    let second!: Promise<string | null>

    try {
      await gate.reached
      second = allocateAndIssue('inv-1', true)
      second.finally(() => (settled = true)).catch(() => {})
      await engine.untilBlockedOr(() => settled)
    } finally {
      gate.release()
    }

    const results = await deadline(Promise.all([first, second]), 'both requests to finish')

    expect(results.filter((number) => number !== null)).toEqual(['2026-001'])
    expect(results.filter((number) => number === null)).toHaveLength(1)

    // Two would mean 2026-001 belongs to no document at all.
    expect(engine.numbers.get(THIS_YEAR)).toBe(2)

    // And the row holds the number that was actually handed out, so a frozen
    // PDF drawn from it cannot print something else.
    expect(engine.invoices.get('inv-1')).toMatchObject({
      status: 'ISSUED',
      number: '2026-001',
      numberYear: THIS_YEAR,
    })
  })

  it('refuses the second attempt once the first has finished, and takes nothing', async () => {
    engine.seed({ id: 'inv-1' })

    expect(await allocateAndIssue('inv-1', true)).toBe('2026-001')
    expect(await allocateAndIssue('inv-1', true)).toBeNull()

    expect(engine.numbers.get(THIS_YEAR)).toBe(2)
    expect(engine.invoices.get('inv-1')?.number).toBe('2026-001')
  })

  it('keeps the series continuous across different invoices', async () => {
    engine.seed({ id: 'inv-1' })
    engine.seed({ id: 'inv-2' })
    engine.seed({ id: 'inv-3' })

    const numbers = await Promise.all([
      allocateAndIssue('inv-1', true),
      allocateAndIssue('inv-2', false),
      allocateAndIssue('inv-3', true),
    ])

    expect([...numbers].sort()).toEqual(['2026-001', '2026-002', '2026-003'])
    expect(engine.numbers.get(THIS_YEAR)).toBe(4)
  })

  it('takes no number for an invoice that is not there', async () => {
    expect(await allocateAndIssue('missing', true)).toBeNull()
    expect(engine.numbers.get(THIS_YEAR)).toBeUndefined()
  })
})

/* -------------------------------------------------------------------------- */
/* Correcting                                                                 */
/* -------------------------------------------------------------------------- */

/** An invoice already sent, with `2026-001` spent out of the series. */
const issued = (id: string) => {
  engine.numbers.set(THIS_YEAR, 2)

  return engine.seed({
    id,
    status: 'ISSUED',
    number: `${THIS_YEAR}-001`,
    numberYear: THIS_YEAR,
    totalCents: 50_000,
    netCents: 50_000,
    lines: [
      {
        id: 'l1',
        position: 1,
        description: 'Website',
        detail: '',
        quantity: 1,
        unit_cents: 50_000,
        tax_rate: 0,
      },
    ],
  })
}

const creditNote = {
  kind: 'CREDIT_NOTE' as const,
  reason: 'Zu viel berechnet',
  lines: [{ description: 'Gutschrift', detail: '', quantity: 1, unitEuros: 20_000, taxRate: 0 }],
}

const cancellation = { kind: 'CANCELLATION' as const, reason: 'Falscher Kunde', lines: [] }

/**
 * Runs `act` twice, with the second starting while the first is parked holding
 * the original. That is the window in which a guard read from an unlocked row
 * is already stale by the time it is acted on.
 */
const twiceAtOnce = async <T,>(act: () => Promise<T>): Promise<PromiseSettledResult<T>[]> => {
  const gate = engine.holdAtLock('invoice:inv-1')

  const first = act()
  let settled = false
  let second!: Promise<T>

  try {
    await gate.reached
    second = act()
    second.finally(() => (settled = true)).catch(() => {})
    await engine.untilBlockedOr(() => settled)
  } finally {
    gate.release()
  }

  return deadline(Promise.allSettled([first, second]), 'both corrections to finish')
}

describe('correcting one invoice twice at once', () => {
  it('cancels once, and says so the second time', async () => {
    issued('inv-1')

    const outcomes = await twiceAtOnce(() => correctInvoice('inv-1', cancellation))

    // The whole point of the guard: one original, one cancellation. Without a
    // lock on the original both requests read `correctedBy` as empty, both
    // pass, and the series carries two `Storno` documents for one act.
    const written = [...engine.invoices.values()].filter((row) => row.kind === 'CANCELLATION')

    expect(written).toHaveLength(1)
    expect(written[0]!.number).toBe('2026-002')
    expect(engine.numbers.get(THIS_YEAR)).toBe(3)
    expect(engine.invoices.get('inv-1')?.status).toBe('CANCELLED')

    const refused = outcomes.find((outcome) => outcome.status === 'rejected')

    expect(refused).toBeDefined()
    expect(String((refused as PromiseRejectedResult).reason)).toContain('already been cancelled')
  })

  it('serialises two credit notes, so each sees the other and takes its own number', async () => {
    issued('inv-1')

    const outcomes = await twiceAtOnce(() => correctInvoice('inv-1', creditNote))

    // Two partial credit notes against one invoice are a legitimate act — 200
    // back now, 100 back later — so unlike a cancellation neither is refused.
    // What must hold is that they are written one after the other, each with
    // its own number and the second aware of the first.
    const written = [...engine.invoices.values()].filter((row) => row.kind === 'CREDIT_NOTE')

    expect(outcomes.every((outcome) => outcome.status === 'fulfilled')).toBe(true)
    expect(written.map((row) => row.number).sort()).toEqual(['2026-002', '2026-003'])
    expect(engine.numbers.get(THIS_YEAR)).toBe(4)
  })

  it('leaves nothing behind when the act cannot be finished', async () => {
    issued('inv-1')

    // The connection dies after the correction and its lines are written but
    // before the number lands. Outside a transaction that left a numberless
    // draft behind for ever; the `already been cancelled` guard matched it,
    // and the invoice could then never be cancelled at all.
    engine.breakOn(/INSERT INTO invoice_numbers/i)

    await expect(correctInvoice('inv-1', cancellation)).rejects.toThrow()

    expect([...engine.invoices.values()].filter((row) => row.correctsId === 'inv-1')).toHaveLength(0)
    expect(engine.invoices.get('inv-1')?.status).toBe('ISSUED')
    expect(engine.numbers.get(THIS_YEAR)).toBe(2)

    // And a second attempt, once the database is well again, still works.
    await correctInvoice('inv-1', cancellation)

    expect(engine.invoices.get('inv-1')?.status).toBe('CANCELLED')
  })
})

/* -------------------------------------------------------------------------- */
/* The primitive underneath both                                              */
/* -------------------------------------------------------------------------- */

describe('a transaction inside a transaction', () => {
  it('joins the one already open rather than taking a second connection', async () => {
    engine.seed({ id: 'inv-1' })

    const outcome = await withTransaction(async (outer) => {
      await outer.query('SELECT id FROM invoices WHERE id = $1 FOR UPDATE;', ['inv-1'])

      // A second connection would block here for ever on the row the outer
      // transaction is holding, and would not see its uncommitted writes.
      return deadline(
        withTransaction(async (inner) => {
          expect(inner).toBe(outer)

          return allocateAndIssue('inv-1', true)
        }),
        'the nested transaction',
      )
    })

    expect(outcome).toBe('2026-001')
    expect(engine.invoices.get('inv-1')?.status).toBe('ISSUED')
  })

  it('rolls the whole act back when the nested part throws', async () => {
    engine.seed({ id: 'inv-1' })

    await expect(
      withTransaction(async () => {
        await allocateAndIssue('inv-1', true)

        await withTransaction(async () => {
          throw new Error('the side effect refused')
        })
      }),
    ).rejects.toThrow('the side effect refused')

    // Nothing committed: not the number, not the status.
    expect(engine.numbers.get(THIS_YEAR)).toBeUndefined()
    expect(engine.invoices.get('inv-1')?.status).toBe('DRAFT')
  })
})

/* -------------------------------------------------------------------------- */
/* Editing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The other way a numbered document can end up holding a figure nobody agreed
 * to. Issuing was made safe first, and editing was left loose: `updateInvoice`
 * checked the status, updated the header under `AND status = 'DRAFT'`, then
 * called `writeLines`, which carried no status predicate at all. Issue the
 * invoice in the gap and the header update correctly matched nothing while
 * `writeLines` deleted the lines of a numbered invoice and wrote a fresh
 * `total_cents` over it — on a document already sent to the client.
 */
const edit = (overrides: Partial<InvoiceWriteInput> = {}): InvoiceWriteInput =>
  ({
    clientId: 'client-1',
    dealId: null,
    moneyKind: 'BUILD',
    language: 'de',
    serviceFrom: null,
    serviceTo: null,
    note: '',
    dueDays: 14,
    lines: [{ description: 'Rewritten', detail: '', quantity: 1, unitEuros: 10, taxRate: 0 }],
    ...overrides,
  }) as InvoiceWriteInput

describe('editing a draft while it is being issued', () => {
  it('refuses the edit once the number has been handed out, and rewrites nothing', async () => {
    engine.seed({
      id: 'inv-1',
      totalCents: 99_000,
      netCents: 99_000,
      lines: [
        {
          id: 'l1',
          position: 1,
          description: 'Agreed work',
          detail: '',
          quantity: 1,
          unit_cents: 99_000,
          tax_rate: 0,
        },
      ],
    })

    expect(await allocateAndIssue('inv-1', true)).toBe('2026-001')

    await expect(updateInvoice('inv-1', edit())).rejects.toThrow(/credit note/)

    const after = engine.invoices.get('inv-1')!

    expect(after.totalCents).toBe(99_000)
    expect(after.lines.map((line) => line.description)).toEqual(['Agreed work'])
  })

  /**
   * The sequential case above passes even without a transaction, because by
   * then the status has settled. This one is the actual race: the edit must
   * still be holding its lock when the issue arrives, so the two cannot
   * interleave between the status check and `writeLines`.
   */
  it('holds the row against a concurrent issue rather than interleaving with it', async () => {
    engine.seed({
      id: 'inv-1',
      totalCents: 99_000,
      netCents: 99_000,
      lines: [
        {
          id: 'l1',
          position: 1,
          description: 'Agreed work',
          detail: '',
          quantity: 1,
          unit_cents: 99_000,
          tax_rate: 0,
        },
      ],
    })

    const gate = engine.holdAtLock('')

    const editing = updateInvoice('inv-1', edit())
    let issued = false
    let issuing!: Promise<string | null>

    try {
      await gate.reached
      issuing = allocateAndIssue('inv-1', true)
      issuing.finally(() => (issued = true)).catch(() => {})

      // A lock that is merely taken and dropped would let this settle.
      await engine.untilBlockedOr(() => issued)
      expect(issued).toBe(false)
    } finally {
      gate.release()
    }

    await deadline(editing, 'the edit to finish')
    expect(await deadline(issuing, 'the issue to finish')).toBe('2026-001')

    // The edit won the row first, so the client is billed for what it wrote —
    // once, and before any number existed.
    const after = engine.invoices.get('inv-1')!

    expect(after.number).toBe('2026-001')
    expect(after.lines.map((line) => line.description)).toEqual(['Rewritten'])
    expect(engine.numbers.get(THIS_YEAR)).toBe(2)
  })
})
