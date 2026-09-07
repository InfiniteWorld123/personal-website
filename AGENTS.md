# Personal Platform — Agent Guide

Rules every AI agent and contributor follows on this repository.
Detailed decisions live under `docs/`. This file is intentionally short.

## Read Before Working

1. `docs/project.md` — what this platform is, who it serves, what is excluded.
2. `docs/architecture.md` — the system-wide technical picture.
3. `docs/data-model.md` — the tables and their boundaries.
4. `docs/roadmap.md` — phases, slices, and current focus.
5. `docs/decisions.md` — why things are the way they are. Read before proposing a change to them.
6. The current code, migrations, and tests for implemented behavior.

Do not read every document when the task concerns one slice.

## Source-of-Truth Rules

- `docs/project.md` owns product scope and boundaries.
- `docs/positioning.md` owns how the business is described to visitors.
- `src/backend/db/migrations/` is authoritative for the implemented schema.
  Never rewrite an applied migration; add a new numbered migration.
- Backend route, validation, service, and shared-type code is authoritative for
  the currently implemented HTTP contract.
- `docs/roadmap.md` owns delivery status and current focus.
- When documentation and implementation disagree, do not silently pick one.
  Report the mismatch and ask whether the task changes the plan or fixes the code.

## Product Invariants

- This platform serves one person: Yaman Warda. It is not a SaaS product.
- There is exactly one administrative user. Do not add organizations, tenants,
  team roles, staff permissions, or user registration.
- Clients and referrers are records in the database. They do not get accounts,
  portals, or logins.
- Market assumptions: Germany, EUR, Europe/Berlin time, German invoicing rules.
- The public site is trilingual: German, English, Arabic. Blog posts are
  written in one language each and carry a language tag.
- Never fabricate testimonials, client names, revenue figures, project counts,
  ratings, or years of experience. If a number is not real, it does not ship.
- Never promise business results the work cannot guarantee — no revenue lifts,
  no conversion percentages, no ranking guarantees.

## Scope Boundary

In scope across all phases: public marketing site, case studies, blog,
admin dashboard, content management, leads, bookings, clients, projects,
invoices, payments, subscriptions, referrals, analytics overview.

Explicitly out of scope. Do not build, plan, or advertise these:

- A full email client (IMAP sync, folders, threading a real mailbox).
  Lead conversations are the only email surface. See `docs/decisions.md` D11.
- A visual page builder or drag-and-drop layout editor.
  Content is editable; structure is code. See `docs/decisions.md` D12.
- Client portals, customer logins, or any second user role.
- Automated referral payouts or any programmatic movement of money out.
- A legal accounting system. Invoicing is an operational tool, not bookkeeping.
- Multi-currency, multi-country tax handling.
- Real-time chat, notifications infrastructure, or mobile apps.

## Backend Rules

- TypeScript, Elysia, Valibot, `pg`, parameterized raw SQL. No ORM without an
  explicit decision recorded in `docs/decisions.md`.
- Public routes use `/api`. Admin routes use `/api/admin` and require a valid
  session with the `ADMIN` role.
- Controllers stay thin. Business rules live in services. Request contracts live
  in shared validation and types. Expected failures go through the central error flow.
- Every schema change is a new numbered migration plus proportional service and
  HTTP verification.
- Public endpoints expose explicit field projections, never raw database rows,
  and never secrets, storage keys, internal notes, or client PII.
- Persist the business record before any optional side effect. A failed email
  must never lose a lead, a booking, or an invoice.
- Money is stored as integer cents, never floating point.
- Timestamps are stored as `timestamptz`. Booking logic always carries an
  explicit IANA timezone; never rely on server local time.

## Frontend Rules

- Route files are thin: URL behavior, boundaries, and page rendering only. No markup.
- Page components compose sections. Reusable domain components live under
  `features/`. Page-only sections stay with their page.
- API modules perform transport and do not import React.
- React Query owns server state. TanStack Router owns shareable URL state.
- TanStack Form owns non-trivial form state and validation.
- Components never call the backend client directly.
- No global client store until a real cross-page requirement exists.
- `shadcn/ui` provides owned accessible primitives, not the visual identity.
- Every page works in German, English, and Arabic, including RTL layout.
- Every animation respects `prefers-reduced-motion`. Motion is progressive
  enhancement: content is readable and complete with animation disabled.
- Preserve loading, empty, error, and success states. An admin table without an
  empty state is unfinished.

## Delivery Rules

- Work in small vertical slices as listed in `docs/roadmap.md`. One slice per session.
- Do not broaden a slice because an adjacent feature sounds useful. Note it and move on.
- Phases 0 and 1 land on the `platform` branch. After cutover, work is
  incremental on `main`.
- Preserve existing user changes. Avoid unrelated refactors.
- Before completing a slice, run the relevant subset of: format, typecheck,
  tests, build, and a real runtime check.

## Missing or Conflicting Information

When a requirement is missing, state what is unknown and ask. Do not invent
product behavior, prices, service descriptions, or legal text.
