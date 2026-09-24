import { type ParsedAttachment, packFiles } from './files'

/**
 * What happens to one letter, apart from Cloudflare's globals.
 *
 * `index.ts` only hands the message over; everything that decides anything is
 * here, written against the few fields it reads, so `src/tests/inbound-
 * worker.test.ts` can run it under the site's own configuration with a fake
 * message and a fake network.
 *
 * The order is the whole design:
 *
 * 1. **The letter's bytes are read**, which is I/O, not work.
 * 2. **The copy goes to the owner's own mailbox**, before any parsing. That
 *    mailbox is the fallback that never depended on this Worker's code; if the
 *    parsing below runs out of time or memory on a huge letter, the copy has
 *    already left.
 * 3. **The letter is parsed and posted to the V2 Inbox**, signed, and retried
 *    a few times on a server error — the Inbox deduplicates by Message-ID, so
 *    a retry after a lost answer files it once.
 * 4. **The letter is refused only when nobody took it**: no copy was
 *    forwarded and the Inbox did not accept it. A letter that reached the
 *    owner's mailbox is never refused — refusing tells the sender it failed,
 *    and it did not.
 */

export type DeliveryEnv = {
  /** Every letter is also delivered here, exactly as before V2. */
  FORWARD_COPY_TO?: string
  /** e.g. https://yamanwarda.de/api/v2/inbound-email */
  INBOX_V2_ENDPOINT?: string
  /** Shared with Backend2 (`INBOX_INGRESS_SECRET` on the site). 32+ characters. */
  INBOX_INGRESS_SECRET?: string
}

/** The part of Cloudflare's `ForwardableEmailMessage` this file reads. */
export type IncomingMessage = {
  readonly from: string
  readonly to: string
  readonly headers: { get(name: string): string | null }
  readonly raw: ReadableStream<Uint8Array>
  forward(rcptTo: string): Promise<unknown>
  setReject(reason: string): void
}

/** The part of `postal-mime`'s result this file reads. */
export type ParsedMail = {
  from?: { name?: string; address?: string }
  subject?: string
  text?: string
  html?: string
  messageId?: string
  inReplyTo?: string
  references?: string
  attachments?: ParsedAttachment[]
}

type Post = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number }>

export type DeliveryDeps = {
  parse: (raw: ArrayBuffer) => Promise<ParsedMail>
  fetch?: Post
  sleep?: (milliseconds: number) => Promise<void>
  /** Milliseconds since the epoch, for the signed timestamp. */
  now?: () => number
}

export type DeliveryResult = {
  forwarded: 'forwarded' | 'failed' | 'off'
  /** The last HTTP status from the V2 Inbox; null when off or unreachable. */
  v2: { status: number | null; taken: boolean; attempts: number } | null
  rejected: boolean
}

/* ------------------------------------------------------------------ limits */

/**
 * Backend2's own ceilings (`src/backend2/contracts/inbox.contract.ts` and the
 * payload schema in `ingress.service.ts`). Kept below them rather than at
 * them: a letter the schema refuses is refused whole, attachments and all.
 */
export const V2_LIMITS = {
  /** `INGRESS_MAX_BODY_BYTES` is 30 MiB; this leaves room for rounding. */
  bodyBytes: 30 * 1024 * 1024 - 256 * 1024,
  text: 1_000_000,
  html: 1_000_000,
  subject: 2000,
  address: 500,
  messageId: 1000,
  inReplyTo: 4000,
  references: 20_000,
  files: 30,
  omittedFiles: 100,
} as const

/** Attempts at the V2 Inbox, and the pause before each after the first. */
const RETRY_DELAYS_MS = [1000, 4000]
const ATTEMPT_TIMEOUT_MS = 20_000

/* ----------------------------------------------------------------- helpers */

const toHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')

export const hmacHex = async (secret: string, value: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))
}

/**
 * The tail of a long threading header, cut at an id boundary.
 *
 * The newest ids are at the end of `References`, and they are the ones a
 * reply is matched on; a header cut through the middle of an id would name
 * an id that does not exist.
 */
export const tailOfIds = (value: string, limit: number): string => {
  const trimmed = value.trim()

  if (trimmed.length <= limit) return trimmed

  const tail = trimmed.slice(-limit)
  const start = tail.indexOf('<')

  return start === -1 ? '' : tail.slice(start)
}

const clamp = (value: string | null | undefined, limit: number): string => (value ?? '').slice(0, limit)

const configured = (value: string | undefined): value is string => Boolean(value?.trim())

/* ----------------------------------------------------------------- payload */

/**
 * The letter as the V2 Inbox reads it.
 *
 * Every field is clamped to what the receiving schema accepts, and the files
 * are packed into whatever the rest of the letter leaves of the body limit.
 * A file that does not fit is named in `omittedFiles`, so the Inbox can say
 * it is missing rather than pretend there was none.
 */
export const buildPayload = (
  message: IncomingMessage,
  parsed: ParsedMail | null,
): { body: string; files: number; omitted: number } => {
  const header = (name: string): string => message.headers.get(name) ?? ''
  const messageId = header('message-id') || parsed?.messageId || ''

  const letter = {
    // The envelope recipient carries the reply token; the parsed headers do
    // not always, because a client may have written a different To.
    to: [clamp(message.to, V2_LIMITS.address)],
    // The header sender, not the envelope: a newsletter or a booking tool
    // sends from a bounce address, and an answer to that goes nowhere.
    from: clamp(parsed?.from?.address || message.from, V2_LIMITS.address),
    fromName: clamp(parsed?.from?.name, V2_LIMITS.address),
    subject: clamp(parsed?.subject ?? header('subject'), V2_LIMITS.subject),
    text: clamp(parsed?.text, V2_LIMITS.text),
    html: clamp(parsed?.html, V2_LIMITS.html),
    // A cut Message-ID is a wrong one. Without it the Inbox deduplicates by content.
    messageId: messageId.length <= V2_LIMITS.messageId ? messageId : '',
    inReplyTo: tailOfIds(header('in-reply-to') || parsed?.inReplyTo || '', V2_LIMITS.inReplyTo),
    references: tailOfIds(header('references') || parsed?.references || '', V2_LIMITS.references),
  }

  const withoutFiles = JSON.stringify({ ...letter, files: [], omittedFiles: [] })
  // Room for up to a hundred omitted-file notes, kept out of the file budget.
  const reserve = 64 * 1024
  const budget = V2_LIMITS.bodyBytes - new TextEncoder().encode(withoutFiles).byteLength - reserve
  const { files, omitted } = packFiles(parsed?.attachments ?? [], {
    maxEncodedBytes: Math.max(0, budget),
    maxFiles: V2_LIMITS.files,
  })

  const omittedFiles = omitted.slice(0, V2_LIMITS.omittedFiles)

  return {
    body: JSON.stringify({ ...letter, files, omittedFiles }),
    files: files.length,
    omitted: omittedFiles.length,
  }
}

/* ------------------------------------------------------------------ posting */

const retryable = (status: number): boolean => status >= 500 || status === 429 || status === 408

const postToV2 = async (
  env: DeliveryEnv,
  body: string,
  deps: Required<Omit<DeliveryDeps, 'parse'>>,
): Promise<NonNullable<DeliveryResult['v2']>> => {
  const endpoint = env.INBOX_V2_ENDPOINT!.trim()
  const secret = env.INBOX_INGRESS_SECRET!.trim()
  let status: number | null = null
  let attempts = 0

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await deps.sleep(RETRY_DELAYS_MS[attempt - 1]!)

    attempts += 1
    // A fresh timestamp each time: the site refuses one older than five minutes.
    const timestamp = String(Math.floor(deps.now() / 1000))

    try {
      const response = await deps.fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-inbox-timestamp': timestamp,
          'x-inbox-signature': await hmacHex(secret, `${timestamp}.${body}`),
        },
        body,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      })

      status = response.status

      if (response.ok) return { status, taken: true, attempts }
      // A 4xx is this letter's own fault — a signature the site did not
      // accept, a shape it refuses — and sending it again will not change it.
      if (!retryable(response.status)) break
    } catch {
      status = null
    }
  }

  return { status, taken: false, attempts }
}

/**
 * The copy to the owner's own mailbox.
 *
 * Failures are logged and swallowed: the decision to refuse is made once, at
 * the end, from everything that happened.
 */
const forwardCopy = async (message: IncomingMessage, env: DeliveryEnv): Promise<DeliveryResult['forwarded']> => {
  if (!configured(env.FORWARD_COPY_TO)) return 'off'

  try {
    await message.forward(env.FORWARD_COPY_TO.trim())

    return 'forwarded'
  } catch (error) {
    console.error('inbound: the copy could not be forwarded', {
      name: error instanceof Error ? error.name : 'UnknownError',
    })

    return 'failed'
  }
}

/* -------------------------------------------------------------------- main */

export const deliver = async (
  message: IncomingMessage,
  env: DeliveryEnv,
  deps: DeliveryDeps,
): Promise<DeliveryResult> => {
  const runtime = {
    fetch: deps.fetch ?? ((url, init) => fetch(url, init)),
    sleep: deps.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))),
    now: deps.now ?? (() => Date.now()),
  } satisfies Required<Omit<DeliveryDeps, 'parse'>>

  let raw: ArrayBuffer | null = null

  try {
    raw = await new Response(message.raw).arrayBuffer()
  } catch (error) {
    console.error('inbound: the letter could not be read', {
      name: error instanceof Error ? error.name : 'UnknownError',
    })
  }

  const forwarded = await forwardCopy(message, env)

  const v2On = configured(env.INBOX_V2_ENDPOINT) && configured(env.INBOX_INGRESS_SECRET)

  if (!v2On) console.error('inbound: the V2 Inbox is not configured on this Worker')

  let v2: DeliveryResult['v2'] = null
  let files = 0
  let omitted = 0

  if (v2On) {
    // Nothing below may throw out of the handler: the copy has been
    // forwarded, and an exception here would only turn a delivered letter
    // into a reported failure.
    try {
      let parsed: ParsedMail | null = null

      if (raw) {
        try {
          parsed = await deps.parse(raw)
        } catch (error) {
          // Still posted, from the headers alone: an entry that says a letter
          // came is better than none, and the full letter is in the copy.
          console.error('inbound: the letter could not be parsed', {
            name: error instanceof Error ? error.name : 'UnknownError',
          })
        }
      }

      raw = null

      const payload = buildPayload(message, parsed)
      const body = payload.body

      parsed = null
      files = payload.files
      omitted = payload.omitted
      v2 = await postToV2(env, body, runtime)
    } catch (error) {
      console.error('inbound: the letter could not be posted', {
        name: error instanceof Error ? error.name : 'UnknownError',
      })
    }
  }

  const taken = Boolean(v2?.taken)
  const rejected = forwarded !== 'forwarded' && !taken

  if (rejected) {
    // Refusing tells the sender it did not arrive, so they can send it again.
    message.setReject('The mailbox is temporarily unavailable. Please try again later.')
  }

  // Counts and statuses only: never an address, a subject or a body.
  const log = rejected || (v2On && !v2?.taken) ? console.error : console.info

  log('inbound: delivered', {
    forwarded,
    v2Status: v2?.status ?? null,
    v2Attempts: v2?.attempts ?? 0,
    files,
    omitted,
    rejected,
  })

  return { forwarded, v2, rejected }
}
