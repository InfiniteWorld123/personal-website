const getEnvVar = (key: string) => {
  const value = process.env[key]
  if (value === undefined || value.trim() === '') {
    throw new Error(`Environment variable ${key} is missing`)
  }
  return value
}

const getOptionalEnvVar = (key: string) => {
  const value = process.env[key]
  if (value === undefined || value.trim() === '') {
    return undefined
  }
  return value
}

export const env = {
  APP_NAME: getOptionalEnvVar('APP_NAME') ?? 'Yaman Warda',

  BETTER_AUTH_SECRET: getEnvVar('BETTER_AUTH_SECRET'),
  BETTER_AUTH_URL: getEnvVar('BETTER_AUTH_URL'),

  DATABASE_URL: getEnvVar('DATABASE_URL'),
  BASE_URL: getEnvVar('BASE_URL'),

  /** Server-only Turnstile key. Production requests fail closed when absent. */
  TURNSTILE_SECRET_KEY: getOptionalEnvVar('TURNSTILE_SECRET_KEY'),
  /** Independent HMAC key for privacy-preserving distributed rate-limit keys. */
  RATE_LIMIT_SECRET: getOptionalEnvVar('RATE_LIMIT_SECRET'),

  /** Used only by the admin seed command. Never read at request time. */
  ADMIN_NAME: getOptionalEnvVar('ADMIN_NAME'),
  ADMIN_EMAIL: getOptionalEnvVar('ADMIN_EMAIL'),
  ADMIN_PASSWORD: getOptionalEnvVar('ADMIN_PASSWORD'),

  /** Added in later blocks. Optional so B1 runs without them. */
  RESEND_API_KEY: getOptionalEnvVar('RESEND_API_KEY'),
  EMAIL_FROM: getOptionalEnvVar('EMAIL_FROM'),
  /** Where the inbox's notification mail is delivered. */
  CONTACT_TO_EMAIL: getOptionalEnvVar('CONTACT_TO_EMAIL'),

  /**
   * Inbound replies (B4). `INBOUND_MAIL_ADDRESS` is the address outbound
   * replies carry as Reply-To — it must contain a `+`, e.g.
   * `reply+token@yamanwarda.de`, because the token is written into that slot.
   * `INBOUND_MAIL_SECRET` is the shared secret the receiving webhook checks
   * before it believes a letter.
   *
   * Both optional: without them the inbox still stores, still notifies, and
   * still sends replies — it simply cannot take an answer back, and says so.
   */
  INBOUND_MAIL_ADDRESS: getOptionalEnvVar('INBOUND_MAIL_ADDRESS'),
  INBOUND_MAIL_SECRET: getOptionalEnvVar('INBOUND_MAIL_SECRET'),

  /**
   * Cloudflare R2, the image store (D21, superseding the Cloudinary choice in
   * D14). Optional so the app still boots without them; the media endpoint
   * refuses uploads and says so rather than failing at import time.
   */
  R2_ACCOUNT_ID: getOptionalEnvVar('R2_ACCOUNT_ID'),
  R2_ACCESS_KEY_ID: getOptionalEnvVar('R2_ACCESS_KEY_ID'),
  R2_SECRET_ACCESS_KEY: getOptionalEnvVar('R2_SECRET_ACCESS_KEY'),
  R2_BUCKET: getOptionalEnvVar('R2_BUCKET'),
  /** Public origin the bucket is served from, e.g. `https://media.yamanwarda.de`. */
  R2_PUBLIC_URL: getOptionalEnvVar('R2_PUBLIC_URL'),

  /**
   * Signs draft-preview links. Separate from BETTER_AUTH_SECRET on purpose:
   * one leaked secret must not also hand out sessions.
   */
  PREVIEW_TOKEN_SECRET: getOptionalEnvVar('PREVIEW_TOKEN_SECRET'),

  /**
   * The video call held inside a booking (D33).
   *
   * `CALL_ROOM_SECRET` is shared with `workers/call-room`: this side signs the
   * two-minute ticket, that side verifies it. A third secret rather than a
   * reused one, for the reason the preview secret is its own — a leak here
   * must buy a room, never a session.
   *
   * `CALL_ROOM_URL` is where that Worker answers, e.g.
   * `wss://yamanwarda-call-room.<subdomain>.workers.dev`. It is read on the
   * server and handed to the browser inside the call details, so no Worker
   * address is baked into the client bundle.
   *
   * `TURN_KEY_ID` and `TURN_KEY_API_TOKEN` buy the relay that carries the
   * tenth of calls which cannot connect directly. Without them a call still
   * connects for most people over STUN alone.
   *
   * All four optional: absent, the room refuses politely and every other part
   * of booking works exactly as before.
   */
  CALL_ROOM_SECRET: getOptionalEnvVar('CALL_ROOM_SECRET'),
  CALL_ROOM_URL: getOptionalEnvVar('CALL_ROOM_URL'),
  TURN_KEY_ID: getOptionalEnvVar('TURN_KEY_ID'),
  TURN_KEY_API_TOKEN: getOptionalEnvVar('TURN_KEY_API_TOKEN'),

  /**
   * The assistant's rented brain (D34).
   *
   * `CHAT_PROVIDER` defaults to `off`, which answers from the knowledge file
   * with no key, no account and no network call — the whole feature works
   * that way, and every other provider falls back to it on any failure.
   *
   * Set it to a provider name with `CHAT_API_KEY` to rent a model. Two things
   * to know before doing that on a **client's** site rather than this one: a
   * free tier generally permits training on what it is sent, and comes with no
   * `AVV`. Free is fine here and not fine there, which is the reason this is a
   * variable instead of an import.
   *
   * `CHAT_MODEL` names the model within that provider; absent, the provider
   * picks its own cheap default.
   */
  CHAT_PROVIDER: getOptionalEnvVar('CHAT_PROVIDER'),
  CHAT_API_KEY: getOptionalEnvVar('CHAT_API_KEY'),
  CHAT_MODEL: getOptionalEnvVar('CHAT_MODEL'),
} as const

export type EnvVariables = typeof env
