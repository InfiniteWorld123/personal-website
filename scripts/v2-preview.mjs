#!/usr/bin/env node
/**
 * Prepares a separate Cloudflare Worker for trying V2 on the internet
 * (`docs/v2/preview-deploy.md`), without touching the live site.
 *
 *   bun run build:cf
 *   node scripts/v2-preview.mjs <HYPERDRIVE_V2_ID>
 *
 * Writes, inside the ignored `.output/server/`:
 * - `wrangler.preview.json` — the built Worker under another name
 *   (`yamanwarda-v2-preview`) on `v2.yamanwarda.de` only, with every public
 *   module on Backend2 and the Dashboard reachable there behind the V2
 *   sign-in. The live Worker (`yamanwarda`, yamanwarda.de) is never named.
 * - `preview-secrets.json` — the secrets it needs, copied from `.env` on this
 *   machine, for `wrangler secret bulk`. Delete it after uploading; it never
 *   leaves this computer otherwise and is never printed.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const hyperdriveId = process.argv[2]?.trim()

if (!hyperdriveId || !/^[0-9a-f]{32}$/u.test(hyperdriveId)) {
  console.error('Usage: node scripts/v2-preview.mjs <HYPERDRIVE_V2_ID>  (32 hex characters, from `wrangler hyperdrive create`)')
  process.exit(1)
}

const HOST = 'v2.yamanwarda.de'
const built = JSON.parse(readFileSync('.output/server/wrangler.json', 'utf8'))

if (built.name !== 'yamanwarda') {
  console.error('Build the Cloudflare output first: bun run build:cf')
  process.exit(1)
}

const preview = {
  ...built,
  name: 'yamanwarda-v2-preview',
  workers_dev: false,
  routes: [{ pattern: HOST, custom_domain: true, zone_name: 'yamanwarda.de' }],
  hyperdrive: [...(built.hyperdrive ?? []), { binding: 'HYPERDRIVE_V2', id: hyperdriveId }],
  vars: {
    ...(built.vars ?? {}),
    NODE_ENV: 'production',
    BASE_URL: `https://${HOST}`,
    BETTER_AUTH_URL: `https://${HOST}`,
    PUBLIC_V2_MODULES: 'content,services,projects,blog,booking,contact,assistant',
    BACKEND2_OWNER_API: 'remote',
    AUTH_V2_ORIGIN: `https://${HOST}`,
    AUTH_V2_RP_ID: HOST,
  },
}

if (preview.routes.some((route) => route.pattern === 'yamanwarda.de' || route.pattern === 'www.yamanwarda.de')) {
  throw new Error('Refusing: the preview must never claim the live addresses')
}

writeFileSync('.output/server/wrangler.preview.json', `${JSON.stringify(preview, null, 2)}\n`)

/* ------------------------------------------------------------- secrets */

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/gu, '')]
    }),
)

const SECRETS = [
  'DATABASE_URL',
  'DATABASE_URL_V2',
  'AUTH_V2_SECRET',
  'BETTER_AUTH_SECRET',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'CONTACT_TO_EMAIL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'CALL_ROOM_SECRET',
  'INBOUND_MAIL_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
]

const secrets = Object.fromEntries(SECRETS.filter((name) => env[name]).map((name) => [name, env[name]]))
const missing = SECRETS.filter((name) => !env[name])

if ((env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live_')) {
  throw new Error('Refusing: the preview must use a Stripe test key')
}

writeFileSync('.output/server/preview-secrets.json', `${JSON.stringify(secrets)}\n`, { mode: 0o600 })

console.log(`Wrote .output/server/wrangler.preview.json for https://${HOST}`)
console.log(`Wrote .output/server/preview-secrets.json with ${Object.keys(secrets).length} secrets (values not shown)`)
if (missing.length) console.log(`Not in .env (set by hand if needed): ${missing.join(', ')}`)
console.log('Still needed by hand: TURNSTILE_SECRET_KEY (from the Cloudflare Turnstile page).')
