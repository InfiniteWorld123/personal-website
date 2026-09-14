# Data Model

Table groups and their boundaries. The implemented schema always lives in
`src/backend/db/migrations/`; this file explains intent and the rules that must
survive.

Conventions: `uuid` primary keys, `timestamptz` everywhere, money as **integer
cents** with a separate `currency` column, soft-delete only where history
matters (invoices, payments), hard delete elsewhere.

---

## Auth

`user`, `session`, `account`, `verification` — created by Better Auth.
One row in `user`, with `role = 'ADMIN'`. No registration route.

## Content

| Table | Purpose |
| --- | --- |
| `content_blocks` | Editable copy keyed by a stable `key` (e.g. `home.hero.headline`) |
| `content_translations` | `content_block_id` + `language` + `value`. Language ∈ de/en/ar |

The key set is defined in code. The admin edits values, never keys or structure.

## Portfolio

| Table | Purpose |
| --- | --- |
| `projects` | Case studies. `slug`, `status`, `sort_order`, `is_published` |
| `project_translations` | Title, summary, problem, approach, outcome, per language |
| `project_images` | Cloudinary keys, alt text, ordering, one cover flag |
| `project_tech` | Technologies used, for the stack listing |

`services` was planned here and was built under **Leads** instead: it turned out
to be the vocabulary the lead system needed to answer "how many shops did I
sell?", and one table with two homes in this document is one table too many.

Case study fields are structured (problem / approach / outcome / result) rather
than one free-text blob, so writing them is filling defined fields.

## Blog

| Table | Purpose |
| --- | --- |
| `posts` | `slug`, `project_id`, cover image, `is_published`, `published_at` |
| `post_translations` | Title, excerpt, body, cover alt text, reading time, per language |
| `tags` / `tag_translations` | Archive labels: a slug for the URL, a name per language |
| `post_tags` | Which tags a post carries, in the owner's order |

A post carries all three languages and cannot be published until all three are
written — the same rule projects follow. See `decisions.md` D23, which reversed
D7's single-language plan.

The body is a ProseMirror document in a `jsonb` column, never HTML. The node
types that may appear are listed in `shared/validation/rich-text.ts`; see
`decisions.md` D24.

`published_at` is set on first publish and kept afterwards, so editing an
article does not move it to the top of the feed. The public projection reads it
back in UTC as a plain day.

## Leads and conversations

Implemented across `0004_bookings.sql` (the table), `0007_leads_inbox.sql` (the
inbox) and `0010_lead_system.sql` (the pipeline).

| Table | Purpose |
| --- | --- |
| `leads` | Every inbound contact. Source, service, value, stage, follow-up date, next step, loss reason |
| `lead_notes` | Private notes written in the admin |
| `lead_messages` | Threaded email exchange: direction (in/out), body, sent_at |
| `lead_events` | What happened to this lead, in order, and whether a rule did it |
| `services` | The three offers, from `docs/services/`. Slug, start price, accent |
| `service_translations` | Name, promise, description, deliverables, per language |

`status`: `NEW` → `CONTACTED` → `QUALIFIED` → `PROPOSAL` → `WON` / `LOST`, with
`HOLD` off to one side. A booking creates or attaches to a lead. A contact form
creates or attaches to a lead. There is one inbox, not two.

**Invariants**
- `services` is the **one vocabulary**. Before it, the same idea had three: free
  text on `leads.service_interest`, a name on a booking type, and Markdown in
  `docs/services/`. "How many shops did I sell?" had no answer because nothing
  agreed on what a shop was. `booking_types.service_id` and `leads.service_id`
  both point at it; both are nullable, because a short introductory call belongs
  to no single service and inventing one would be reported later as fact.
- `service_interest` is **kept** beside `service_id`. It is what the visitor
  actually typed, and overwriting a person's words with an id loses evidence.
- Money is integer cents beside its own currency, as everywhere else.
  `value_cents` is nullable: "not valued yet" is a different fact from "worth
  nothing", and only the second belongs in a total.
- The **odds are derived from the stage**, never typed per lead
  (`STAGE_WEIGHT` in `shared/validation/pipeline.validation.ts`). Asking the
  owner to guess a percentage per enquiry produces numbers nobody trusts.
- A lead is closed **with a reason or not at all**: `leads_lost_pair_check`
  enforces `(status = 'LOST') = (lost_reason IS NOT NULL)`. The "why I lose"
  figure is the cheapest column in the schema and the most valuable answer, and
  it is only worth reading if every row carries one.
- `stage_changed_at` is denormalised from `lead_events` on purpose: "eleven days
  in this stage" is read on every card of every render, and a per-card subquery
  is the wrong price for it.
- **Every module writes the history.** `lead_events` is reached through
  `backend/modules/leads/lead.events.ts`, not through the inbox — the booking
  service, the board and the rules all append to it. Where an event came from is
  derived from its kind rather than stored; `is_automatic` marks the lines
  nobody decided.
- Preferences for the whole section live in one `app_settings` row, so a new
  switch is a value rather than a migration. See `0007`'s note on the same
  trade for the inbox.

## Bookings

Implemented in `0004_bookings.sql`.

| Table | Purpose |
| --- | --- |
| `booking_types` | Call types: duration, buffers, notice period, booking window, slot interval, daily cap, location, price, is_active |
| `booking_type_translations` | Name and description per language, as posts and projects carry theirs |
| `availability_rules` | Weekly windows as minutes from midnight on the owner's clock |
| `availability_exceptions` | `BLOCK` takes time away, `OPEN` adds it on a day the week has none |
| `bookings` | `starts_at`/`ends_at`, the blocked span around them, visitor timezone, `booking_type_id`, `lead_id`, `status`, cancel token hash |

**Invariants**
- Overlap is refused by the database, not by application code: `bookings` carries
  an `EXCLUDE USING gist (blocked_slot WITH &&) WHERE (status = 'CONFIRMED')`.
  Two visitors submitting in the same millisecond cannot both win (D27).
- The weekly schedule stores **minutes on a wall clock**, never instants. An
  instant would move the owner's working day by an hour twice a year (D26).
- `visitor_timezone` is stored as an IANA name, never an offset.
- Buffers, price, and location are **copied onto the booking** at booking time.
  Changing a setting later must not rewrite what an existing booking held.
- Rescheduling cancels and re-inserts, linked by `rescheduled_from_id`. A
  booking row is never moved in place.
- Cancel and reschedule links carry a random token; only its SHA-256 digest is
  stored, so a database copy hands out no links. Each token expires when its
  appointment starts and is revoked immediately after cancel/reschedule.
- `booking_types` is referenced `ON DELETE RESTRICT`: removing a call type must
  never take the record of the calls held with it.
- Qualifying answers collected at booking time land on the `lead`, so the call is
  never entered cold.

## Clients and work

| Table | Purpose |
| --- | --- |
| `clients` | Company or person. Billing address, VAT id, language, country |
| `client_contacts` | People at that client |
| `engagements` | A sold piece of work: service, scope summary, agreed price, status |

A `lead` converts into a `client` plus an `engagement`. The lead row is kept for
attribution history.

## Money

| Table | Purpose |
| --- | --- |
| `invoices` | `number`, `client_id`, `engagement_id`, issue/due dates, currency, status, totals, notes |
| `invoice_lines` | Description, quantity, unit price cents, tax rate |
| `payments` | `invoice_id`, amount cents, `method`, `received_at`, external reference |
| `subscriptions` | Recurring retainers: client, amount, interval, next run, status |
| `subscription_invoices` | Link from a generated invoice back to its subscription |

**Invariants — these are the ones that must not be compromised**
- There is **no `is_paid` boolean.** Invoice status is derived from the sum of
  its payments compared to its total.
- `payments` is separate from `invoices` because one invoice may be settled by a
  deposit plus a final payment.
- `payment_method` lives on the payment, not the invoice.
- `invoices.number` is gapless and sequential per year, allocated inside a
  transaction. A cancelled invoice keeps its number.
- An issued invoice is **append-only**. Corrections are a credit note
  (`Gutschrift`) referencing the original, never an edit.
- Line items store the tax rate that applied at issue time, not a lookup.

## Referrals

| Table | Purpose |
| --- | --- |
| `referrers` | Person or company, referral `code`, commission rate, notes |
| `referral_payouts` | `referrer_id`, `engagement_id`, amount cents, status (`DUE`/`PAID`), paid_at, document reference |

**Invariants**
- A payout becomes `DUE` only after the client's invoice is fully paid.
- The platform never moves money. `PAID` is a manual admin action recording that
  a transfer happened outside the system.
- `document_reference` records the referrer's invoice or the issued Gutschrift,
  because the commission is a business expense that needs a document.

## Analytics

| Table | Purpose |
| --- | --- |
| `metric_snapshots` | Cached PostHog figures: metric key, value, period, fetched_at |

Business numbers are queried live from the tables above. Only external traffic
metrics are cached, so the overview page never blocks on a third-party API.
