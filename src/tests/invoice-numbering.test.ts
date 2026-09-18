import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The gapless series, under two clicks on `Issue`.
 *
 * `§14 UStG` wants a continuous sequence, and the one thing it cannot survive
 * is a number that belongs to no document. Before the lock, two overlapping
 * requests on a single draft both reached the allocation: under `READ
 * COMMITTED` each saw the row as a draft, each took a number, and the second
 * `UPDATE` wrote its number over the first's — leaving the first orphaned for
 * ever, and the frozen PDF in the bucket printing a number the row no longer
 * held.
 *
 * Proving that needs a database that actually blocks, so the fake below is a
 * small Postgres rather than a recorder: statement snapshots, row locks taken
 * by `FOR UPDATE` and by `ON CONFLICT ... DO UPDATE`, predicates re-checked
 * against the latest version once a lock is finally granted. It is told
 * nothing about which statement is the right one; it only follows those rules,
 * and the rules are what fail the old code.
 */

/* -------------------------------------------------------------------------- */
/* A database small enough to read, faithful enough to block                   */
/* -------------------------------------------------------------------------- */

const holder = vi.hoisted(() => ({ engine: null as unknown as Engine }))

vi.mock('#/shared/env', () => ({ env: { DATABASE_URL: 'postgres://localhost/test' } }))

vi.mock('pg', () => ({
  Pool: class {
    query = (text: string, values?: unknown[]) => holder.engine.autocommit(text, values ?? [])
    connect = async () => holder.engine.connect()
    end = async () => {}
  },
}))

const THIS_YEAR = 2026

type InvoiceRow = { id: string; status: string; number: string | null; numberYear: number | null }

type Txn = {
  id: number
  held: Set<string>
  invoices: Map<string, InvoiceRow>
  numbers: Map<number, number>
}

type Result = { rows: Record<string, unknown>[]; rowCount: number }

class Engine {
  /** Committed state. */
  readonly invoices = new Map<string, InvoiceRow>()
  readonly numbers = new Map<number, number>()

  private readonly owner = new Map<string, number>()
  private readonly waiters = new Map<string, Array<() => void>>()
  private lastTxn = 0
  private hook: (() => Promise<void>) | null = null

  /** How many statements are blocked on a lock right now. */
  waiting = 0

  seedDraft(id: string): void {
    this.invoices.set(id, { id, status: 'DRAFT', number: null, numberYear: null })
  }

  /**
   * Freezes whichever transaction takes a row lock first, and hands back the
   * means to let it go again. That is how two requests are made to genuinely
   * overlap, rather than to merely start at the same time and finish in order.
   */
  holdAtFirstLock(): { reached: Promise<void>; release: () => void } {
    let reached!: () => void
    let released!: () => void
    const arrival = new Promise<void>((resolve) => (reached = resolve))
    const departure = new Promise<void>((resolve) => (released = resolve))

    this.hook = async () => {
      this.hook = null
      reached()
      await departure
    }

    return { reached: arrival, release: released }
  }

  /** Waits until some statement is actually blocked, rather than guessing. */
  async untilSomethingWaits(): Promise<void> {
    for (let turn = 0; turn < 10_000; turn += 1) {
      if (this.waiting > 0) return
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    throw new Error('nothing ever blocked: the second request never reached a lock')
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

    if (this.hook) await this.hook()
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

  private readInvoice(txn: Txn, id: string): InvoiceRow | undefined {
    return txn.invoices.get(id) ?? this.invoices.get(id)
  }

  private readNext(txn: Txn, year: number): number {
    return txn.numbers.get(year) ?? this.numbers.get(year) ?? 1
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

  /* ---- statements ------------------------------------------------------- */

  private async run(txn: Txn, text: string, values: unknown[]): Promise<Result> {
    const sql = text.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim()
    const id = values[0] as string

    if (/^SELECT .*\bFROM invoices\b.*\bFOR UPDATE\b/i.test(sql)) {
      // A locking read waits for whoever holds the row, then re-checks its
      // predicate against the version that transaction left behind.
      await this.acquire(txn, `invoice:${id}`)

      const row = this.readInvoice(txn, id)
      const matches = row && (!/status = 'DRAFT'/i.test(sql) || row.status === 'DRAFT')

      return matches ? { rows: [{ id: row!.id }], rowCount: 1 } : { rows: [], rowCount: 0 }
    }

    if (/INSERT INTO invoice_numbers/i.test(sql) && /UPDATE invoices/i.test(sql)) {
      // The `target` CTE reads this statement's snapshot, taken before
      // anything below has a chance to block.
      const target = this.readInvoice(txn, id)
      const selects = target && (!/status = 'DRAFT'/i.test(sql) || target.status === 'DRAFT')

      if (!selects) return { rows: [], rowCount: 0 }

      // `ON CONFLICT ... DO UPDATE` takes the conflicting row's lock, waits
      // for any transaction already holding it, and then re-reads the value.
      await this.acquire(txn, `numbers:${THIS_YEAR}`)

      const seq = this.readNext(txn, THIS_YEAR)
      txn.numbers.set(THIS_YEAR, seq + 1)

      // The outer UPDATE re-reads the latest version and re-checks its own
      // WHERE against it — and `i.id = $1` is true whatever the status says.
      const latest = this.readInvoice(txn, id)

      if (!latest) return { rows: [], rowCount: 0 }

      const number = `${THIS_YEAR}-${String(seq).padStart(3, '0')}`

      txn.invoices.set(id, { ...latest, status: 'ISSUED', number, numberYear: THIS_YEAR })

      return { rows: [{ number }], rowCount: 1 }
    }

    throw new Error(`the fake database was asked something it does not model: ${sql}`)
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

import { closePool } from '#/backend/db/client'
import { allocateAndIssue } from '#/backend/modules/invoices/invoice.service'

let engine: Engine

beforeEach(() => {
  engine = new Engine()
  holder.engine = engine
})

afterEach(async () => {
  await closePool()
})

/* -------------------------------------------------------------------------- */
/* The rule                                                                   */
/* -------------------------------------------------------------------------- */

describe('issuing one draft twice at once', () => {
  it('hands out one number, not two, and leaves no hole behind', async () => {
    engine.seedDraft('inv-1')

    const gate = engine.holdAtFirstLock()

    const first = allocateAndIssue('inv-1', true)
    await gate.reached

    // Started while the first is still in flight and still uncommitted: the
    // moment where both requests used to see a draft.
    const second = allocateAndIssue('inv-1', true)
    await engine.untilSomethingWaits()

    gate.release()

    const results = await Promise.all([first, second])

    expect(results.filter((number) => number !== null)).toEqual(['2026-001'])
    expect(results.filter((number) => number === null)).toHaveLength(1)

    // The series moved by exactly one. Two would mean 2026-001 belongs to no
    // document, which is the gap the whole scheme exists to prevent.
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
    engine.seedDraft('inv-1')

    expect(await allocateAndIssue('inv-1', true)).toBe('2026-001')
    expect(await allocateAndIssue('inv-1', true)).toBeNull()

    expect(engine.numbers.get(THIS_YEAR)).toBe(2)
    expect(engine.invoices.get('inv-1')?.number).toBe('2026-001')
  })

  it('keeps the series continuous across different invoices', async () => {
    engine.seedDraft('inv-1')
    engine.seedDraft('inv-2')
    engine.seedDraft('inv-3')

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
