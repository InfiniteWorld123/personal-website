import type { Seat } from './ticket'

/**
 * A room: two chairs, and a slot to pass notes between them.
 *
 * The video never comes through here. Two browsers cannot introduce
 * themselves to each other — neither knows the other's address, and a home
 * router will not accept a stranger — so each describes itself in a few
 * kilobytes of text and they need somewhere to swap those descriptions. This
 * is that somewhere, and nothing else. Once the swap succeeds the picture and
 * sound go directly between them and this object sits idle.
 *
 * It is a Durable Object because both browsers must reach the *same* instance.
 * A plain Worker would put them on two machines that have never heard of each
 * other.
 *
 * It stores nothing. It cannot read the notes it passes — the descriptions and
 * the network candidates are opaque strings to it, relayed byte for byte. What
 * it does enforce is that there are at most two people, in known chairs, and
 * that neither can use the socket as a free message bus.
 */

/** Big enough for the largest session description, small enough to be a cap. */
const MAX_MESSAGE_BYTES = 64 * 1024

/** Candidates arrive in bursts, so the ceiling is generous and still a ceiling. */
const MAX_MESSAGES_PER_WINDOW = 400
const RATE_WINDOW_MS = 10_000

/** Sent when the same chair is taken twice — an old tab, or a reload. */
const CLOSE_REPLACED = 4001
const CLOSE_POLICY = 4002

type Env = Record<string, never>

type Counter = { count: number; startedAt: number }

export class CallRoom implements DurableObject {
  /**
   * Per-socket message counters. In memory, so they reset when the room
   * hibernates — which is exactly when nobody is there to abuse it.
   */
  readonly #counters = new WeakMap<WebSocket, Counter>()

  constructor(private readonly state: DurableObjectState, _env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const seat = url.searchParams.get('seat') as Seat | null
    const name = url.searchParams.get('name') ?? ''

    if (seat !== 'host' && seat !== 'guest') {
      return new Response('Unknown seat', { status: 400 })
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 })
    }

    // A reload must not lock someone out of their own call, so the new socket
    // wins and the old one is told why it is going.
    for (const existing of this.state.getWebSockets(seat)) {
      try {
        existing.close(CLOSE_REPLACED, 'This call was opened in another tab')
      } catch {
        // Already gone. Nothing to do and nothing worth logging.
      }
    }

    const { 0: client, 1: server } = new WebSocketPair()

    // Hibernation, not a held socket: an idle room costs nothing and survives
    // the eviction that a long call would otherwise hit.
    this.state.acceptWebSocket(server, [seat])
    server.serializeAttachment({ seat, name })

    const peer = this.#peerOf(seat)

    this.#send(server, {
      type: 'welcome',
      seat,
      // The two sides must not both offer at once. The host leads; the guest
      // answers. Stated by the room so neither client has to assume it.
      offers: seat === 'host',
      peer: peer ? { name: this.#nameOf(peer) } : null,
    })

    if (peer) {
      this.#send(peer, { type: 'peer-joined', name })
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') {
      ws.close(CLOSE_POLICY, 'Text only')

      return
    }
    if (message.length > MAX_MESSAGE_BYTES) {
      ws.close(CLOSE_POLICY, 'Message too large')

      return
    }
    if (!this.#withinRate(ws)) {
      ws.close(CLOSE_POLICY, 'Too many messages')

      return
    }

    const seat = this.#seatOf(ws)
    if (!seat) return

    const peer = this.#peerOf(seat)

    // Nobody on the other side yet. Dropped rather than queued: a description
    // held for later describes a connection attempt that has since been
    // abandoned, and replaying it only confuses the side that gets it.
    if (!peer) {
      this.#send(ws, { type: 'peer-absent' })

      return
    }

    // Relayed verbatim. The room does not parse what it carries.
    try {
      peer.send(message)
    } catch {
      this.#send(ws, { type: 'peer-absent' })
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    this.#announceDeparture(ws, code)
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.#announceDeparture(ws, CLOSE_POLICY)
  }

  /**
   * Tells the other chair that this one emptied — unless it emptied because
   * the same person opened the call somewhere else, in which case a new socket
   * has already taken the seat and saying "they left" would be a lie.
   */
  #announceDeparture(ws: WebSocket, code: number): void {
    if (code === CLOSE_REPLACED) return

    const seat = this.#seatOf(ws)
    if (!seat) return

    const peer = this.#peerOf(seat)
    if (peer) this.#send(peer, { type: 'peer-left' })
  }

  #withinRate(ws: WebSocket): boolean {
    const now = Date.now()
    const counter = this.#counters.get(ws)

    if (!counter || now - counter.startedAt > RATE_WINDOW_MS) {
      this.#counters.set(ws, { count: 1, startedAt: now })

      return true
    }

    counter.count += 1

    return counter.count <= MAX_MESSAGES_PER_WINDOW
  }

  #attachmentOf(ws: WebSocket): { seat: Seat; name: string } | null {
    const attachment = ws.deserializeAttachment() as { seat?: unknown; name?: unknown } | null

    if (!attachment || (attachment.seat !== 'host' && attachment.seat !== 'guest')) return null

    return {
      seat: attachment.seat,
      name: typeof attachment.name === 'string' ? attachment.name : '',
    }
  }

  #seatOf(ws: WebSocket): Seat | null {
    return this.#attachmentOf(ws)?.seat ?? null
  }

  #nameOf(ws: WebSocket): string {
    return this.#attachmentOf(ws)?.name ?? ''
  }

  #peerOf(seat: Seat): WebSocket | null {
    return this.state.getWebSockets(seat === 'host' ? 'guest' : 'host')[0] ?? null
  }

  #send(ws: WebSocket, payload: unknown): void {
    try {
      ws.send(JSON.stringify(payload))
    } catch {
      // The socket closed between the check and the write. The close handler
      // will do the rest.
    }
  }
}
