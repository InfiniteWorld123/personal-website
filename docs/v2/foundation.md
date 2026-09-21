# Personal Platform V2 Foundation

Status: approved product foundation. This document records only decisions made
with the owner. It is not a detailed implementation specification for any
module.

## Purpose

Rebuild the private dashboard and the complete backend so the owner understands
and trusts the whole system. The public website keeps its current design and
visitor experience, but it will eventually use the V2 backend and database.

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

The intended Dashboard V2 navigation currently contains:

1. Overview
2. Projects
3. Calendar
4. Inbox
5. Leads
6. Content
7. Blog
8. Invoices

Video calls belong to the booking and calendar domain. Their exact navigation
placement is undecided.

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
- authentication and session design;
- V2 database hosting and environment strategy;
- data-import scope;
- exact dashboard information architecture and visual system;
- detailed behavior of every module;
- email providers and mailbox protocol;
- configuration and environment-file consolidation;
- deployment and cutover mechanics.

Nothing in the legacy implementation silently answers these questions.
