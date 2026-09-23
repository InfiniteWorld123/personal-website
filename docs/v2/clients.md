# Clients V2 — product, backend, and frontend plan

Status: **Backend2 and the Dashboard screens built and committed (23 Sep 2026);
see the implementation records below.** This records the owner's
answers for the Clients module and the approved `Won` handoff from Leads.
The owner has resolved the reversal behavior below. This document does not
authorize deployment, public cutover, a commit, or a push.

## Owner communication — mandatory

Use very simple Arabic with the owner, even when the owner writes English, in
natural right-to-left Arabic prose. Lead with the result and what the owner
needs to decide or do. Explain necessary technical terms immediately, say
whether an issue affects local work now or a later public release, and keep
English identifiers in backticks. Ask only bounded, material questions.
Follow the full rule in `AGENTS.md`.

## Purpose and scope

`/dashboard/clients` is the private directory of people and companies the
owner works with. Each Client has a self-contained file with its own contact
details and editable private notes. The owner may create a Client directly,
even when that person was never a Lead. A Lead becoming `Won` is the one
approved automatic creation or link path; see the cross-module contract below.

The first version is a directory, not a public client portal, project/task
tracker, marketing system, mailbox, calendar, contract generator, or invoice
generator. Do not create Clients from incoming email, contact submissions,
bookings, service interest, or website visits. Do not add a required relation
to Projects, Services, Inbox, Booking, or Invoices in order to edit a Client.
Future optional links are planned with the module that owns each kind of
record; matching an email address alone does not silently attach private
conversations or appointments to a Client.

## Client file and validation

- Client type is **Person** or **Company**. A Company has one primary contact
  person in this version; there are no additional contacts or sub-accounts.
- A Person requires a person's name, email, and country. Phone is optional.
  An optional company-affiliation name can be stored without changing the
  Client type to Company. Private notes are optional and editable.
- A Company requires a company name, the primary contact's name and email,
  and country. The primary contact's phone and private notes are optional.
  Company name here is a directory label, not a substitute for the eventual
  invoice's verified legal billing identity.
- Use the same normalized searchable country choices as Leads. Do not create
  `Germany` and `Deutschland` as separate countries. Validate the required
  fields on the server as well as in the TanStack Form UI; use the repository's
  submit-then-change validation pattern and accessible field errors.
- The owner may edit the Client type later. In particular, a Person with a
  company-affiliation name may become a Company after the owner checks the
  company name and primary-contact fields. Changing type must preserve the
  existing person's contact data and private notes.
- An owner-created Client does not need a Lead or an invented `Lead source`.
  On direct creation, warn about a likely match by email or phone and let the
  owner inspect the existing Client rather than silently merging people.
- Billing address, tax identifiers, payment details, invoice recipient, and
  invoice-specific legal fields are deliberately deferred to the Invoices
  specification. Do not add guessed billing requirements to this form.
- The V2 Client directory starts with no imported legacy Client records.
  Legacy data and routes stay untouched until a separately approved cutover.

## Lead `Won` → Client contract

- Moving a Lead to `Won` creates a **Person** Client by default, even when the
  Lead has a company field. Copy name, email, phone, country, optional company
  affiliation, and notes. The Client's notes then belong to the Client and
  can be edited there independently of the Lead notes. The Client file is
  complete without visiting the old Lead.
- Keep the Lead record and a clear origin link/history. Editing notes or
  contact fields on either side after conversion does not silently overwrite
  the other side. Changing the Client to Company later is an explicit owner
  edit, never inferred from the presence of a company name on the Lead.
- If an existing Client matches the Lead's email, show the candidate and ask
  the owner to link it instead of creating a second Client. If more than one
  candidate is possible, the owner chooses explicitly; never merge by email
  alone. Linking appends the Lead's notes once, under a clear separator, to
  the existing Client's notes without deleting the Client's prior text. The
  append/link operation must be safe to retry without duplicate notes.
- A new Client creation or existing-Client link and the Lead's transition to
  `Won` succeed together. If validation or storage fails, the Lead remains
  in its former stage and the owner sees a clear retryable error. The Lead's
  open follow-up closes only on successful conversion, as specified in
  `leads.md`. This is a narrow explicit link; ordinary Client edits do not
  require the Leads module.
- If the owner later reverses a `Won` Lead to an active stage such as
  `Contacted`, the Client remains intact. The owner separately chooses
  whether to leave that Client Active, mark it Inactive, or move it to Trash
  if deletion is allowed. Reversing the Lead never automatically deletes or
  inactivates the Client, changes the Client's notes, or resurrects a closed
  follow-up. A later return to `Won` must reuse the already linked Client
  rather than create another one or append the same Lead notes twice.

## Client lifecycle

- A Client is **Active** by default. The owner may mark it **Inactive** and
  reactivate it later. Inactive Clients leave the default active list but are
  still searchable through a visible filter and retain their full file.
- An accidentally created Client can move to a paginated **Trash** and be
  restored. Permanent deletion from Trash requires an explicit danger
  confirmation. If any future invoice is linked to that Client, permanent
  deletion is blocked; the Client can instead stay Inactive. The Invoices
  module will define invoice preservation and billing snapshots in detail.
  Trash or deletion never removes a Lead, conversation, appointment, project,
  Media file, or invoice as a side effect. No automatic expiry is approved.
- Do not assume one company name identifies one Client. A duplicate warning
  is guidance, not automatic merging. Preserve stable Client IDs and handle
  edits made while another view is open without silently discarding changes.

## Dashboard experience

- Dashboard V2 is English-only initially. Show one paginated Client list with
  search and filters for Person/Company and Active/Inactive. Provide clear
  entry points for creating a Client, viewing its file, and opening Trash.
  No Kanban board or drag-to-stage behavior is needed.
- A Client file shows the relevant contact details, editable private notes,
  current Active/Inactive state, and a link to the originating Lead when one
  exists. The Client file remains useful when there is no Lead at all.
- Do not show fake Inbox, Booking, Project, or Invoice history. Add each
  optional related-record section when its owner module has an approved
  linking rule and verified behavior. The future section must not attach
  records merely because two rows share an email address.
- The Design Lab must render desktop and mobile list/detail/create/edit,
  Person/Company choices, the `Won` conversion result, an existing-Client
  choice, Inactive/restore, Trash, duplicate warnings, empty/loading/errors,
  and accessible confirmation for permanent deletion. Wait for the owner's
  explicit visual approval before production frontend work.

## Proposed Backend2 contract

Use the V2 database and authenticated owner-only Backend2 routes. All
independently browsable lists use bounded server-side pagination and a
deterministic order, including Inactive and Trash. Suggested route purposes
to reconcile with actual Backend2 conventions before implementation:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET/POST` | `/api/v2/owner/clients` | Paginated search/filter list and direct creation |
| `GET/PATCH` | `/api/v2/owner/clients/:id` | Private detail and editable contact/notes/type |
| `POST` | `/api/v2/owner/clients/:id/status` | Inactivate or reactivate |
| `POST` | `/api/v2/owner/clients/:id/trash` | Move accidentally created Client to Trash |
| `POST` | `/api/v2/owner/clients/:id/restore` | Restore Client from Trash |
| `DELETE` | `/api/v2/owner/clients/:id` | Confirmed permanent delete when allowed |

The Lead stage-change endpoint owns the `Won` command and calls the narrow
Client create/link operation. Do not expose a general public Client API or a
second public conversion path. Keep contact data and private notes out of
public responses and logs. Backend error states include missing or forbidden
Client, invalid Person/Company fields, duplicate candidate, stale edit,
conversion failure, and permanent deletion blocked by a linked invoice.

## Verification and definition of done

Test Person and Company creation/edit, optional phone and notes, type change
without data loss, manual Client without Lead, duplicate warning, `Won`
creation as Person despite company affiliation, independent note copies,
idempotent append to existing Client, conversion rollback and follow-up
closure, Active/Inactive filters, Trash/restore/permanent-delete guard,
paginated lists, owner-only access, and no accidental Inbox/Booking/Services
linking. Use fictional contacts in fixtures. Run typecheck, relevant tests,
build, and a proportionate real local runtime check after backend work; test
the connected frontend after design approval. A passing backend test alone
does not establish the full module is finished.

### Handoff prompt for Claude — execute on the owner's read-to-build request

> This is an implementation request, not a summary request. Read `AGENTS.md`,
> `docs/v2/foundation.md`, all of this `docs/v2/clients.md`, and the approved
> `docs/v2/leads.md`; inspect Auth, current Backend2 conventions, existing
> V2 migrations, and unrelated working-tree changes. Preserve the legacy
> system and current public site. Ask the owner only about genuinely material
> unanswered backend decisions.
> Implement and verify Backend2 Clients first, including direct creation,
> one-contact Person/Company records, independent notes, Active/Inactive,
> Trash, and the atomic Lead `Won` create/link operation. Keep invoice legal
> and payment data for the later Invoices plan. Do not infer links to Inbox,
> Booking, Services, or Projects. Report what is verified and untested.
>
> Then ask only material frontend questions. Use the `frontend-design` skill
> to present an isolated interactive Clients Design Lab with desktop/mobile
> views and the states above; recommend a design and wait for the owner's
> explicit visual approval. Build the approved production UI with TanStack
> Form, verify connected flows, and review the exact diff. Commit/push only
> on the owner's explicit request and only to `main-v2`. Do not deploy or
> cut over legacy systems as part of this module.

## Backend implementation record — 23 Sep 2026

Backend2 Clients is built and verified locally. The Dashboard screens are not
built yet (they wait for the Design Lab and the owner's visual approval).

- **Migration** `0008_clients.sql` (applied to Neon on 23 Sep 2026, with the
  owner's approval, together with 0009–0011): `v2_clients` holds
  one Client file (Person/Company in the same columns, so a type change loses
  nothing); `v2_client_lead_links` is keyed by the Lead, which is what makes a
  repeated `Won` reuse the same Client and never append notes twice. Its key to
  the Leads table arrives with the Leads migration. Invoices will add its own
  `ON DELETE RESTRICT` key to `v2_clients`; the permanent-delete route already
  turns that refusal into `CLIENT_DELETE_BLOCKED`.
- **Countries**: `src/backend2/contracts/country.contract.ts` is the one
  worldwide list (ISO 3166-1 alpha-2 plus `XK`), shared with Leads. Only the
  code is stored. `findCountryCode` accepts a code or an English or German
  name (`Deutschland` → `DE`) and returns null rather than guessing.
- **Routes** (all under the owner fence, `no-store`): `GET/POST
  /api/v2/owner/clients`, `GET /clients/duplicates`, `GET/PATCH /clients/:id`,
  `POST /clients/:id/status|trash|restore`, `DELETE /clients/:id` (from Trash
  only, with the id sent back as confirmation). Lists are paginated on the
  server (25 per page, at most 100): the directory alphabetically by display
  name, Trash by most recently trashed; the id breaks ties.
- **Duplicates**: same email (any letter case) or the same phone written
  differently. Direct creation answers `409 CLIENT_DUPLICATE` with the
  candidates; the owner may resend with `allowDuplicate: true`. Clients in
  Trash are included in the warning, marked `inTrash`.
- **Stale edits**: every edit carries the file's `revision`; an older one is
  refused with `409 CONFLICT`. A Client in Trash is read-only until restored
  (`CLIENT_IN_TRASH`).
- **`Won` handoff**: `convertLeadToClient` in
  `src/backend2/modules/clients/client.won.ts` joins the Lead's own
  transaction. `create` makes a Person (company copied as affiliation) and is
  refused with `CLIENT_DUPLICATE` while a Client has the same email, unless the
  owner chose `allowDuplicate`; `link` appends the Lead's notes once under
  `--- Notes from lead "<name>" (<Berlin date>) ---`. A second call for the
  same Lead returns `reused` and changes nothing.
- **Engineering choices made without asking** (report to the owner, change on
  request): if a Lead returns to `Won` while its linked Client is in Trash,
  the conversion is refused with `CLIENT_IN_TRASH` and the owner restores the
  Client first — it is never revived silently. If the linked Client was
  deleted permanently, the Lead may create a new one. Status changes and
  Trash do not move the edit revision; only contents do.
- **Verified**: `src/tests/backend2-clients.test.ts` (40 tests) — fence (404
  from a non-local host, 401 without a session, CSRF), validation per field,
  type change without loss, stale edit, duplicates, search/filters/pagination,
  Inactive, Trash/restore, permanent delete guard, `Won` create/link/idempotency
  and rollback. A real local run against a throwaway PGlite database (never
  Neon) with a real owner session exercised create, duplicate, type change,
  list, Trash and delete.
- **Not yet done**: the Dashboard screens and the Clients sidebar item (a
  navigation change the owner decides), the Leads side of the conversion, and
  the invoice deletion guard in practice (Invoices does not exist yet).

## Frontend decisions — 23 Sep 2026

- **Navigation**: the owner placed **Clients** in the sidebar directly after
  **Leads** (a lead becomes a client). Added to `dashboardNavigation` when the
  production screens are built, not before.
- The Design Lab is presented as a Claude artifact, as for Services.
- **Design Lab** published 23 Sep 2026 as a private artifact:
  https://claude.ai/artifact/1WtFxt3FjPJamcgkyyu6vq — awaiting the owner's
  visual approval. Open choices shown there: how a file opens on desktop
  (recommended: beside the list; alternative: its own page), "Move to Trash"
  as a quiet button in the file, and a tick box (not typing the name) before
  permanent deletion.

## Niches — owner request, 23 Sep 2026

The owner asked for one extra field on Clients and Leads: the **niche** (the
kind of business, e.g. salon, plumbers, roofers), with the owner able to add
niches. Nothing more. Recorded as built:

- Optional, one niche per Client. `v2_niches` (in `0008_clients.sql`) is one
  owner-managed list **shared with Leads**, so a niche means the same thing on
  both sides. Names are unique regardless of letter case.
- The owner adds, renames (every record shows the new name at once) and hides
  niches. Hiding takes a niche out of new choices; records that have it keep
  it. Only an unused niche can be deleted (`NICHE_IN_USE` otherwise).
- A won Lead's niche is copied to the **new** Client it creates (even if the
  niche was hidden since); linking to an existing Client never changes that
  Client's niche.
- Routes: `GET/POST /api/v2/owner/niches`, `PATCH/DELETE
  /api/v2/owner/niches/:id` (paginated, searchable). Clients filter by
  `?niche=<id>`.
- Dashboard: a searchable niche picker in the Client form that can add a new
  niche on the spot, a **Niches** manager on the Clients page, and a niche
  filter on the directory.

## Frontend implementation record — 23 Sep 2026

The owner approved the Design Lab's three recommendations (file opens beside
the list on a computer; "Move to Trash" as a quiet button in the file; a tick
box before permanent deletion) and asked to build the screens.

- Routes: `/dashboard/clients` (directory; `?client=<id>` opens a file beside
  it, full screen on a phone), `/dashboard/clients/new`,
  `/dashboard/clients/$clientId/edit`, `/dashboard/clients/trash`. Sidebar:
  **Clients** directly after **Leads**.
- Forms use TanStack Form with the server's own schema, submit-then-change
  validation, accessible field errors and focus on the first problem. The
  country picker searches English and German names and ranks the exact code
  first (`de` → Germany).
- Verified in a real browser against a throwaway local database (never Neon)
  with a real owner session: create with validation, duplicate warning and
  "save as a separate client", notes saving, Person → Company without data
  loss, Trash, permanent delete behind the tick, the niche manager, and the
  phone layout without sideways scrolling.
- **Still open:** the Leads side of `Won` (the Clients half is built and
  tested); the link from a Client file to its originating Lead appears once
  Leads exists; the invoice deletion guard becomes real with Invoices.
