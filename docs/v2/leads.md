# Leads V2 — product, backend, and frontend plan

Status: **Backend2 and the Dashboard screens built and committed (23 Sep 2026);
see the implementation records below. The Inbox/Booking “Create lead” buttons
are still open.** The owner has chosen the
business workflow below. Read `docs/v2/clients.md` for the planned Client
file and the `Won` conversion and reversal contract. Do not claim Leads is
complete before conversion works.
This document alone does not approve deployment, public cutover, a commit,
or a push.

## Owner communication — mandatory

Use very simple Arabic with the owner, even when the owner writes English, in
natural right-to-left Arabic prose. Lead with what happened and whether the
owner needs to act. Explain necessary technical terms immediately in plain
language; distinguish local development from publication; put English names
in backticks. Ask only bounded, material questions and say how many remain.
Follow the complete rule in `AGENTS.md`.

## Purpose and boundaries

`/dashboard/leads` is the owner's private place to manage people who may become
clients. A Lead is created only by the owner's explicit action: directly in
Dashboard, through an owner-clicked **Create lead** action in Inbox or Booking,
or through a reviewed CSV import initiated by the owner. Receiving a message,
booking, visiting the site, or using the public AI assistant never creates a
Lead automatically. When an owner-initiated action starts from Inbox or
Booking, it may prefill available contact details, but the owner checks and
saves them; ordinary Inbox and Booking operations do not depend on Leads.

Leads does not own email conversations, appointments, services, invoices,
campaigns, scraping, lead purchases, or a public form. A source called
`Google Maps`, `AI`, or `Purchased list` is a label for the owner's records,
not an integration that obtains or contacts people. The service a person is
interested in can be written in notes; do not add a Services foreign key or
make later service-catalogue edits change old Leads. Legacy Leads are test
data and are not imported into V2; do not delete legacy data during this work.

## Lead file and reference data

- Creating one Lead requires name, email, phone, country, and source. Company
  and free-form owner notes are optional. This is the latest owner decision:
  a person without a company leaves it empty. `New` is the initial stage.
- Country uses one searchable, normalized worldwide country list with stable
  codes, not user-created spelling variants such as `Germany` and
  `Deutschland`. Show readable country names. If country is missing or cannot
  be mapped during CSV import, reject that row with a clear reason; do not
  silently invent a country.
- Source is a private owner-managed list. Seed a small, editable set of useful
  choices (for example WhatsApp, Instagram, Facebook, Inbox, Booking, cold
  outreach, SEO, Google Maps, AI, purchased list) plus an immutable `Unknown`
  choice. The owner may create and rename sources, select `Unknown` when the
  origin is not known, and hide sources from new selection. Hiding an in-use
  source never changes its meaning on existing Leads. Only an unused source
  may be deleted. A source name alone causes no automation.
- Reject blank or malformed required fields with field-level messages. Both
  email and phone remain required for manual entry and CSV rows unless the
  owner later changes this rule; an incomplete row is reported as rejected.
  Normalize fields for matching and search without altering the owner's notes.
- On manual create/edit, a matching email or phone on another Lead raises a
  clear duplicate warning. The owner may inspect the match, continue anyway,
  or stop. Do not silently merge two people. Client duplicate handling at
  `Won` is a separate rule below.

## Niche — owner request, 23 Sep 2026

Each Lead has an optional **niche** (salon, plumbers, roofers…) from the one
owner-managed list shared with Clients (`v2_niches`, built with Clients; see
`clients.md`, "Niches"). The owner can add a niche while editing a Lead.
Hidden niches stay on the Leads that have them. At `Won`, the Lead's niche is
copied to a newly created Client (pass `nicheId` to `convertLeadToClient`);
linking to an existing Client does not change that Client's niche. The Leads
migration must add its own `lead.niche_id` key and include Leads in the
niche's usage count so an in-use niche cannot be deleted.

## Stages and outcomes

- The four permanent stages are `New`, `Contacted`, `Won`, and `Lost`. They
  cannot be deleted or repurposed. The owner may add, rename, order, and
  delete custom active stages such as `Qualified`. Show `New` first and the
  terminal outcomes `Won` and `Lost` after active stages. Keep stage IDs
  stable when a custom display name changes. A custom stage containing Leads
  cannot be deleted until those Leads move elsewhere.
- Changing a Lead to `Lost` requires exactly one reason selected from
  owner-managed choices, with optional explanatory notes. `Other` lets the
  owner type a reason. Initial reasons can include not interested, no reply,
  price, chose someone else, poor fit, and owner does not wish to work with
  this person. The owner may create/rename/hide reasons; hiding an in-use
  reason preserves old Lead records. `Lost` leaves the active view and appears
  in its own browsable list; it is not deleted.
- A `Lost` Lead can return to `New`, `Contacted`, or another active stage if
  the person changes their mind. The former lost reason remains historical
  context rather than a currently active loss. Do not infer renewed consent
  to contact or send automatic messages.
- Moving to `Won` creates a **Person** Client by default, even if the Lead has
  a company name. Copy contact fields, optional company affiliation, and
  notes into the Client's independently editable file. When an existing
  Client matches the email, ask the owner to link it instead of creating a
  duplicate; preserve its notes and append the Lead notes once. Preserve the
  Lead and its conversion link/history. This is the only automatic
  cross-module creation explicitly requested. `docs/v2/clients.md` owns the
  full create/link, validation, and failure behavior; Leads implementation
  must not fake conversion or mark the whole module finished without it.
- If a `Won` Lead returns to an active stage, keep its linked Client intact.
  The owner may later mark that Client Inactive or move it to Trash separately.
  Returning this Lead to `Won` again reuses the same Client; it cannot create
  a duplicate or append the same notes again. See `clients.md`.
- Stage transitions initiated from either List or Board use the same server
  rules. Dropping on `Lost` asks for the reason and optional notes before the
  change is saved. Dropping on `Won` follows the same Client creation or
  existing-Client choice as the normal stage control. Cancelling a dialog
  leaves the Lead in its previous stage.

## One follow-up at a time

- Each Lead may have at most one **open** follow-up. It has a date, time, and
  optional short note such as “Call them” or “Send proposal.” The owner may
  complete, postpone, or cancel it; then another follow-up may be created.
  Show a minimal record of completed/cancelled follow-ups inside the Lead so
  the owner can see what happened. Completing a follow-up never deletes the
  Lead.
- At the chosen time, show a due indicator and Dashboard notification until
  the owner completes, postpones, or cancels it. No email or SMS follow-up
  notification in this version. Use the owner's `Europe/Berlin` timezone and
  handle daylight-saving changes consistently.
- Moving to `Lost` automatically cancels an open follow-up. Moving to `Won`
  closes an open follow-up as no longer needed. These are recorded as
  cancellations, not falsely shown as completed work. Reopening a lost Lead
  does not recreate its old follow-up; the owner chooses a new one.

## CSV import and deletion

- The owner can upload a CSV file from their computer, map columns to the
  required fields, choose or map the source/country, and preview the result
  before confirming the import. The same required-field and normalization
  rules apply as manual entry. Missing or invalid values and duplicate
  email/phone records are reported by row. The owner may import valid rows
  while invalid rows are rejected, for example 980 accepted and 20 rejected.
  Provide a clear, downloadable rejection report without leaking records to
  other users. An accidental retry must not duplicate already imported rows.
- CSV import is manual data entry at scale. It does not perform scraping,
  automatically send outreach, create Inbox conversations, or create Booking
  appointments. Set practical file, row, and batch limits from the actual
  runtime, with clear errors; do not promise an unlimited single request.
- A Lead can be moved to Trash and restored. Browsable Trash is paginated.
  Permanent deletion from Trash needs an explicit danger confirmation. Do not
  cascade deletion into Inbox, Booking, Clients, or shared Media. No automatic
  deletion timer is approved. The owner must review real-data retention before
  a public launch.

## Dashboard experience

- Dashboard V2 remains English-only. Provide a visible List/Board switch for
  the same Lead collection. List has search, stage/source/country filters,
  deterministic order, and bounded server-side pagination. Board shows
  stage columns with counts and bounded per-column pages or `Load more`, so
  thousands of Leads do not load at once. Both views expose the same Lead
  details and stage actions. Provide separate, discoverable `Lost`, `Won`,
  `Follow-ups`, and `Trash` views/filters without copying records.
- Board cards can be dragged between stages. Dragging changes only the dragged
  Lead; it must never swap a second Lead into another stage by accident.
  Provide an equally usable stage-change control for keyboard, touch, and
  failed drag attempts. Save server-confirmed changes, show progress/errors,
  and restore the previous view if saving fails. No promise of manual card
  ordering is made; this drag action changes stages.
- The owner prefers the already installed `swapy` library. Its official model
  swaps one item per slot, so the Design Lab must prove a reliable multi-card,
  multi-column flow using the installed version before production UI work.
  Test moving one card to an empty destination, loaded-page changes, custom
  stages, terminal dialogs, keyboard fallback, and failure rollback. If it
  cannot meet the interaction without moving another Lead, explain the result
  and ask the owner about an alternative drag library; do not silently replace
  the requested behavior. Review the installed license and intended business
  use before release; dependency presence alone is not a license decision.
- Show loading, empty, saving, import preview/result, duplicate, invalid,
  unauthorized, forbidden, and missing-record states as appropriate. Forms
  follow the shared TanStack Form and accessible validation rules in
  `AGENTS.md`.

## Proposed Backend2 contract

Use Backend2 and the V2 database. Only authenticated owner routes can read or
change Leads or their notes, sources, follow-ups, reasons, CSV reports, and
Trash. Use bounded server-side pagination for independently browsable lists,
including stage columns. Keep transport, domain rules, and persistence
separate. Proposed route purposes, to reconcile with current Backend2 style:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET/POST` | `/api/v2/owner/leads` | Paginated search/filter list and manual creation |
| `GET/PATCH` | `/api/v2/owner/leads/:id` | Private Lead detail and edit |
| `POST` | `/api/v2/owner/leads/:id/stage` | Change stage, including Lost/Won rules |
| `GET/POST/PATCH/DELETE` | `/api/v2/owner/leads/stages` | Ordered custom stage management |
| `GET/POST/PATCH/DELETE` | `/api/v2/owner/leads/sources` | Owner-managed source options |
| `GET/POST/PATCH/DELETE` | `/api/v2/owner/leads/loss-reasons` | Owner-managed Lost reasons |
| `GET/POST/PATCH/DELETE` | `/api/v2/owner/leads/:id/follow-up` | One open follow-up and its actions |
| `POST` | `/api/v2/owner/leads/imports/preview` | Validate/map CSV without saving Leads |
| `POST` | `/api/v2/owner/leads/imports` | Idempotent partial-valid-row import |
| `GET` | `/api/v2/owner/leads/imports/:id` | Import result and rejected-row report |
| `POST` | `/api/v2/owner/leads/:id/trash` | Move Lead to Trash |
| `POST` | `/api/v2/owner/leads/:id/restore` | Restore Lead |
| `DELETE` | `/api/v2/owner/leads/:id` | Confirmed permanent delete from Trash |

Choose exact paths and payloads after inspecting current Backend2 conventions;
do not let route naming change the product rules. Lead IDs remain private and
stable. The `Won` action must be atomic with Client create/link, so failure
leaves both records in their prior state; define that cross-module contract
with `clients.md` before building this transition. No public Lead API.

## Verification and handoff

Verify manual create/edit, required/optional fields, normalized country and
source, duplicate warnings, custom-stage ordering and in-use deletion guard,
Lost reasons and reopening, one-open-follow-up rule and due notifications,
Won Client create/link and failure rollback under `clients.md`, CSV
preview/partial import/retry/report, Trash/restore/permanent deletion, private
access denial, search/filter/pagination, and List/Board agreement. Use only
fictional test contacts. Run typecheck, relevant tests, build, and real local
runtime/browser checks proportionate to the finished phase.

### Handoff prompt for Claude — execute on the owner's read-to-build request

> This is an implementation request, not a request for a summary. Read
> `AGENTS.md`, `docs/v2/foundation.md`, this entire `docs/v2/leads.md`, and
> the relevant Auth, Inbox, Booking, and `docs/v2/clients.md` specifications.
> Inspect current Backend2, the legacy Leads UI as evidence, existing V2
> migrations, and the working tree; preserve unrelated work and current live
> behavior. Ask the owner only about material unanswered backend decisions,
> especially any missing Clients conversion contract. Then implement and
> verify the complete agreed Backend2 phase. Do not silently create Leads
> from email or appointments, import legacy test data, add a Services
> relationship, or send outreach. Report what was verified and what remains
> dependent on Clients.
>
> After backend verification, ask only material frontend questions. Use the
> `frontend-design` skill to present an isolated interactive Leads Design Lab
> with rendered desktop/mobile List and Board, stage drag, Lost/Won dialogs,
> Follow-ups, CSV preview/errors, Trash, and empty/loading/failure states.
> Prototype `swapy` against the multi-card stage move before promising it in
> production; show the owner the result and any fit or license issue in plain
> Arabic. Wait for explicit visual approval. Then build the approved
> production frontend with TanStack Form where applicable, test connected
> flows, review the exact module diff, and commit/push only on the owner's
> explicit Git request, only to `main-v2`. Do not deploy or cut over legacy.

## Backend implementation record — 23 Sep 2026

Backend2 Leads is built and verified. `0011_leads.sql` was applied to the
owner's Neon V2 database on 23 Sep 2026 with the owner's explicit approval
(the owner ran `bun run db2:migrate`; 0008–0011 went in together). From now
on `0011` must never be edited: any schema change is a new migration.

- **Migration** `0011_leads.sql`: `v2_leads`, `v2_lead_stages` (the four
  permanent stages plus custom active ones), `v2_lead_sources` (locked
  `Unknown`), `v2_lead_loss_reasons` (locked `Other`), `v2_lead_follow_ups`
  (a partial unique index allows one open follow-up per Lead),
  `v2_lead_imports` and `v2_lead_import_rejections`, and `v2_lead_defaults`.
  The migration carries no rows: the default stages, sources and reasons are
  written on first use, once; a default the owner deletes stays deleted.
- **Routes** under `/api/v2/owner/leads` (owner fence, `no-store`): list with
  `view=active|won|lost|all|trash` and `stage`, `source`, `country`, `niche`,
  `search` filters (the Board asks one stage per column, each with its own
  page); create/edit with duplicate warnings (`LEAD_DUPLICATE`, send
  `allowDuplicate` to continue); `POST /:id/stage` for every move (List and
  Board alike); stages, sources and loss-reasons management; one follow-up
  (`POST|PATCH /:id/follow-up`, `/complete`, `/cancel`), `GET /follow-ups`
  and `GET /follow-ups/due-count` for the Dashboard notification; CSV
  `imports/preview`, `imports` (idempotent), import results, a CSV rejection
  report, Trash, restore and confirmed permanent delete.
- **Lost** needs one reason (typed text for `Other`) and cancels the open
  follow-up as `lost`. Reopening keeps the last loss as history and never
  brings back an old follow-up.
- **Won** calls `convertLeadToClient` in the same transaction: the owner
  chooses create or link the first time; a Client that already has the
  Lead's email refuses `create` with the candidates. On success the open
  follow-up closes as `won`. Moving a Won Lead back leaves its Client alone;
  a second Won reuses it with no choice needed. The Lead's niche is copied
  to a new Client.
- **Follow-ups** are entered as a Europe/Berlin date and time; the server
  converts. A time skipped by the spring clock change moves forward an hour;
  a time that happens twice in autumn means the first.
- **CSV** (engineering choices, change on request): at most 2 MB and 5,000
  rows per file; comma, semicolon or tab; the header suggests a column
  mapping in English or German. Country and source come from a column or one
  choice for the whole file; a row whose own country, source or niche cannot
  be matched is rejected, never guessed. Rows duplicating an existing Lead or
  an earlier row (email or phone) are rejected. The report keeps the file's
  own columns plus row number and reason, and stays until the owner deletes
  it. Formula-looking cells are made inert in the report.
- **Deleting** a Lead permanently removes its follow-ups; a Client it became
  stays and still shows that it came from a (now deleted) Lead.
- **Verified**: `src/tests/backend2-leads.test.ts` (32 tests) and a real run
  over the `pg` driver against a throwaway local database.
- **For the Design Lab**: the installed `swapy` 1.0.5 is dual-licensed —
  GPL-3.0 or a paid commercial licence. Its model swaps items between slots;
  the lab must prove a one-card move without swapping another Lead.
- **Design Lab** published 23 Sep 2026 as a private artifact:
  https://claude.ai/artifact/F3S3JNrTAkbNxbU2CdmHWF — awaiting the owner's
  visual approval and one decision: the Board's drag library. The lab runs the
  real `swapy` 1.0.5; a one-card move works only by allowing drops into an
  empty slot per column (so no second Lead moves). Recommended for
  production: `@dnd-kit` (MIT), because Swapy is built to swap and needs a
  paid commercial licence for a closed-source site.

## Frontend implementation record — 23 Sep 2026

The owner approved the Leads Design Lab and chose **dnd-kit** (`@dnd-kit/core`,
MIT) for the Board instead of Swapy (GPL-3.0 or paid licence).

- Routes: `/dashboard/leads` (`?view=won|lost`, `?layout=board`, `?lead=<id>`
  opens a lead beside the list, full screen on a phone), `/dashboard/leads/new`
  (accepts `name`, `email`, `phone`, `company` in the address, so an
  owner-clicked "Create lead" in Inbox or Booking can prefill it for checking),
  `/dashboard/leads/$leadId/edit`, `/follow-ups`, `/import`, `/lists`, `/trash`.
- Every move — List stage buttons, Board drag, the Board's "Move to…" menu —
  goes through one `useStageMove` hook: Lost asks for the reason, Won asks to
  create or link a Client; cancelling changes nothing and the Board puts the
  card back. A drop moves only the dragged lead.
- Due follow-ups: a red count beside **Leads** in the sidebar, a banner on the
  Active list, and "Due" pills that switch on at their minute.
- CSV import in four steps, with a downloadable report of skipped rows and a
  list of past imports; German Excel files (Windows-1252) are read correctly.
- Reviewed in an independent pass (25 findings, 23 confirmed and fixed, incl.
  a Clients notes overwrite and a page-navigation bug fixed in Clients too).
- Verified: typecheck, `src/tests/backend2-leads.test.ts`,
  `src/tests/leads-ui.test.tsx`, and the owner's own browser against Neon.
- **Still open:** the "Create lead" buttons inside Inbox and Booking belong to
  those modules' session; the address above is ready for them.
