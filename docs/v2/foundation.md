# Personal Platform V2 Foundation

Status: approved product foundation. This document records only decisions made
with the owner. It is not a detailed implementation specification for any
module.

## Purpose

Rebuild the private dashboard and the complete backend so the owner understands
and trusts the whole system. The public website keeps its current design and
visitor experience, but it will eventually use the V2 backend and database.

## Owner communication rule

All implementation agents must follow the mandatory communication rule in
`AGENTS.md`. They speak to the owner in very simple Arabic even when the owner
writes English, using natural right-to-left Arabic prose, explain any necessary technical word immediately in plain
language, and say whether it affects local work now or only a later public
release. They lead with the outcome and required decision, keep English
identifiers inside backticks, avoid unnecessary internal detail, ask bounded
batches of material questions while stating how many remain, and explain an
external change plainly before taking it. This rule applies to every V2 module
and is part of a complete handoff, not an optional writing preference.

V2 is a clean rewrite, not an in-place refactor of the legacy backend.

## Approved boundaries

- The new private interface lives at `/dashboard`.
- The new backend code lives under `src/backend2/`.
- V2 uses a new, clean PostgreSQL database with new migrations.
- The existing `/admin`, legacy backend, and legacy database remain operational
  during the transition.
- The public website is not being visually rebuilt.
- The public website will eventually use Backend2 for all server-owned data and
  operations.
- Dashboard V2 is English-only initially. Arabic dashboard support is deferred.
- The public AI assistant remains a public-site feature. There is no AI
  assistant inside Dashboard V2.
- Existing service-pricing PDFs are preserved unchanged.

## Legacy and V2 coexistence

During development, both systems must be able to exist without route, database,
or behavior collisions.

```text
Legacy system                      V2 system
-------------                      ---------
/admin                             /dashboard
src/backend/                       src/backend2/
legacy database                    new V2 database
current public API                 new API namespace to be decided
```

No V2 module may silently write to both databases. Data migration and cutover
need their own approved specification, verification, and rollback plan.

The exact temporary and final API namespaces are architecture decisions still
to be made. `/api/v2` is a possible transition namespace, not an approved final
contract.

## Public website preservation contract

The current public website is accepted and stays visually intact. Backend2 work
may change transport adapters, queries, server functions, shared contracts, and
data mapping required to connect it to V2. It must not casually change:

- page layout or information hierarchy;
- typography, colors, spacing, motion, imagery, or responsive behavior;
- public routes or language behavior;
- approved public copy;
- visitor-facing behavior unrelated to the active V2 module.

Any unavoidable visitor-visible change must be proposed and approved before it
is implemented.

## Dashboard modules

**The navigation is a starting point, not a fixed shape.** It is expected to
grow, shrink and reorder as modules are planned and built, and no count is
approved — not eight, not nine, not any number. A module that turns out to
need its own place gets one; a section that turns out to belong inside another
loses one. What stays fixed is the rule that a section appears only when the
owner has agreed what it is for, and that adding or removing one is a decision
made with the owner rather than a side effect of building something else.

Where the list stands today:

- Overview
- Projects
- Services
- Calendar
- Inbox
- Leads
- Clients
- Content
- Blog
- Media
- Invoices

Services was added on 22 Sep 2026, directly after Projects, when the Services
module was built; `docs/v2/services.md` owns it.

Media was added on 22 Sep 2026, when the shared library was built: it is a
place the owner visits to organise folders, delete old files and see which of
their files a visitor can currently reach, and none of that belongs inside the
picker other modules open. `docs/v2/media.md` records that decision.

Clients was added on 23 Sep 2026, directly after Leads (`docs/v2/clients.md`).
Analytics (`docs/v2/analytics.md`) and a private conversation page for the
public assistant (`docs/v2/ai-assistant.md`) are planned; each gets its menu
item only when its approved screen works.

Video calls belong to the booking and calendar domain. Their exact navigation
placement is undecided.

The code is the current answer, not this list — `dashboardNavigation` in
`src/frontend/dashboard/dashboard-navigation.ts`, with a test asserting the
order. When the two disagree, the code is what the owner is actually using and
this paragraph is what needs updating.

### Current module meanings

- **Projects:** create and edit portfolio projects, and control whether each
  project is visible on the public website.
- **Calendar:** booking management and its related operational details.
- **Video calls:** calls associated with booked appointments.
- **Inbox:** a compact real mailbox, not merely lead messages. It sends and
  receives email and supports attachments. Providers, folders, threading,
  storage, search, spam handling, and retention are not designed yet.
- **Leads:** the customer-lead management system. Its exact workflow is not
  designed yet.
- **Content:** management of public-site content. Its exact editable boundary is
  not designed yet.
- **Blog:** the article-management system. Editor, languages, publishing rules,
  media, and workflow are not designed yet.
- **Media:** one private library of files that every module selects from, so a
  file is uploaded once and reused anywhere. Built; `docs/v2/media.md` owns it.
- **Invoices:** the invoicing system. Its legal and operational boundary is not
  designed yet.
- **Public AI assistant:** a visitor-facing assistant using retrieval from an
  approved knowledge source. Knowledge management through the dashboard is a
  possible later decision, not current scope.

These descriptions establish direction only. They do not authorize an agent to
invent business rules, database tables, API fields, or UI flows.

## Database rule

V2 starts with a new database and a new migration history. Legacy migrations are
evidence about the old system, not the schema specification for V2.

Before V2 touches real data, planning must decide:

- development and production database environments;
- authentication ownership;
- migration numbering and execution;
- what legacy data must be imported;
- data mapping and validation;
- cutover order and rollback;
- backup and restore verification.

## Authentication timing during local development

The owner does not want to build V2 authentication as part of the initial,
local-only Projects work. The future single-owner V2 login uses email and
password, followed by authenticator-app MFA with one-time recovery codes.
The later Auth-module planning also approved passwordless passkey sign-in as
the primary route; email, password, and Authenticator remain the fallback.
The passkey is verified on the owner's device and does not send a fingerprint
to the website. `docs/v2/auth.md` owns the detailed sign-in and session policy.
The owner also wants to remove the Cloudflare human-verification challenge
from the future sign-in experience. Detailed recovery and session policies,
and whether Turnstile should also be removed from public contact and booking
forms, are separate decisions for that later module.
MFA protects the account after a password attempt; it does not replace
anti-abuse controls such as login rate limiting. Those controls must be reviewed
when the sign-in challenge is removed.

This postponement is not approval to expose owner-only V2 APIs without access
control. Until V2 authentication is specified and implemented, private V2
operations may run only in a verified local development environment and must
be unavailable from non-local or production deployments. Keep the existing
legacy `/admin` authentication and current `/dashboard` guard in place during
this phase; do not remove live Turnstile or other existing protections while
building Projects. A remote preview or production cutover needs its own
approved authentication and security plan.

## Documentation reset

Legacy planning, architecture, roadmap, design, and decision Markdown files were
deleted when this foundation was created. Git history remains the recovery path;
deleted documents are not V2 requirements.

The only preserved legacy documents are:

- `docs/services/Kurzfassung-Ueberblick.pdf`
- `docs/services/Leistungen-Preise-Verkauf.pdf`

Future V2 documentation belongs under `docs/v2/`. Each module receives a
focused specification only when it becomes active.

## Planning and delivery method

Work proceeds one bounded module at a time:

1. Discuss the module with the owner.
2. Record goals, non-goals, terminology, UX, data, business rules, API
   contracts, permissions, failure states, security, tests, and definition of
   done.
3. Resolve every material unknown with the owner.
4. Approve the Markdown specification.
5. Give the approved specification to the implementation agent.
6. Review the implementation against the specification.
7. Verify types, tests, build, runtime behavior, and relevant browser flows.

Planning must be detailed enough that implementation does not need to invent
product behavior. Detail is added just in time; the whole platform is not frozen
up front.

## Cutover principle

Legacy code, routes, configuration, and data are removed only after their V2
replacement is complete and verified. Final cutover must include public-site
smoke tests and authenticated dashboard tests. After cutover, `/admin` should
normally redirect to `/dashboard` rather than becoming an unexplained 404.

## Git delivery branch

V2 work is pushed to a separate `main-v2` branch while `main` remains in place.
Completing V2 does not itself delete or rename `main`: the final Git branch
change is a separate cutover action after the platform has been completed and
verified with the owner.

## Decisions still required

The following are deliberately open:

- Backend2 framework and internal architecture;
- final public and private API namespaces;
- MFA recovery and authentication/session design before any non-local V2 private API;
- V2 database hosting and environment strategy;
- data-import scope;
- exact dashboard information architecture and visual system;
- detailed behavior of every module;
- email providers and mailbox protocol;
- configuration and environment-file consolidation;
- deployment and cutover mechanics.

Nothing in the legacy implementation silently answers these questions.
