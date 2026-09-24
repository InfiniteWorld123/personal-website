# Global search V2 — Dashboard

Status: **owner decisions taken on 24 Sep 2026; not built yet.** Build after
the current Dashboard screens (Invoices, Analytics/Overview, Assistant) land.
Follows the `AGENTS.md` order: backend → tests → frontend questions →
Design Lab → owner approval → production UI.

## Owner decisions

1. **Dashboard only.** Owner-private search across the owner's own records:
   Clients, Invoices (and subscriptions), Inbox conversations, Blog articles,
   Projects, Services, Calendar appointments, Leads, and Media files. No
   public-site search in this scope.
2. **Opens with ⌘K (Ctrl K on Windows) and from the existing top-bar search
   field.** A palette over any Dashboard page; results grouped by section;
   arrow keys move, Enter opens the record in its own module.

## Boundaries

- Read-only. Search never changes a record and never becomes a second place
  to edit one.
- Owner routes only (same fence and session as every owner route); nothing
  is exposed publicly. Private text (message bodies, notes) may be matched but
  results show a short, safe excerpt only.
- Each module owns what is searchable in it, behind a narrow read interface,
  so a module change does not rewrite search. Trash and deleted items are
  excluded unless a later decision adds them.
- Bounded: a small number of results per section, a "see all in <module>"
  link into that module's own filtered list; no unbounded scans.
- Test data (test-mode invoices) is labelled as such in results.

## To decide while building (engineering, reversible)

PostgreSQL full-text (`to_tsvector` with `simple` config across DE/EN/AR) or
trigram matching; indexes per searched column; debounce and request
cancellation in the palette; keyboard and screen-reader behaviour; recent
searches (kept in the browser only).

## Backend implementation record — 24 Sep 2026

- `GET /api/v2/owner/search?q=&limit=` (owner fence, `no-store`): `q` 2–100
  characters, `limit` 1–10 per section (default 5). Ten sections in a fixed
  order — Clients, Leads, Invoices, Subscriptions, Inbox, Calendar, Blog,
  Projects, Services, Media — each `{ key, label, state, items, hasMore,
  moreHref }`; an item is `{ id, title, subtitle, badge, href }` with `href`
  opening the record in its own module.
- Matching: case-insensitive substring (`ILIKE`, typed `%`/`_` literal) on
  the fields a record is recognised by; the owner's working copy for
  Blog/Projects/Services. Trash is left out (Inbox, Clients, Leads). Inbox
  also matches message words but shows only the stored conversation preview.
  Test invoices carry a `TEST` badge. One failing section answers `error`
  and the rest still answer.
- No new migration: at a single owner's scale these bounded queries are fast;
  revisit with trigram indexes if a table grows large.
- Verified: `src/tests/backend2-search.test.ts`.

## Design Lab approval — 24 Sep 2026

The owner approved the Search Design Lab (https://claude.ai/artifact/QLijC5SbZMXETD7j5ipdvM)
as shown: ⌘K / Ctrl K and the top-bar field, grouped results with "See all in
…", arrow keys and Enter, recent searches kept in the browser, a full-screen
palette on phones, and the empty, nothing-found, searching and one-section-
failed states.
