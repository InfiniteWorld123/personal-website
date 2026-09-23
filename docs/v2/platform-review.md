# V2 platform review — stage 1 (23 Sep 2026)

Read-only review. Nothing was changed in code or in the V2 database. This file
keeps the findings so later stages (AI assistant, Analytics, public cutover
plan, performance) do not have to rediscover them.

## Verified state

- V2 database (Neon): migrations 0001–0011 applied in order (ledger
  `v2_schema_migrations`). Content: 1 owner (passkey + recovery codes),
  1 blog post, 1 service, seeded lead stages/sources/loss reasons; everything
  else empty. `0011_leads.sql` is applied but still uncommitted (owned by the
  Clients/Leads/Invoices session) — commit it unchanged.
- Typecheck passes. Tests: 1154 pass; one auth test timed out under full-suite
  load and passes alone.
- Uncommitted Leads + Clients edits belong to another session; not touched.

## Wiring

- **Public site uses no Backend2 at all.** Home, work, blog (reads/likes),
  booking + video room, contact form, chat widget, RSS and sitemap use the
  legacy backend; about/faq/services/stack/legal use static content files
  plus legacy content overrides. Public blog comments have no UI.
- **Dashboard** is on Backend2 except: Overview (stale "not built yet"
  placeholder listing built modules as unbuilt) and Invoices (placeholder).
  The guard still falls back to the legacy session unless
  `BACKEND2_OWNER_AUTH=required`.
- Specs without code: invoices, analytics, ai-assistant.
- Legacy chat: `src/backend/modules/chat`, knowledge file + optional Gemini
  (`CHAT_PROVIDER`, default `off`), transcripts in legacy tables, no viewer.
- No analytics provider anywhere.

## Security (no critical/high)

1. Medium: `NODE_ENV` is read at runtime (`auth/config.ts:27`,
   `security/local-only.ts`, `booking/booking.guard.ts:51`); on the Worker it
   is probably unset, so missing `AUTH_V2_SECRET` falls back to a public
   development key, missing Turnstile secret skips the check, and cookies may
   lose `Secure`. Must be fixed before V2 runs in production.
2. Low: local fence trusts the `Host` header when a built server listens on
   all interfaces.
3. Low: password sign-in limited per IP only (TOTP still required).
4. Low: V2 blog likes are unauthenticated toggles; comments have no
   Turnstile; `x-forwarded-for` fallback off Cloudflare bypasses limits.

## Performance / SEO

- High: `dashboard.content.tsx` imports `parseContentSearch` from the editor
  page, pulling ~100 KB (editor + TanStack Form) into the public entry bundle.
- High: hero image `/images/yaman-cutout.png` is 654 KB PNG, no WebP/srcset.
- Medium: all three languages' copy (~105 KB) ships on every page; one 232 KB
  CSS file includes dashboard/admin rules.
- Medium: V2 public project list is N+1 (`project.service.ts:346-357`).
- Medium: legacy home loads all posts/projects without LIMIT.
- Low: sitemap/RSS lack Cache-Control and `<lastmod>`; blog page 2+ canonical
  points to page 1; root-level 404 not noindexed; ~32 MB unused images in
  `public/images`; missing indexes for client name sort and lead
  `stage_changed_at`.

## Docs drift

`clients.md`/`leads.md` status lines say "planning"; `foundation.md` module
list/meanings are stale; `dashboard.tsx:21` comment and `NotBuiltYet.tsx`
copy are stale.

## Fixed after the review (23 Sep 2026, overnight)

- Public bundle: route search parsers no longer pull the Content editor,
  validation schemas or contracts into every page (entry 221 → 185 KB gzip).
- Hero portrait served as AVIF/WebP (654 KB PNG → 24 KB), same look.
- Sitemap/RSS `Cache-Control`; root 404 `noindex`.
- V2 public project list: parallel loads instead of ~72 sequential queries.
- Security 1: a Vite production build now counts as production even when the
  Worker has no `NODE_ENV` (`security/runtime-mode.ts`).
- Security 3: password sign-in also limited per account (30 per hour, any
  address); the passkey route is not counted, so the owner cannot be locked out.
- Security 4 (part): `x-forwarded-for` is ignored in production.
- Still open: legacy home loads all posts/projects (goes away at the public
  cutover), one-language-per-visitor bundles (same), V2 blog like toggles and
  comment Turnstile (decide at the Blog public cutover), sitemap `<lastmod>`,
  ~32 MB unused images in `public/images` (deleting needs the owner's OK).

The page-by-page public plan is `public-cutover.md`.
