import { readTicket } from './ticket'

export { CallRoom } from './room'

/**
 * The doorman.
 *
 * One job: read the ticket, and if it is genuine, open the door to the room it
 * names. It reaches no database, keeps no list of rooms, and remembers nothing
 * between requests — every question about who may enter was already settled by
 * the site when it signed the ticket.
 *
 * Kept apart from the site's Worker because Nitro writes that one from a
 * template at build time, and a Durable Object class has to be exported from a
 * file a person controls. `workers/inbound-email` lives beside this one for a
 * version of the same reason.
 */

type Env = {
  /** Shared with the site. The ticket is worthless if these differ. */
  CALL_ROOM_SECRET: string
  ROOMS: DurableObjectNamespace
}

const text = (body: string, status: number): Response =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/' || url.pathname === '/health') {
      return text(env.CALL_ROOM_SECRET ? 'ready' : 'CALL_ROOM_SECRET is not set', 200)
    }

    if (url.pathname !== '/room') return text('Not found', 404)

    if (!env.CALL_ROOM_SECRET) {
      // Refusing loudly. A doorman with no way to check tickets must not fall
      // back to letting everyone in.
      console.error('call-room: CALL_ROOM_SECRET is not set')

      return text('This call service is not configured', 503)
    }

    const ticket = url.searchParams.get('ticket')
    if (!ticket) return text('No ticket', 401)

    const payload = await readTicket(ticket, env.CALL_ROOM_SECRET)

    // One message for forged, altered, malformed and expired alike: telling a
    // caller which of those it was is telling them how to get closer.
    if (!payload) return text('That ticket is not valid any more', 401)

    const room = env.ROOMS.get(env.ROOMS.idFromName(payload.r))

    // The seat and the name travel on to the room as query parameters rather
    // than being re-derived there: the room trusts this Worker, and only this
    // Worker, because nothing else holds its namespace binding.
    const forward = new URL(request.url)
    forward.search = ''
    forward.searchParams.set('seat', payload.s)
    forward.searchParams.set('name', payload.n)

    return room.fetch(new Request(forward, request))
  },
}
