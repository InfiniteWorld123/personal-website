import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import * as v from 'valibot'
import {
  INGRESS_HEADERS,
  INGRESS_MAX_BODY_BYTES,
  INGRESS_MAX_HTML_CHARACTERS,
  INGRESS_TOLERANCE_SECONDS,
  type InboundPayload,
  ingressSigningInput,
} from '../../contracts/inbox.contract'
import { withTransaction } from '../../db/client'
import { readLimited } from '../../http/body'
import { badRequest, ingressDisabled, invalidSignature } from '../../http/error'
import { resolveMediaStore } from '../../media/store'
import * as mediaRepo from '../media/media.repo'
import { previewOf } from './email-render'
import { classifyIncomingFile, storeIncomingBytes } from './inbox.files'
import * as repo from './inbox.repo'
import { inboxFromAddress, inboxReplyAddress } from './inbox.transport'
import { newReplyToken, parseMessageIds } from './send.service'

/**
 * Mail arriving. The one Inbox route a machine calls, never a person.
 *
 * Trust comes from one place: an HMAC over the exact bytes received plus a
 * timestamp, with a secret shared only by the Cloudflare inbound Worker and
 * this server (`INBOX_INGRESS_SECRET`). Nothing in the body is believed until
 * that holds — not the sender, not the recipient, not the files.
 *
 * Replays are closed twice: the timestamp must be within five minutes, and
 * within those five minutes the same letter is recognised by its Message-ID
 * (or, without one, by a hash of its content) and written once.
 */

type Env = Record<string, string | undefined>

export const readIngressSecret = (environment: Env = process.env): string | null => {
  const secret = environment.INBOX_INGRESS_SECRET?.trim()

  // A short secret is a guessable one; refuse to run on it rather than warn.
  return secret && secret.length >= 32 ? secret : null
}

const hmacHex = async (secret: string, value: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))

  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Constant time, so a wrong signature cannot be found a byte at a time. */
const sameHex = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false

  let difference = 0

  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index)

  return difference === 0
}

/** What the Worker does, for tests and for the Worker's own adoption at cutover. */
export const signIngress = async (input: {
  secret: string
  body: string
  timestamp?: number
}): Promise<{ signature: string; timestamp: string }> => {
  const timestamp = String(input.timestamp ?? Math.floor(Date.now() / 1000))

  return { timestamp, signature: await hmacHex(input.secret, ingressSigningInput(timestamp, input.body)) }
}

const PayloadSchema = v.object({
  to: v.pipe(v.array(v.pipe(v.string(), v.maxLength(500))), v.maxLength(50)),
  from: v.pipe(v.string(), v.maxLength(500)),
  fromName: v.optional(v.pipe(v.string(), v.maxLength(500)), ''),
  subject: v.optional(v.pipe(v.string(), v.maxLength(2000)), ''),
  text: v.optional(v.pipe(v.string(), v.maxLength(2_000_000)), ''),
  html: v.optional(v.string(), ''),
  messageId: v.optional(v.pipe(v.string(), v.maxLength(1000)), ''),
  inReplyTo: v.optional(v.pipe(v.string(), v.maxLength(4000)), ''),
  references: v.optional(v.pipe(v.string(), v.maxLength(20_000)), ''),
  files: v.optional(
    v.pipe(
      v.array(
        v.object({
          filename: v.pipe(v.string(), v.maxLength(1000)),
          contentType: v.optional(v.pipe(v.string(), v.maxLength(300)), 'application/octet-stream'),
          content: v.string(),
        }),
      ),
      v.maxLength(30),
    ),
    [],
  ),
})

/** Reads, verifies and parses one delivery. Throws before believing anything. */
export const verifyIngress = async (request: Request, environment: Env = process.env): Promise<InboundPayload> => {
  const secret = readIngressSecret(environment)

  if (!secret) throw ingressDisabled()

  const timestamp = request.headers.get(INGRESS_HEADERS.timestamp)?.trim() ?? ''
  const provided = request.headers.get(INGRESS_HEADERS.signature)?.trim().toLowerCase() ?? ''

  if (!/^\d{9,11}$/u.test(timestamp)) throw invalidSignature()

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp))

  // The same answer as a wrong signature: a stale delivery is a replay.
  if (age > INGRESS_TOLERANCE_SECONDS) throw invalidSignature()

  const raw = new TextDecoder().decode(await readLimited(request, INGRESS_MAX_BODY_BYTES))
  const expected = await hmacHex(secret, ingressSigningInput(timestamp, raw))

  if (!sameHex(provided, expected)) throw invalidSignature()

  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    throw badRequest('That delivery is not JSON')
  }

  const result = v.safeParse(PayloadSchema, parsed)

  if (!result.success) throw badRequest('That delivery does not have the expected shape')

  return result.output
}

/* ---------------------------------------------------------------- matching */

/** `Name <a@b>` or `a@b` → the address, lower-cased; null when there is none. */
export const addressOf = (value: string): string | null => {
  const inside = value.match(/<([^<>\s]+@[^<>\s]+)>/u)?.[1] ?? value.trim()
  const address = inside.toLowerCase()

  return /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/u.test(address) ? address : null
}

/** `reply+<token>@domain` in any recipient → `<token>`. */
export const replyTokenFrom = (recipients: string[], replyAddress: string = inboxReplyAddress()): string | null => {
  const [local = '', domain = ''] = replyAddress.toLowerCase().split('@')
  const prefix = `${local.split('+')[0]}+`

  for (const recipient of recipients) {
    const address = addressOf(recipient)

    if (!address || !address.endsWith(`@${domain}`) || !address.startsWith(prefix)) continue

    const token = address.slice(prefix.length, address.indexOf('@'))

    if (/^[0-9a-f]{32}$/u.test(token)) return token
  }

  return null
}

const normaliseMessageId = (value: string): string | null => {
  const [id] = parseMessageIds(value)

  if (id) return id

  const trimmed = value.trim()

  return trimmed ? `<${trimmed.replace(/^<|>$/gu, '')}>` : null
}

export type IngressOutcome =
  | { outcome: 'recorded'; conversationId: string; messageId: string; newConversation: boolean }
  | { outcome: 'duplicate' }

/**
 * Files one verified letter.
 *
 * Matching, in order of trust: the reply token in the address we gave out;
 * then a Message-ID we hold, named in In-Reply-To or References. Neither the
 * sender's address nor the subject is ever enough — a letter that matches
 * nothing starts a new conversation rather than joining the wrong one.
 */
export const recordInbound = async (payload: InboundPayload): Promise<IngressOutcome> => {
  const messageIdHeader = payload.messageId ? normaliseMessageId(payload.messageId) : null
  const fromAddress = addressOf(payload.from) ?? (payload.from.trim().slice(0, 254) || 'unknown-sender')
  const toAddress = payload.to.map(addressOf).find(Boolean) ?? inboxFromAddress()
  const text = (payload.text ?? '').slice(0, 1_000_000)
  const html = (payload.html ?? '').slice(0, INGRESS_MAX_HTML_CHARACTERS)
  const subject = (payload.subject ?? '').replace(/[\r\n]+/gu, ' ').trim().slice(0, 1000)

  const dedupeKey = messageIdHeader
    ? `mid:${messageIdHeader}`
    : `sha:${bytesToHex(sha256(new TextEncoder().encode([fromAddress, toAddress, subject, text, html].join('\u0000'))))}`

  if (await repo.dedupeKeyExists(dedupeKey)) return { outcome: 'duplicate' }

  // A letter carrying one of our own sent Message-IDs is our own mail coming
  // back — an address that forwards to info@, say. Filing it would loop.
  if (messageIdHeader && (await repo.outgoingMessageIdExists(messageIdHeader))) {
    return { outcome: 'duplicate' }
  }

  /*
   * The files first, outside the transaction: bytes are slow and a database
   * transaction should not wait on them. Each key is written to the pending
   * ledger before its bytes, so if anything after this fails, the sweep can
   * collect what was stored.
   */
  const classified = (payload.files ?? []).map(classifyIncomingFile)
  const store = classified.some((file) => file.status === 'accept') ? await resolveMediaStore() : undefined
  const prepared: Array<Omit<Parameters<typeof repo.insertAttachment>[0], 'messageId'>> = []
  const storedKeys: string[] = []

  for (const [position, file] of classified.entries()) {
    if (file.status !== 'accept') {
      prepared.push({
        position,
        fileName: file.fileName,
        declaredType: file.declaredType,
        detectedType: null,
        byteSize: file.byteSize,
        checksum: null,
        storageKey: null,
        status: file.status,
        failureReason: file.reason,
      })
      continue
    }

    let storageKey: string | null = null

    if (store) {
      try {
        storageKey = await storeIncomingBytes({ store, bytes: file.bytes })
        storedKeys.push(storageKey)
      } catch {
        storageKey = null
      }
    }

    prepared.push({
      position,
      fileName: file.fileName,
      declaredType: file.declaredType,
      detectedType: file.detectedType,
      byteSize: file.byteSize,
      checksum: file.checksum,
      storageKey,
      status: storageKey ? 'stored' : 'failed',
      failureReason: storageKey ? null : 'The file could not be stored. Ask the sender to send it again.',
    })
  }

  try {
    return await withTransaction(async () => {
      const token = replyTokenFrom(payload.to)
      let conversation = token ? await repo.findConversationByToken(token) : null

      if (!conversation) {
        const ids = [
          ...parseMessageIds(payload.inReplyTo),
          ...parseMessageIds(payload.references).reverse(),
        ]

        conversation = await repo.findConversationByMessageIds(ids)
      }

      const now = new Date()
      const newConversation = !conversation

      conversation ??= await repo.insertConversation({
        subject,
        counterpartEmail: fromAddress,
        counterpartName: (payload.fromName ?? '').trim().slice(0, 200),
        origin: 'incoming',
        replyToken: newReplyToken(),
        isRead: false,
        occurredAt: now,
      })

      const messageId = await repo.insertMessage({
        conversationId: conversation.id,
        direction: 'incoming',
        fromEmail: fromAddress,
        fromName: (payload.fromName ?? '').trim().slice(0, 200),
        toEmail: toAddress,
        toName: '',
        subject,
        bodyText: text,
        bodyHtml: html || null,
        messageIdHeader,
        inReplyTo: payload.inReplyTo ? (parseMessageIds(payload.inReplyTo)[0] ?? null) : null,
        referencesHeader: parseMessageIds(payload.references).join(' ') || null,
        occurredAt: now,
        dedupeKey,
      })

      for (const attachment of prepared) await repo.insertAttachment({ ...attachment, messageId })

      await repo.recordMessageOnConversation({
        conversationId: conversation.id,
        direction: 'incoming',
        occurredAt: now,
        preview: previewOf(text || subject),
      })

      for (const key of storedKeys) await mediaRepo.clearPendingObject(key)

      return { outcome: 'recorded' as const, conversationId: conversation.id, messageId, newConversation }
    })
  } catch (error) {
    // The bytes are not going to be pointed at by anything. Take them back.
    for (const key of storedKeys) {
      await store?.remove(key).catch(() => {})
      await mediaRepo.clearPendingObject(key).catch(() => {})
    }

    // Two deliveries of the same letter racing: the second loses on the
    // unique key, and that is the right answer, not an error.
    if ((error as { code?: string })?.code === '23505' && (await repo.dedupeKeyExists(dedupeKey))) {
      return { outcome: 'duplicate' }
    }

    throw error
  }
}
