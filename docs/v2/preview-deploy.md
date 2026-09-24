# Trying V2 on the internet — the preview Worker

Status: **ready to run, 24 Sep 2026; not deployed.** A second Cloudflare
Worker, `yamanwarda-v2-preview`, on `https://v2.yamanwarda.de` only. The live
site (`yamanwarda`, `yamanwarda.de`, deployed from `main` by GitHub Actions)
is not touched. Every public module reads Backend2 there, and the Dashboard
is reachable at `https://v2.yamanwarda.de/dashboard` behind the V2 sign-in
(`remote-access.md`).

What the preview shares with the live site: the V2 database (Neon — the same
one the local Dashboard already uses), the legacy database through the
existing Hyperdrive (only the old `/admin` would touch it), and the R2
buckets. Emails sent from the preview (booking confirmations, replies) are
real emails.

## Steps (the owner runs the commands; each prints nothing secret)

1. `npx wrangler login` — opens the browser once to allow this computer.
2. Create the V2 Hyperdrive (reads the address from `.env`, never shown):
   `npx wrangler hyperdrive create yamanwarda-v2 --connection-string="$(grep '^DATABASE_URL_V2=' .env | cut -d= -f2- | sed 's/-pooler//')"`
   and tell Claude the `id` it prints (not secret).
3. Claude builds and prepares: `bun run build:cf` then
   `node scripts/v2-preview.mjs <id>`.
4. Upload the secrets, then delete the file:
   `npx wrangler secret bulk .output/server/preview-secrets.json --config .output/server/wrangler.preview.json && rm .output/server/preview-secrets.json`
5. Turnstile: in Cloudflare → Turnstile → the site's widget → Hostnames, add
   `v2.yamanwarda.de`; then
   `npx wrangler secret put TURNSTILE_SECRET_KEY --config .output/server/wrangler.preview.json`
   and paste the widget's secret key into the terminal (never into the chat).
6. Deploy the preview: `npx wrangler deploy --config .output/server/wrangler.preview.json`.
7. Open `https://v2.yamanwarda.de`, and `https://v2.yamanwarda.de/dashboard`
   (sign in with password + authenticator code the first time; a passkey is
   registered per address, so add one there from Settings → Security).

## Undo

`npx wrangler delete --name yamanwarda-v2-preview` removes the preview Worker
and its address. Nothing else changes.
