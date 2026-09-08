# System Architecture

Covers the system-wide shape only. Tables live in `data-model.md`. Rationale
lives in `decisions.md`.

## Overview

One TypeScript application built with TanStack Start. The React frontend and the
Elysia API are served from the same origin. One PostgreSQL database.

```text
Browser
  |  React · TanStack Router · React Query · TanStack Form
  v
TanStack Start / Nitro
  |  /api/*  (forwarded by the /api/$ route)
  v
Elysia
  |  Valibot validation -> controller -> service
  v
pg.Pool · parameterized SQL
  v
PostgreSQL
```

External services: Resend (email), Cloudinary (images), PostHog EU (analytics),
Google Calendar (booking v2), Stripe (payments, phase 5).

## Folder structure

```text
src/
├── backend/
│   ├── db/
│   │   ├── migrations/       # numbered SQL, schema source of truth
│   │   ├── seed/
│   │   ├── migrate.ts
│   │   └── pool.ts
│   ├── modules/              # each: *.route.ts · *.controller.ts · *.service.ts
│   │   ├── auth/  admin/
│   │   ├── content/  projects/  services/  posts/
│   │   ├── leads/  bookings/  availability/
│   │   ├── clients/  engagements/  invoices/  payments/  subscriptions/
│   │   └── referrals/  analytics/
│   └── shared/               # error-handler · response · mailer · image-storage · jobs
├── frontend/
│   ├── api/                  # transport only, never imports React
│   ├── components/           # ui · layout · shared
│   ├── features/             # reusable domain components + hooks
│   ├── pages/                # public/ and admin/
│   ├── hooks/                # shared React hooks (reduced motion)
│   ├── i18n/                 # de · en · ar + RTL
│   └── lib/
├── routes/                   # thin TanStack routes, no markup
└── shared/                   # env, types, Valibot schemas used by both sides
```

## Backend

Organized by business module. Every request follows one direction:

```text
HTTP request
  -> Elysia route + Valibot validation
  -> controller
  -> service (business rules)
  -> parameterized SQL
  -> shared response, or centralized AppError handling
```

`/api/*` is public. `/api/admin/*` requires a valid session with the `ADMIN`
role. Public responses are explicit projections, never raw rows.

## Database

PostgreSQL via `pg.Pool` with raw parameterized SQL. No ORM. Numbered SQL
migrations in `src/backend/db/migrations/` run in filename order and are the
schema source of truth. An applied migration is never edited; corrections ship
as a new migration.

## Authentication

Better Auth provides email/password authentication and sessions for exactly one
administrative user. Public registration is disabled. The admin is provisioned
through a controlled seed operation, not a public bootstrap route. There is no
second role and no client login.

## Content and i18n

Marketing content lives in the database with a translations table keyed by
language. Blog posts are single-language with a `language` column. The frontend
resolves language from the URL and falls back to German.

Editable content is a defined set of keys — headlines, body copy, service
descriptions, CTA labels. Page structure, layout, and section order stay in
code. See `decisions.md` D12.

## Booking

Availability rules live in this database. Slots are generated server-side in the
visitor's IANA timezone and validated again on submit to prevent double-booking
under concurrency. Confirmation email carries an `.ics` attachment and signed
cancel/reschedule links. Reminders run through `pg-boss` on the same PostgreSQL
instance.

Booking v2 adds a Google Calendar `freebusy` query so the personal calendar
blocks slots, and writes the confirmed booking back as a calendar event.

## Email

Outbound through Resend with React Email templates. Business records are always
persisted before the email is attempted; a failed send is logged and retried,
never allowed to lose the record.

Lead replies are sent from the admin. Inbound replies are threaded onto the lead
through an inbound-email webhook. This is not a mail client — see `AGENTS.md`.

## Images

Cloudinary behind a backend `image-storage` abstraction. PostgreSQL stores
storage keys and metadata; responses receive generated URLs. Project screenshots
and blog images are not personal data, so US-hosted delivery is acceptable.
Client records, leads, and invoices never leave the German server.

## Analytics

PostHog Cloud EU with a real consent banner. Business metrics come from this
database. A small cached server-side query pulls a handful of traffic metrics
into the admin overview. Deep analysis stays in PostHog's own dashboard.

## Background jobs

`pg-boss` runs on the existing PostgreSQL instance — no Redis. Jobs: booking
reminders, PostHog metric refresh, invoice due-date checks, nightly backup
verification.

## Deployment

Hetzner CX22 (Nuremberg or Falkenstein) running Coolify. Application and
PostgreSQL in Docker on the same host. TLS via Coolify. Backups: Hetzner
snapshots plus a nightly `pg_dump` to a Storage Box, plus `unattended-upgrades`.

A restore has to be tested once before phase 5 stores real invoices. An untested
backup is not a backup.
