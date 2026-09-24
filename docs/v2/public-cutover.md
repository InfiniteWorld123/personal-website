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
comments, scheduled jobs (blog publishing, booking reminders, invoice billing,
assistant purge) as Cloudflare Cron Triggers, and RealtimeKit for real video
calls. Open owner questions: how the project type is shown on cards, Turnstile
on blog comments, two new comment-loading sentences.
