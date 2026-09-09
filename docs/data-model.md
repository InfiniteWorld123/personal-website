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
| `services` | Offer lines derived from `docs/services/`. `slug`, `is_active` |
| `service_translations` | Name, promise, description, deliverables, per language |

Case study fields are structured (problem / approach / outcome / result) rather
than one free-text blob, so writing them is filling defined fields.

## Blog

| Table | Purpose |
| --- | --- |
| `posts` | `slug`, `language`, `status` (draft/published), `published_at`, body |
| `post_tags` / `tags` | Tagging and archive pages |

One post is one language. No translation table here — see `decisions.md` D7.

## Leads and conversations

| Table | Purpose |
| --- | --- |
| `leads` | Every inbound contact. Source, service interest, budget band, timeline, message, `status`, `referrer_id` |
| `lead_notes` | Private notes written in the admin |
| `lead_messages` | Threaded email exchange: direction (in/out), body, sent_at |

`status`: `NEW` → `CONTACTED` → `QUALIFIED` → `WON` / `LOST`.
A booking creates or attaches to a lead. A contact form creates or attaches to a
lead. There is one inbox, not two.

## Bookings

| Table | Purpose |
| --- | --- |
| `booking_types` | Call types: duration, buffer, notice period, is_active |
| `availability_rules` | Weekday windows in Europe/Berlin |
| `availability_exceptions` | Blocked dates and one-off openings |
| `bookings` | `starts_at`/`ends_at` (timestamptz), visitor timezone, `booking_type_id`, `lead_id`, `status`, cancel token |

**Invariants**
- A unique constraint plus a transactional check prevents overlapping bookings.
- `visitor_timezone` is stored as an IANA name, never an offset.
- Cancel and reschedule links carry a signed token, not a guessable id.
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
