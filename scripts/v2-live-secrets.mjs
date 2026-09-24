#!/usr/bin/env node
/**
 * Cutover (`docs/v2/public-cutover.md`): the V2 secrets the live Worker
 * `yamanwarda` does not have yet, copied from `.env` on this machine.
 *
 *   node scripts/v2-live-secrets.mjs
 *   npx wrangler secret bulk live-secrets.json --name yamanwarda && rm live-secrets.json
 *
 * Writes `live-secrets.json` (git-ignored, mode 600) and prints only names.
 * Also writes `inbound-secrets.json` with the same freshly generated
 * INBOX_INGRESS_SECRET for the mail Worker (`workers/inbound-email`):
 *   npx wrangler secret bulk inbound-secrets.json -c workers/inbound-email/wrangler.jsonc && rm inbound-secrets.json
 * The live Worker already has every legacy secret; these are the additions.
 * `CF_ANALYTICS_API_TOKEN` is not in `.env` and is set by hand.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

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

const NAMES = ['DATABASE_URL_V2', 'AUTH_V2_SECRET', 'CALL_ROOM_SECRET']
const secrets = Object.fromEntries(NAMES.filter((name) => env[name]).map((name) => [name, env[name]]))
const missing = NAMES.filter((name) => !env[name])

if ((secrets.AUTH_V2_SECRET ?? '').length < 32) throw new Error('AUTH_V2_SECRET in .env must be at least 32 characters')

// The mail Worker signs every letter it hands to V2 with this; both sides
// must hold the same value, so it is made once, here, for both files.
const ingress = env.INBOX_INGRESS_SECRET || randomBytes(32).toString('hex')
secrets.INBOX_INGRESS_SECRET = ingress

writeFileSync('live-secrets.json', `${JSON.stringify(secrets)}\n`, { mode: 0o600 })
writeFileSync('inbound-secrets.json', `${JSON.stringify({ INBOX_INGRESS_SECRET: ingress })}\n`, { mode: 0o600 })

console.log(`Wrote live-secrets.json with: ${Object.keys(secrets).join(', ')} (values not shown)`)
console.log('Wrote inbound-secrets.json with: INBOX_INGRESS_SECRET (same value)')
if (missing.length) console.log(`Not in .env: ${missing.join(', ')}`)
