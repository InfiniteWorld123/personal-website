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
layer with `prefers-reduced-motion` respected throughout.

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
building story, project carousel and load-more, home-only desktop Lenis.
Fixed: the "node to be removed is not a child" crash on every client-side
navigation away from the home page (GSAP pin reverted too late).

Open before cutover: real project screenshots, an OG image, Impressum and
Datenschutz pages (legally required in Germany; text must come from the
owner), and the `platform` → `main` merge.

## [ ] B4 — Leads and inbox
*Model: Sonnet 5 · medium*
`leads` schema, contact form writing to the database, `/admin/leads` with the
status pipeline and private notes, and replying to a lead from the admin.
🔒 **Security checkpoint** — public write endpoint, rate limiting, spam.

## [ ] B5 — Booking
*Model: Opus 5 · high*
Booking types, availability rules, timezone-correct slot generation, overlap
prevention, confirmation email with `.ics`, signed cancel/reschedule links,
qualifying questions on the lead, `/admin/bookings`, reminders via `pg-boss`.
Google Calendar sync is a follow-up block, not part of this one.
🔒 **Security checkpoint** — signed tokens, public booking endpoint.

## [ ] B6 — Content management
*Model: Sonnet 5 · medium*
`content_blocks` + translations, page copy migrated out of code,
`/admin/content`, and full CRUD for projects and services with Cloudinary
image upload.
🔒 **Security checkpoint** — file upload validation.

## [ ] B7 — Blog
*Model: Sonnet 5 · medium*
`posts` schema, admin editor, draft/publish, `/blog`, `/blog/$slug`, tags, RSS.

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
