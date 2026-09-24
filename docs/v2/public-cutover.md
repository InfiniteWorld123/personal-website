# Public website cutover to Backend2 — page-by-page plan

Status: **all seven steps are built behind switches (24 Sep 2026); none is switched on the live site.** This document
orders the move of the public website from the legacy backend to Backend2.
Each step is its own owner-approved change; this plan does not authorize a
deploy, a live cutover, deleting legacy code, or changing `main`.

The accepted public design stays exactly as it is: layout, styling, motion,
routes (`/de|en|ar/...`), languages, copy and responsive behaviour. The only
visible changes are the ones already approved in module specifications
(listed under each step) and anything the owner approves later.

## Where things stand (verified 23 Sep 2026)

- Every public page still reads the legacy backend or the static content
  files; nothing public calls `/api/v2` (see `platform-review.md`).
- Backend2 already has the public reads a cutover needs, mounted only where
  `DATABASE_URL_V2` exists: Content (`/api/v2/content`), Services, Projects,
  Blog (reads, likes, reads counter, comments), Media (published files only),
  Booking (`/api/v2/public/booking/*`) and the AI assistant.
- **Missing in Backend2:** a public Contact endpoint. Inbox V2 receives email,
  but the website form still posts to the legacy `/api/contact`. It must be
  built (Inbox spec: one file ≤ 10 MB, allow-listed types, exactly one
  conversation per submission, Turnstile kept) before Contact can move.
- The owner's V2 database (Neon) holds 1 service, 1 blog post and no
  projects. Content has no saved values, which is fine: every Content field
  falls back to today's wording from the code.

## Blocking decisions before any public page moves

1. **Production V2 database connection.** The live site (Cloudflare) needs a
   connection to the V2 database (a Hyperdrive binding or equivalent) and the
   V2 migrations applied there. Owner action in Cloudflare, explained step by
   step at that time.
2. **Managing content in production.** Owner routes (the Dashboard's API)
   are local-only by design. Once the public site reads V2, the owner must be
   able to edit V2 from the live Dashboard, which needs the approved remote
   authentication plan in `auth.md` (passkey + MFA already built; the remote
   switch and its security review are not). Until then, content can only be
   edited from the owner's own computer against the same database.
3. **A way back.** Each step is switched by one server-side setting per
   module (legacy or V2) so a problem is undone by switching back, without a
   redeploy of old code. The legacy database is not written to by V2 and is
   left intact.

## Order and per-page detail

The order starts with read-only pages that have little data risk and ends
with the forms that create records.

| Step | Pages | Reads from V2 | Owner must enter first | Approved visible change |
|---|---|---|---|---|
| 1 | Static copy on every page (home framing, About, FAQ, Stack, Contact text, Legal, header/footer, 404) | Content | Nothing — defaults are today's wording. Optionally import the legacy published overrides with `db2:content:import` (dry run first). | None |
| 2 | `/services` and the home services cards | Services + Content framing | Every service with its three languages and prices (today only 1 exists) | None |
| 3 | `/work`, `/work/:slug`, home work section | Projects + Media | Every project to show, with cover images uploaded to Media | None |
| 4 | `/blog`, `/blog/:slug`, home blog section, RSS feeds, sitemap | Blog + Media | Every article to keep (1 exists); likes/reads restart from zero because legacy data is not imported | Public comments appear under articles (Blog spec) — design needs the owner's look |
| 5 | Booking: `/booking`, `/booking/:slug`, manage link, video room | Booking | Booking types, weekly hours, settings | Built from the approved Booking lab; video room waits for RealtimeKit |
| 6 | Contact form | Inbox (new public endpoint) | Nothing | The two select fields “What is it about?” and “Budget range” are removed from Contact only (Inbox spec) |
| 7 | Chat widget | AI assistant | Switch the assistant on after the privacy review | The notice text must change: V2 saves conversations (Assistant lab, question 1) |

Every step also:

- builds the page's data loading so each visitor downloads only their own
  language (today all three languages ship on every page, ~35 KB compressed);
- keeps server-side pagination, caching headers and `<lastmod>` in the
  sitemap from Backend2's dates;
- is verified in a real browser in all three languages, desktop and phone,
  compared screenshot-for-screenshot with the legacy page, before it is
  switched on the live site.

## What the owner will be asked to do, in order

1. Approve the three Design Labs (Invoices, Analytics, Assistant).
2. Approve applying migrations `0012`–`0013` to the V2 database (one command).
3. Enter the real services, projects and articles in the Dashboard.
4. Decide on remote Dashboard access (security plan) before the first public
   step goes live.
5. Approve each public step after seeing its side-by-side screenshots.

Only after every step runs on V2, both public and private paths are tested,
and a recoverable copy of the old branch exists, is the final cutover of
`main`, `/admin` and the legacy backend discussed — separately.

## Build record — 24 Sep 2026

Every step is implemented and verified locally behind `PUBLIC_V2_MODULES`
(`content`, `services`, `projects`, `blog`, `booking`, `contact`,
`assistant`). With the variable unset the public site is unchanged — checked
by screenshots of the legacy pages and by loading them with every write
blocked. With a module listed, its pages read Backend2 and show only the
approved visible changes. Tests: `public-source`, `public-services*`,
`public-projects`, `public-blog*`, `public-booking`, `public-contact`,
`chat-widget-ui`.

Still needed before any switch goes live: the owner's real content in V2
(services, projects, articles, booking types/hours), the production V2
database connection on Cloudflare, the remote Dashboard access decision
(`auth.md`), the privacy page wording for saved assistant conversations and
comments, the Cron Trigger for the scheduled jobs on the live Worker (see
"Scheduled jobs" below — built, on the preview only), and RealtimeKit for real video
calls. Open owner questions: how the project type is shown on cards, Turnstile
on blog comments, two new comment-loading sentences.

## Scheduled jobs (Cron Trigger) — built 24 Sep 2026

Backend2's periodic jobs run from the Worker's `scheduled` event, through one
entry, `runScheduledJobs` (`src/backend2/jobs/scheduled.ts`). Each job is
idempotent and isolated: one that fails is logged and the rest still run.
Nothing runs unless `DATABASE_URL_V2` is configured; the legacy database is
never touched.

| Job | When | Existing command |
|---|---|---|
| Blog: publish due schedules | every tick | `db2:blog:publish-due` |
| Booking: visitor reminders | every tick | `db2:booking:send-reminders` |
| Invoices: subscription billing, due charges/retries, reminder drafts | hourly (`:00` tick) | `db2:invoices:run-billing` |
| Assistant: retention purge (`manual` deletes nothing) | hourly | `db2:assistant:purge` |
| Media: finish interrupted deletions (24 h grace, never unused files) | hourly | `db2:media:sweep` |
| Auth housekeeping: expired challenges, rate-limit windows, sessions | hourly | — (also on sign-in) |

How it is wired: `src/backend2/jobs/cloudflare-scheduled.plugin.ts` is a Nitro
plugin (registered in `vite.config.ts`) on the `cloudflare:scheduled` hook. It
hands the tick to the server bundle as one in-process request carrying a
single-use random token (`jobs/handoff.ts`), so Backend2 is not bundled twice;
from the internet the path is an ordinary 404. Nitro's `scheduledTasks` was
not used because it would write the cron into the generated `wrangler.json`
that the live site deploys from.

The preview Worker already gets the cron from `scripts/v2-preview.mjs`. At
cutover — and only with the owner's approval — add this to `wrangler.jsonc`:

```jsonc
  // Backend2's periodic jobs (src/backend2/jobs/scheduled.ts).
  "triggers": { "crons": ["*/15 * * * *"] },
```

Things to know before switching it on:

- **Account limit.** The free plan allows 5 Cron Triggers per account; the
  preview and the live Worker would use one each.
- **CPU.** A free-plan cron invocation has 10 ms of CPU (15 min wall time).
  Waiting for the database does not count, but a cold isolate also loads the
  server bundle. Check `wrangler tail` on the preview for exceeded-CPU errors.
- **Database cost.** Neon pauses the database after a few idle minutes; a
  query every 5 minutes keeps it awake almost all the time, which uses more
  of a free plan's compute hours. `*/15` roughly halves that at the cost of
  reminders and schedules up to 15 minutes late (the blog also publishes on
  the first visit after its time, whatever the cron does). `docs/v2/blog.md`
  asked for every minute; `*/15` is chosen (24 Sep 2026) so Neon can sleep
  between runs — a scheduled post still appears on time for its first
  visitor, and a booking reminder 15 minutes late is harmless.
- **Emails.** Reminders are real emails only where `INBOX_SEND_MODE=live`, and
  billing is test-only unless `INVOICES_LIVE_ENABLED=true`.

## Copy from the old site — built 24 Sep 2026

Owner decision (24 Sep 2026): before the cutover, V2 starts from a copy of what
the public website shows today, and the owner then edits it in the Dashboard.
This supersedes the earlier "nothing is imported" lines in `projects.md`,
`services.md` and `blog.md` for this one copy. Leads, clients, invoices, chats,
bookings people made and accounts are **not** copied.

Where: Dashboard → Settings → **Old site** (`/dashboard/settings/old-site`).
**Check what would be copied** is a dry run (`GET /api/v2/owner/import/legacy`);
**Copy N items** runs it (`POST … {"confirm": true}`), one image or one record
per request, repeated by the page until nothing remains. Owner-only, behind
`ownerGuard` (fence, V2 session, CSRF on the write). It runs inside the Worker,
where both databases and both buckets are reachable.

What is copied, and how:

| Old site | V2 |
|---|---|
| Published projects (order, 3 languages, tech, website/source links, images with alt text) | Projects, published when V2's checks pass; `live` → Completed, `building` → In progress; type **Personal** (the old site had none); Starting point / What I built / What the project shows / Features become the case study under the old headings; the first image is the cover when none was marked |
| The three services on `/services` (from the code, not the legacy `services` table, which no public page reads) | Services, published, starred, "from" price as a one-time price; promise + "a good fit if you" + price note become the longer text |
| Published articles, their cover, inline images and tags | Blog, **as a private draft** (`blog.md` recorded the old article as test content) |
| Active booking types, weekly hours, future exceptions | Booking types (on when all three names exist), V2 weekly hours only if none are set, exception days as the exact hours the old site had that day |
| Image files (`/images/...` static files, the legacy `MEDIA` bucket, or https) | New assets in the Media folder "Imported from old site" |

Rules: nothing already in V2 at the same address is touched (reported as
skipped); nothing is written to the legacy database (read inside
`BEGIN TRANSACTION READ ONLY`); a project whose picture cannot be copied stays
private and says which picture to add. Every created record and copied file is
recorded in `v2_legacy_imports` (migration `0014_legacy_import.sql`, applied by
the owner with `bun run db2:migrate`), in the same transaction as the record,
so a second run creates nothing twice.

Code: `src/backend2/modules/import/` (`legacy.source.ts` is the only file that
reads the old site), `src/backend2/contracts/import.contract.ts`,
`src/frontend/features/legacy-import/`, `OldSitePage.tsx`. Delete all of it
after the cutover. Tests: `backend2-legacy-import.test.ts`,
`legacy-import-ui.test.tsx`.

## Cutover record (24 Sep 2026, owner-approved)

- Backup first: branch `main-legacy-backup` on GitHub (the live `main` as it
  was), and a read-only JSON export of every legacy table on the owner's Mac
  (`~/Documents/yamanwarda-legacy-backup-2026-09-24`, never in the repo).
- `wrangler.jsonc` gains `HYPERDRIVE_V2`, the `*/15` cron, every public module
  on Backend2, the remote Dashboard (`AUTH_V2_ORIGIN=https://yamanwarda.de`),
  `INBOX_SEND_MODE=live` (real booking and Inbox mail; invoices stay test),
  and Cloudflare Web Analytics (public beacon token, account id, site tag).
- New live secrets, set by the owner (Claude may not write secrets):
  `node scripts/v2-live-secrets.mjs` then
  `npx wrangler secret bulk live-secrets.json --name yamanwarda && rm live-secrets.json`
  (DATABASE_URL_V2, AUTH_V2_SECRET, CALL_ROOM_SECRET), and
  `npx wrangler secret put CF_ANALYTICS_API_TOKEN --name yamanwarda`.
- Then `main-v2` is fast-forwarded onto `main` by the owner; GitHub Actions
  deploys. The same checks already pass on `main-v2` (`check.yml`).
- After a clean check: delete the preview Worker
  (`npx wrangler delete --name yamanwarda-v2-preview`), then remove `/admin`
  and the legacy backend in a separate change; the legacy database is dropped
  a week later.
