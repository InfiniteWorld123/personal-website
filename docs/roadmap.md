# Roadmap

Ordered so revenue-facing work lands first.

Work is delivered in **blocks**, not micro-slices. One block is one session: it
covers a whole feature end to end — migration, backend module, API types, UI,
and states — and ends with a working, verified result. The owner reviews the
block, not each decision inside it.

Status: `[ ]` not started · `[~]` in progress · `[x]` done

---

## [x] B0 — Docs and restructure
Governance docs (`AGENTS.md`, `docs/`), `src/` split into
`backend/` · `frontend/` · `shared/`, all imports on the `#/` alias, Bun as the
package manager. Verified: build, typecheck, tests, real browser render.

## [x] B1 — Backend foundation
*Model: Opus 5 · high*
PostgreSQL + `compose.yaml`, migration runner, Elysia mounted at `/api` with the
central `AppError` flow and shared response helpers, Eden Treaty typed client,
Better Auth with one ADMIN, a guarded `/admin`, and the admin shell
(sidebar, layout, theme, empty overview).
🔒 **Security checkpoint** — auth, sessions, route guards.

## [x] B2 — Design system and motion
*Model: Opus 5 · high*
Type scale, palette, tokens, dark mode, RTL. GSAP + ScrollTrigger + Lenis motion
layer with `prefers-reduced-motion` respected throughout (motion layer later
removed, D15).

## [~] B3 — Public site
*Model: Opus 5 · high*
Landing (offer-first, per `positioning.md`), `/about`, `/services` from
`docs/services/`, `/work` + `/work/$slug` case studies, `/contact`, SEO,
sitemap, OG images. Ends with the cutover: merge `platform` → `main`.

Done (8 Sep 2026): the owner's original identity kept and formalised (see
`design-system.md`; two quieter redesigns were tried and rejected), language in
the URL (`/de`, `/en`, `/ar`) with server-rendered `lang`/`dir`, public shell,
all six pages in three languages in `du`-form German, per-page SEO head with
hreflang, `sitemap.xml`, qualifying contact form on the legacy email endpoint,
building story as a static section in normal flow, project carousel and
load-more, one primary CTA label everywhere ("Gespräch anfragen" / "Request a
call" / "اطلب مكالمة"). The GSAP/Lenis motion layer, which had crashed every
client-side navigation away from the home page, was removed on 8 Sep 2026; the
site was a CSS-only baseline for a day (D15); on the same day the owner chose
the animation direction from a live prototype and it was built without any
animation library (D16).

Open before cutover: real project screenshots, an OG image, Impressum and
Datenschutz pages (legally required in Germany; text must come from the
owner), and the `platform` → `main` merge.

Open: a new logo or brand mark (the owner asked for one that lasts), and a
review of the story section's copy and illustration.

## [x] B4 — Leads and inbox
*Model: Sonnet 5 · medium*
`leads` schema, contact form writing to the database, `/admin/leads` with the
status pipeline and private notes, and replying to a lead from the admin.
🔒 **Security checkpoint** — public write endpoint, rate limiting, spam.

Built in three rounds, all from live prototypes the owner chose from. The inbox
on 13 Sep 2026; formatted replies the same day; the pipeline on 14 Sep 2026.

The third round is the one that made it a system rather than two tools sharing a
table. `0010_lead_system.sql` adds `services` — the vocabulary the contact form,
the call types and the board now share — two stages (`PROPOSAL`, `HOLD`), and
the fields the second question needs: a value, a follow-up date, a next step and
a loss reason. `/admin/leads` carries five lenses on the same records (inbox,
pipeline, today, calls, all) plus a settings page where every switch and every
timing is a value in one `app_settings` row.

Nine automation rules ship on `auto`, the owner's own choice. Four decisions
were taken and are recorded: odds derived from the stage (D29), the history
written by every module rather than owned by the inbox (D30), time-based rules
swept lazily on read instead of on a cron (D31), and an automatic close that
announces itself with an undo (D32).

Open: `0010_lead_system.sql` has been applied to the local database only and
still needs running against Neon. The morning mail is built and switchable but
nothing sends it until the worker is deployed with a cron trigger — the same
deploy the B5 reminders are waiting on. The board has not been checked in a
browser by Claude, which cannot sign in to the admin.

## [~] B5 — Booking
*Model: Opus 5 · high*
Booking types, availability rules, timezone-correct slot generation, overlap
prevention, confirmation email with `.ics`, signed cancel/reschedule links,
qualifying questions on the lead, `/admin/bookings`, reminders via `pg-boss`.
Google Calendar sync is a follow-up block, not part of this one.
🔒 **Security checkpoint** — signed tokens, public booking endpoint.

Built 12 Sep 2026, ahead of B4 at the owner's request, who chose to build the
booking system rather than rent one from Cal.com or Calendly. `0004_bookings.sql`
carries the `leads` table too, because a booking attaches to a lead and
retrofitting that key later is worse than creating the table early — the leads
admin, the pipeline, and the contact form writing to it are still B4.

Two decisions were taken during the block and are recorded: the weekly schedule
is stored as wall-clock minutes rather than instants (D26), and double booking
is prevented by a Postgres exclusion constraint rather than in application code
(D27).

Open: reminder emails, which need a Cloudflare Cron Trigger and therefore a
deploy; and nothing links to `/booking` from the site yet — the primary CTA
still points at `/contact`, and moving it is the owner's call.

## [ ] B6 — Content management
*Model: Sonnet 5 · medium*
`content_blocks` + translations, page copy migrated out of code,
`/admin/content`, and full CRUD for projects and services with R2 image
upload (D21).
🔒 **Security checkpoint** — file upload validation.

## [x] B7 — Blog
*Model: Opus 5 · high*
`posts` + `post_translations` + `tags` schema, the admin editor, draft/publish,
`/blog`, `/blog/$slug`, tag archive, per-language RSS, the latest-articles
section on the landing page, sitemap and `BlogPosting` structured data.

Built out of order, ahead of B4–B6, at the owner's request (12 Sep 2026).

Two decisions were taken during the block and are recorded: posts carry all
three languages rather than one (D23, reversing D7), and the body is stored as
a document rather than as HTML because the owner chose a visual editor (D24).

Open: images inside an article are referenced by path, as project images still
are. Uploading them belongs to B6.

## [ ] B8 — Analytics and overview
*Model: Sonnet 5 · medium*
PostHog EU with a consent banner, business metric queries, cached traffic
metrics, and the `/admin` overview page.

## [ ] B9 — Clients and invoices
*Model: Opus 5 · high*
`clients`, `engagements`, `invoices` with gapless numbering, `invoice_lines`,
`payments` with derived status, credit notes, PDF generation.
🔒 **Security checkpoint** — money handling, numbering integrity, PII.

## [ ] B10 — Stripe, subscriptions, revenue
*Model: Opus 5 · high*
Payment links, Stripe webhook → `payments`, SEPA Direct Debit, `subscriptions`
with automatic invoice generation, `/admin/revenue`.
🔒 **Security checkpoint** — webhook signature verification, idempotency.

## [ ] B11 — Referrals
*Model: Sonnet 5 · medium*
`referrers`, referral codes and attribution, `referral_payouts` due on client
payment with manual mark-as-paid.

## [ ] B12 — Presentation
*Model: Opus 5 · high*
`/stack` for companies, the platform case study, and inbound email threading on
leads. Newsletter stays deferred.

---

## How a block runs

1. Read `AGENTS.md` and the relevant part of `data-model.md` and `decisions.md`.
2. Build the whole block. Ask only when a decision is not already recorded.
3. Verify: `bun run typecheck`, `bun run test`, `bun run build`, and a real
   browser check.
4. `/code-review high` — and `/security-review` on any block marked 🔒.
5. Report what was built, what was skipped, and what needs a decision.

Model guidance: Opus for architecture, design, money, and auth blocks; Sonnet
for well-specified CRUD and UI blocks.
