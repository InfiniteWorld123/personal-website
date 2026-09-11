import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('#/shared/env', () => ({ env: { DATABASE_URL: 'postgres://localhost/test' } }))
vi.mock('pg', () => ({
  Pool: class {
    end = vi.fn(async () => {})
  },
}))

import { closePool, getPool, withRequestScope } from '#/backend/db/client'

afterEach(async () => {
  await closePool()
  vi.unstubAllGlobals()
})

describe('Worker database request isolation', () => {
  it('keeps an overlapping request alive when the other request finishes', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' })
    let release!: () => void
    let started!: () => void
    const waiting = new Promise<void>(resolve => { release = resolve })
    const ready = new Promise<void>(resolve => { started = resolve })
    let firstPool: ReturnType<typeof getPool> | undefined
    const first = withRequestScope(async () => {
      firstPool = getPool()
      started()
      await waiting
      expect(getPool()).toBe(firstPool)
      expect(firstPool.end).not.toHaveBeenCalled()
    })
    await ready
    try {
      await withRequestScope(async () => {
        expect(getPool()).not.toBe(firstPool)
      })
      expect(firstPool!.end).not.toHaveBeenCalled()
    } finally {
      release()
      await first
    }
    expect(firstPool!.end).toHaveBeenCalledOnce()
  })

  it('closes a failed request pool', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' })
    let pool: ReturnType<typeof getPool> | undefined
    await expect(withRequestScope(async () => {
      pool = getPool()
      throw new Error('request failed')
    })).rejects.toThrow('request failed')
    expect(pool!.end).toHaveBeenCalledOnce()
  })

  it('retains the process pool on a normal server', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Node.js' })
    const pool = getPool()
    await withRequestScope(async () => { expect(getPool()).toBe(pool) })
    expect(pool.end).not.toHaveBeenCalled()
  })
})
