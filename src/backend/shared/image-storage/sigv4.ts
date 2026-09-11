/**
 * AWS Signature Version 4, the scheme R2's S3-compatible API speaks.
 *
 * Written against `fetch` and Web Crypto rather than an SDK because this has
 * to run unchanged on Node today and on Cloudflare Workers later. It is also
 * the whole of what we need: one signed PUT and one signed DELETE.
 *
 * Reference: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv4-signing-examples.html
 */

const ALGORITHM = 'AWS4-HMAC-SHA256'
const encoder = new TextEncoder()

/**
 * Bytes we own outright. The plain `Uint8Array` alias may be backed by a
 * `SharedArrayBuffer`, which Web Crypto will not accept.
 */
export type Bytes = Uint8Array<ArrayBuffer>

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const sha256 = async (data: BufferSource | string): Promise<ArrayBuffer> =>
  crypto.subtle.digest('SHA-256', typeof data === 'string' ? encoder.encode(data) : data)

export const sha256Hex = async (data: BufferSource | string): Promise<string> =>
  toHex(await sha256(data))

const hmac = async (key: BufferSource, message: string): Promise<ArrayBuffer> => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
}

/**
 * `encodeURIComponent` leaves `!'()*` alone; AWS wants them percent-encoded.
 * Slashes are encoded per segment, never across them, because S3 treats the
 * key's slashes as path separators.
 */
const encodeSegment = (segment: string): string =>
  encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )

export const canonicalPath = (...segments: string[]): string =>
  `/${segments.flatMap((segment) => segment.split('/')).filter(Boolean).map(encodeSegment).join('/')}`

export type SigningCredentials = {
  accessKeyId: string
  secretAccessKey: string
  /** R2 accepts `auto`; the value only has to match on both sides. */
  region: string
  service: string
}

type SignInput = {
  method: string
  url: URL
  /** Signed as-is. `host`, `x-amz-date` and `x-amz-content-sha256` are added here. */
  headers: Record<string, string>
  body?: Bytes
  credentials: SigningCredentials
  /** Injectable so the signature is testable against a known vector. */
  now?: Date
}

/**
 * Returns the headers to send, including `Authorization`. The caller passes
 * them straight to `fetch` — nothing is mutated in place.
 */
export const signRequest = async ({
  method,
  url,
  headers,
  body,
  credentials,
  now = new Date(),
}: SignInput): Promise<Record<string, string>> => {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const date = amzDate.slice(0, 8)
  const payloadHash = await sha256Hex(body ?? '')

  const allHeaders: Record<string, string> = {
    ...headers,
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }

  // Canonical headers are lower-cased, trimmed, and sorted by name.
  const sortedNames = Object.keys(allHeaders)
    .map((name) => name.toLowerCase())
    .sort()

  const lookup = new Map(
    Object.entries(allHeaders).map(([name, value]) => [name.toLowerCase(), value.trim()]),
  )

  const canonicalHeaders = sortedNames.map((name) => `${name}:${lookup.get(name)}\n`).join('')
  const signedHeaders = sortedNames.join(';')

  const canonicalQuery = [...url.searchParams.entries()]
    .map(([key, value]): [string, string] => [encodeSegment(key), encodeSegment(value)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')

  const canonicalRequest = [
    method,
    url.pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const scope = `${date}/${credentials.region}/${credentials.service}/aws4_request`

  const stringToSign = [ALGORITHM, amzDate, scope, await sha256Hex(canonicalRequest)].join('\n')

  const dateKey = await hmac(encoder.encode(`AWS4${credentials.secretAccessKey}`), date)
  const regionKey = await hmac(dateKey, credentials.region)
  const serviceKey = await hmac(regionKey, credentials.service)
  const signingKey = await hmac(serviceKey, 'aws4_request')
  const signature = toHex(await hmac(signingKey, stringToSign))

  return {
    ...allHeaders,
    Authorization:
      `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}
