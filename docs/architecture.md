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

External services: Resend (email), Cloudflare R2 (images), PostHog EU
(analytics), Google Calendar (booking v2), Stripe (payments, phase 5).

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
│   ├── motion/               # reveal · tilt · magnetic · word split (no library)
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

Cloudflare R2 behind the backend `image-storage` abstraction (D21). PostgreSQL
stores storage keys and metadata; responses receive generated URLs, and
resizing happens through Cloudflare's image transformations on the bucket's
public origin. The R2 client signs its own SigV4 requests over `fetch`, so the
same code runs on a Worker, on a server, and in tests.

Project screenshots and blog images are not personal data. Client records,
leads, and invoices live only in PostgreSQL.

## Analytics

PostHog Cloud EU with a real consent banner. Business metrics come from this
database. A small cached server-side query pulls a handful of traffic metrics
into the admin overview. Deep analysis stays in PostHog's own dashboard.

## Background jobs

On Cloudflare, scheduled work runs on Cron Triggers, which are available on the
free plan. Jobs: booking reminders, PostHog metric refresh, and invoice
due-date checks. Nothing is built yet — `pg-boss` is not installed, and B5 is
where the job system is first needed.

`pg-boss` on the existing PostgreSQL instance remains the plan for whenever the
application moves to a server (D22), since a persistent process makes it the
simpler tool. No Redis in either case.

## Deployment

Cloudflare Workers, with PostgreSQL hosted externally in an EU region and
reached through Hyperdrive (D22). Cloudflare also carries DNS, TLS, CDN, DDoS
protection, and the R2 bucket. The public origin is `yamanwarda.de`.

Server-rendered CPU time is measured on a staging hostname before the domain is
cut over: the free plan allows 10 ms per invocation, and this application
renders React on the server.

PostgreSQL stays ordinary PostgreSQL and D1 is never used, so the move to a
server later is a connection change rather than a migration.

**The intended destination** is still a Hetzner box running Coolify with
PostgreSQL in Docker beside the application, revisited when income is steady
(D2, D22). Its backup obligations apply from the day it is adopted: Hetzner
snapshots, a nightly `pg_dump` to a Storage Box, and `unattended-upgrades`.

A restore has to be tested once before phase 5 stores real invoices. An untested
backup is not a backup.
