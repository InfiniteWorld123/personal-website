import { describe, expect, it, vi } from 'vitest'

vi.mock('#/shared/env', () => ({
  env: {
    APP_NAME: 'Yaman Warda',
    CALL_ROOM_SECRET: 'a-local-secret-for-the-test',
    CALL_ROOM_URL: 'ws://127.0.0.1:8787',
  },
}))

import { isCallConfigured, roomIdForBooking, signCallTicket } from '#/backend/modules/calls/call.ticket'
import { readTicket } from '../../workers/call-room/src/ticket'
import { isCallOpen } from '#/shared/types/call.types'

/**
 * The one seam that spans two deployed programs.
 *
 * The site signs the ticket and the room Worker verifies it, from two copies
 * of the same format in two directories that are built and shipped
 * separately. Nothing but this test notices when one copy drifts — and when it
 * drifts, every call fails at once, with a 401 that says nothing about why.
 *
 * So the test imports both sides and makes them agree.
 */

const SECRET = 'a-local-secret-for-the-test'

describe('the call ticket', () => {
  it('is readable by the Worker that has to read it', async () => {
    const room = await roomIdForBooking('BK-ABC123')
    const ticket = await signCallTicket({ room, seat: 'guest', name: 'Katrin Vogel' })

    expect(await readTicket(ticket, SECRET)).toEqual({
      r: room,
      s: 'guest',
      n: 'Katrin Vogel',
      e: expect.any(Number),
    })
  })

  it('names the same room for both chairs, and a different one per booking', async () => {
    const one = await roomIdForBooking('BK-ABC123')
    const again = await roomIdForBooking('BK-ABC123')
    const other = await roomIdForBooking('BK-ZZZ999')

    expect(one).toBe(again)
    expect(one).not.toBe(other)
  })

  it('does not put the booking reference in the room name', async () => {
    // The reference is printed in an email and quoted in replies. The room is
    // not derived from anything a stranger can read off one.
    expect(await roomIdForBooking('BK-ABC123')).not.toContain('ABC123')
  })

  it('is refused once altered', async () => {
    const ticket = await signCallTicket({
      room: await roomIdForBooking('BK-ABC123'),
      seat: 'guest',
      name: 'Katrin Vogel',
    })

    const [body, signature] = ticket.split('.')

    // A guest promoting themselves to host by rewriting the payload.
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), s: 'host' }),
    ).toString('base64url')

    expect(await readTicket(`${forged}.${signature}`, SECRET)).toBeNull()
    expect(await readTicket(`${body}.${'0'.repeat(64)}`, SECRET)).toBeNull()
    expect(await readTicket(ticket, 'a-different-secret')).toBeNull()
  })

  it('is refused once it is stale', async () => {
    const ticket = await signCallTicket({
      room: await roomIdForBooking('BK-ABC123'),
      seat: 'host',
      name: 'Yaman Warda',
    })

    expect(await readTicket(ticket, SECRET)).not.toBeNull()

    // Two minutes and a second later. A link copied out of an address bar
    // has to stop working, or it is a key rather than a ticket.
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 121_000)
    expect(await readTicket(ticket, SECRET)).toBeNull()
    vi.useRealTimers()
  })

  it('knows when the feature is switched off', () => {
    expect(isCallConfigured()).toBe(true)
  })
})

/**
 * The one rule that decides whether a room exists.
 *
 * Three buttons ask it in the browser — the bookings list, the booking itself,
 * and the visitor's own page — and the service asks it again before it signs
 * anything. They have to agree: a button the browser offers and the server
 * refuses is worse than no button, because it fails in front of a client.
 */
describe('when a room exists', () => {
  const at = (minutesFromNow: number) => new Date(Date.now() + minutesFromNow * 60_000).toISOString()

  const booking = (over: Partial<Parameters<typeof isCallOpen>[0]> = {}) => ({
    startsAt: at(0),
    endsAt: at(30),
    status: 'CONFIRMED',
    locationKind: 'VIDEO',
    ...over,
  })

  it('is open during the call', () => {
    expect(isCallOpen(booking())).toBe(true)
  })

  it('opens a quarter of an hour early, and not a minute before', () => {
    expect(isCallOpen(booking({ startsAt: at(14), endsAt: at(44) }))).toBe(true)
    expect(isCallOpen(booking({ startsAt: at(16), endsAt: at(46) }))).toBe(false)
  })

  it('stays open for an hour after the end, for a call that ran long', () => {
    expect(isCallOpen(booking({ startsAt: at(-90), endsAt: at(-59) }))).toBe(true)
    expect(isCallOpen(booking({ startsAt: at(-95), endsAt: at(-61) }))).toBe(false)
  })

  it('is closed for anything that is not a confirmed video call', () => {
    expect(isCallOpen(booking({ status: 'CANCELLED' }))).toBe(false)
    expect(isCallOpen(booking({ status: 'COMPLETED' }))).toBe(false)
    expect(isCallOpen(booking({ locationKind: 'PHONE' }))).toBe(false)
    expect(isCallOpen(booking({ locationKind: 'IN_PERSON' }))).toBe(false)
  })
})
