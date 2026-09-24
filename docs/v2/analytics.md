# Analytics and Overview V2 — product and implementation plan

Status: **owner-facing planning approved on 23 Sep 2026; not implemented by this document.** The owner approved a concise Overview and a separate, expandable Analytics page for the whole business. This is the module handoff under the read-to-build rule in `AGENTS.md` when the owner explicitly tells an implementation agent to read this file to begin. It does not authorize a public tracking launch, a paid service, changes to live privacy wording, deployment, commit, or push.

Read `docs/v2/foundation.md` and `AGENTS.md` first. The public site's accepted appearance must remain intact. Speak to the owner in very simple Arabic, even if they write in English: lead with the outcome, explain unavoidable technical terms in the same sentence, and say whether a concern matters locally or only before public launch. Ask only short batches of genuinely material questions. Do not turn the handoff into another open-ended questionnaire.

## What the owner wants

- `/dashboard` opens with a **short Overview**. `/dashboard/analytics` is a separate, owner-only place to explore useful statistics from **every relevant V2 module**, not just traffic and Leads. The Analytics navigation item is approved as an intent; add it when the working page exists, not as a dead link.
- The page should feel visually rewarding, with clear charts and comparisons, while every production number remains real, defined, and traceable. No invented or permanent sample statistics. A designed empty/unavailable state is better than a fake number.
- Start with the modules and data that actually exist. As Blog, Projects, Services, Content, Leads, Clients, Calendar/Booking, Inbox, Invoices, Media, and the public AI assistant become available, Analytics gains their useful measures without making them depend on one another's business logic. A module need not have a vanity chart merely to fill space.
- Use PostHog as the **preferred public-site behavior/traffic analytics provider** if it passes cost and privacy checks. Show a digest of its useful visitor measures inside the owner's Analytics page, with a link to PostHog for deeper exploration. PostHog is not the source of truth for invoices, Leads, clients, messages, appointments, or private files.
- **Spend $0 for now.** Do not activate a paid plan, metered overage, credit card, or paid add-on without the owner's separate explicit approval. Recheck current provider pricing and any hard cap before activation; a published free-tier number alone is not a spending guarantee. If a hard zero-cost boundary cannot be assured, leave public provider capture disabled and explain what is missing.
- Session replay (reconstruction of a visitor's on-page activity) is **a later, separately approved phase**, not part of the initial statistics launch. The owner is interested in it, but chose to launch the basic figures first. Do not switch it on by default or describe it as camera recording.

## Navigation and experience

- Overview retains four headline ideas: money actually received, overdue invoices, website visitors, and unread Inbox messages. The final Design Lab may refine labels/layout and add a compact actionable glimpse (for example due Lead follow-ups) without turning Overview into the full Analytics page. The owner has not locked a permanent four-card layout.
- Analytics is one expandable page with discoverable sections for **Website & content**, **Sales & relationships**, **Operations**, and **Money**; a compact AI section becomes available when its source exists. Exact tabs, chart types, placement, desktop/mobile layout, and visual emphasis are Design Lab decisions requiring the owner's approval. Do not assume a separate route for every module.
- Default to a meaningful recent period (30 days is a proposed default); allow at least 7, 30, 90 days and a year where a time series makes sense. Date grouping uses `Europe/Berlin`. Show the selected period, metric meaning, and data source in plain English in the Dashboard. Offer a link from a summary to the relevant module record or a bounded detailed list when useful.
- Distinguish **zero** (a connected source was checked and found none), **not connected**, **not built yet**, and **temporarily unavailable**. Never replace an error or missing provider response with zero. Show a last-updated indication when cached or delayed.
- Production charts and cards must have accessible text equivalents, sensible labels, keyboard operation, mobile layout, loading/error/empty states, and honest comparisons. A positive-looking color must not imply a business outcome that the underlying measure does not prove.

## Initial metric catalogue and definitions

These are approved categories and useful proposed measures, not a demand to create missing upstream modules. The implementation agent should validate each source against the current code and label any unavailable measure honestly. Metric definitions must be documented with the code and tested. Add further sensible measures later when a real decision or source warrants them.

| Area | Useful measures | Authoritative source and caution |
| --- | --- | --- |
| Website | Visitors and pageviews over time; leading pages; referrers/channels and approximate countries; language/device split; selected public-page performance such as LCP where reliably measured | Privacy-reviewed, public-only PostHog data. A visitor is not the same as a pageview; geography is approximate. Do not count Dashboard or owner activity. |
| Website actions | Contact submissions completed, bookings completed, and clicks from a public page to contact/booking; simple visit-to-action rates | Explicit, minimal public events. Count confirmed completions, not merely opening a form. A click is interest, not a sale or guaranteed Lead. Do not include form contents, names, email, phone, booking tokens, or private URLs. |
| Blog | Published article views by article/language and trend; comments and existing likes/reads where supported; contact/booking CTA clicks originating on an article | Published-page events plus Blog's own counters/comments. Label the different counting methods; do not merge pageviews, reads, and unique people into one number or claim a share occurred merely because a share button was clicked. |
| Projects | Published project views by project/language; outbound live-site/repository clicks where public; contact/booking CTA clicks from a project | Public-page events only. Never send private repo URLs, hidden client names, drafts, or private project data to PostHog. |
| Services | Published service views, public offer/CTA clicks, and contact/booking intent by service | Public-page events only. These do not prove that a person bought the service. Do not derive sales from the editable Services catalogue. |
| Content | Performance of important static public pages and their approved CTAs | Public-page events; Content remains the text source, not a visitor-tracking database. |
| Leads | New and currently active Leads, current stage distribution, Won/Lost outcomes, source distribution, due follow-ups, and a clearly defined Won rate | Backend2 Leads data. The owner's chosen **Lead source** (e.g. WhatsApp or Google Maps) is not the same thing as PostHog's visitor/referrer source. If CSV-import provenance is reliably stored, allow it to be filtered so a bulk import does not silently distort acquisition comparisons; otherwise avoid claiming a precise import/organic split. Count `Won` against resolved `Won + Lost` only if this rate is shown; label denominator and period. If historical stage transitions are not reliably available, do not draw a fabricated historical trend. |
| Clients | New and active/inactive Clients; created directly versus converted from Leads when the origin is reliable | Backend2 Clients data. Do not join an Inbox sender or booking visitor to a Client just because emails match. |
| Calendar / Booking | Confirmed, completed, cancelled, and no-show appointments; appointment method mix; upcoming appointments | Backend2 Booking data. A booking request is not a completed meeting. Exclude test data where the module supports test mode. |
| Inbox | Unread and new conversations, optionally answered conversations when that status is reliably represented | Backend2 Inbox data. Never export message bodies, attachments, sender identities, or private subjects to PostHog. Do not invent a response-time figure unless a reliable reply event/time definition exists. |
| Invoices | Payments actually received, refunds, outstanding/overdue issued-invoice balances, invoice status mix, and subscription status | Backend2 Invoices/payment records once implemented and verified. Drafts, test documents, predicted subscription charges, and payment attempts are not received money. Do not silently sum EUR and USD; show separate currency totals unless a reviewed conversion/reporting rule exists. This dashboard is not tax or profit accounting. |
| Media | Private file count/storage and public-use count if useful for housekeeping | Backend2 Media metadata. Never show private file names or paths to visitors or the analytics provider; Media usage is not marketing performance. |
| Public AI assistant | Conversation volume, unanswered questions if the module records a trustworthy outcome, contact/booking referral clicks, and actual provider usage/cost | The public AI module's own limited metadata and cost records. The Dashboard may show statistics/transcripts approved in its module, but there is **no AI assistant inside Dashboard**. Do not send chat text or transcripts to PostHog. |

For the four Overview headline figures, prefer these concrete meanings: received payments net of recorded refunds (never forecast revenue), overdue **issued** invoice count with amount clearly secondary, measured public-site visitors for the selected period, and unread Inbox conversations. Show EUR and USD receipts separately; do not add them into one headline without a reviewed conversion rule. If a source is absent, show “Not available yet”, not a sample number. Financial figures remain unavailable until the invoice/payment rules are trustworthy.

## Data boundaries and privacy

- Backend2 supplies owner-only, read-only aggregates for private business data. Do not copy private business records into PostHog to make a chart. Analytics must not become an alternative write model or make Leads depend on Services, or Clients depend on Inbox/Booking by guessed identity.
- Public traffic and behavior capture runs **only on approved public pages**, not `/admin`, `/dashboard`, API routes, authentication, booking management links, video rooms, private media, or owner previews. Strip or avoid sensitive URL parameters and fragments. Track a small allowlist of pageviews and meaningful actions rather than blindly collecting form values or every click. Use only published content identifiers/labels that are already public.
- The current public privacy text explicitly states that there are **no analytics tools or tracking** (`src/frontend/content/{de,en,ar}.ts`). Therefore **do not enable public PostHog capture while that statement remains true on the live site**. Before any live activation, review the actual data flow, provider location/settings, applicable consent requirements, disclosures in all three languages, and visitor controls with a qualified privacy review; propose any public privacy/consent UI change separately for owner approval. This specification makes no legal conclusion about whether a particular tracking mode needs consent.
- Session replay requires its own later plan and explicit owner approval. Before any activation, exclude all owner/private surfaces and sensitive public flows, protect typed content and tokenized links, review retention/access and privacy disclosures, and test those protections in a real browser. No replay in the first release even if the PostHog account offers a free allowance.
- PostHog outage or disabled tracking must never break public navigation, forms, booking, or private business aggregates. Do not expose private provider API credentials to the browser or Git. A public project key, if used, must still be scoped to the public surface and not treated as authentication.
- The cost setting is a launch gate: verify current free-tier and hard-stop/spending controls in the owner's actual account before enabling collection. If zero-charge operation cannot be demonstrated, keep it off. No paid trial as a workaround.

## Implementation boundaries and verification

- First inspect current V2 modules, their database/query capabilities, Overview, Dashboard navigation, current public routing, privacy copy, and any existing analytics integration. Reconcile dated documentation against current code. Do not import legacy analytics or fabricate historical traffic. Keep `main` and the legacy `/admin` behavior intact.
- Provide a private, read-only Dashboard contract for the Overview and for each available Analytics section, following current Backend2 route conventions. Requests select a bounded date period and applicable filters; responses identify each metric's key, unit, value, time zone, source, as-of time, and state (`ready`, `empty`, `not-connected`, `not-built`, or `error`). A rate also identifies its numerator and denominator. A detailed ranking uses a bounded page and deterministic order. Do not return raw Leads, Clients, Inbox messages, or invoice records to render an aggregate.
- Implement bounded, indexed server-side aggregates for available Backend2 module data, with filters and deterministic order for any detailed list; follow the repository-wide pagination rule. Avoid loading all records into the browser merely to calculate totals. Keep module-specific aggregation in a narrow read interface so future module changes do not rewrite unrelated modules.
- For visitor statistics, prepare a replaceable PostHog adapter and a clearly disabled/unavailable state. Do not activate collection, create an external account, modify production privacy text, or make a paid commitment as part of local implementation. Any external provider configuration and live public cutover are separate owner-approved steps.
- Preserve source-specific semantics. Never add raw website visit counts to Blog “reads” as if they were the same measurement; never call a CTA click a booking; never call an outstanding invoice money received. Avoid accidental duplicate events on route re-renders, retries, and duplicate form submission.
- The owner-only API must enforce V2 authentication, provide a stable contract for period/source/filters, not leak raw private rows through aggregate responses, and use appropriate no-store/private caching. A public analytics event endpoint, if needed, needs separate anti-abuse and privacy review. The exact routes/schema should be derived from the current Backend2 conventions, not guessed from this planning document.
- Test definitions with fixed known records and edge cases: empty periods, date boundaries/DST, imported Leads, stage reversal, duplicate submissions, cancelled/no-show bookings, refunds, partial/overdue invoices, EUR versus USD, test data exclusion, disabled or failing PostHog, unauthorized access, and no private payload in external events. Check public-site performance impact and absence of public design regressions.
- The first release is complete when available-module figures are accurate and connected, unavailable modules are honestly marked, the owner has visually approved the Analytics page, and the connected local flows pass. **Public traffic analytics is not live-complete** until privacy, budget, provider configuration, and public runtime checks are separately approved and verified. A page with attractive placeholders alone is not completion.

## Handoff prompt for Claude Code

> Read `docs/v2/analytics.md`, `docs/v2/foundation.md`, and `AGENTS.md`, then begin the **Analytics module only** under the repository's read-to-build convention. Treat the confirmed owner decisions here as settled; do not ask another general product questionnaire. Speak to the owner in very simple Arabic, lead with the decision/result, and do not bury them in SQL, provider terms, or test totals. First inspect current Backend2 modules, Overview, navigation, privacy wording, existing analytics code, and the dirty working tree. Ask only if a genuinely material **backend** decision is still needed; otherwise implement the read-only Backend2 analytics aggregates for real available module data and the safely disabled public-analytics adapter, with proportional tests and runtime verification. Do not invent missing module data or enable PostHog on the public site. After backend verification, ask only material **frontend** questions, then present an isolated interactive Analytics/Overview Design Lab with desktop and mobile layouts, real metric definitions but clearly labelled demo values, and your visual recommendations. Wait for my explicit visual approval before building the production frontend. Then connect the approved Dashboard UI, test real data/empty/error states, and report what works locally versus what still needs public privacy/provider activation. Preserve unrelated work and the public design. Do not commit, push, deploy, change live privacy text, turn on paid services, or activate session replay unless I separately request that action.

## Provider references to recheck at implementation time

- PostHog web analytics dashboard and available measures: <https://posthog.com/docs/web-analytics/dashboard>
- PostHog product analytics and current free-tier claims: <https://posthog.com/product-analytics>
- PostHog pricing: <https://posthog.com/pricing>

These links are research inputs, not approval of a particular tracking configuration or a guarantee of future prices.

## Backend implementation record — 23 Sep 2026

Backend2 Analytics is built and verified locally. Nothing public changed: no capture script, no public route, no privacy text, no provider account, no migration. The Dashboard pages (`/dashboard` Overview and `/dashboard/analytics`) are **not** built yet; they wait for the frontend questions and the Design Lab below.

### Routes

Owner-only, read-only, behind `ownerGuard` (404 from any non-local host; 401 without a session once `BACKEND2_OWNER_AUTH=required`), `no-store` on every reply:

| Route | Answers |
| --- | --- |
| `GET /api/v2/owner/analytics/overview?period=` | `headline` (money received, overdue invoices, website visitors, unread Inbox) and `glimpse` (Lead follow-ups due now, appointments in the next 7 days) |
| `GET /api/v2/owner/analytics/sections/:section?period=` | `website`, `sales` (also `origin=all|manual|imported`), `operations`, `money`, `assistant`; each is a list of `groups` with `metrics`, `breakdowns` and plain-English `notes` |
| `GET /api/v2/owner/analytics/rankings/:ranking?period=&page=&pageSize=` | `lead-sources` and `lead-lost-reasons` (also `origin`), `blog-posts` (`by=reads|likes|comments`), `website-pages`; bounded pages (max 100), order = value desc, label, id |

**Period** (every route): `period=7d|30d|90d|365d` (default `30d`: the last 30 Berlin days including today) or `from`/`to` as Berlin dates, both included, at most 731 days, not after today, not before 2020-01-01. Optional `bucket=day|week|month`; the default is day up to 92 days, week up to 366, month beyond. The response echoes the period with its Berlin dates, UTC instants (`start` included, `end` excluded) and the previous period of equal length. Buckets are computed in SQL with `AT TIME ZONE 'Europe/Berlin'`, so clock-change days are 23 or 25 hours long. An unknown query key is refused by name (422) rather than ignored.

### Response shape

`src/backend2/contracts/analytics.contract.ts`. A **metric** carries `key`, `label`, `description` (its definition in plain English), `unit` (`count|bytes|ratio|money`), `scope` (`period|current|next-7-days|all-time`), `state`, `value`, `source`, `timezone`, `asOf`, and where relevant `message` (why unavailable), `notes`, `link` (the Dashboard page behind it), `rate` (numerator, denominator and their labels), `previous` (same measure, previous period), `series` (`bucket` + every bucket's `{date, value}`, zeros filled), `amounts` (money: one entry per currency in minor units). A **breakdown** carries the same identity plus `items`, `total`, `truncated` and the `ranking` that lists the rest.

States: `ready` (checked; `0` is a real zero), `empty` (checked, nothing to measure: a rate with no denominator, a breakdown with nothing in it — value `null`), `not-connected` (PostHog off), `not-built` (module does not exist), `error` (the source failed just now — value `null`, never 0). Each figure is read by its own small part; a failing part marks only its own figures `error` and logs the source name and database code, never the message.

### Metric catalogue (as built)

- **Website & content** — `website.visitors`, `website.pageviews`, breakdown `website.topPages`: PostHog → `not-connected`. `website.onlineBookings` (V2 bookings with `source = public` made in the period): ready. `website.contactSubmissions`: `not-built` (no V2 contact form writes to Backend2 yet). `website.projectsLive`, `website.servicesLive`, `blog.live`: ready.
- **Sales** — Leads: `leads.new` (+series, previous), `leads.active`, `leads.won`, `leads.lost`, `leads.wonRate` = Won/(Won+Lost) in the period with numerator and denominator exposed, `leads.followUpsDue`, `leads.followUpsNextWeek`; breakdowns `leads.stages` (current, board order), `leads.sources` (new Leads by the owner's source label), `leads.lostReasons`. Clients: `clients.new` (+series), `clients.fromLeads` (a `created` link in `v2_client_lead_links`), `clients.direct`, `clients.active`, `clients.inactive`; breakdown `clients.origin`.
- **Operations** — Calendar: `booking.made` (by booking date, +series), `booking.completed`, `booking.cancelled`, `booking.noShow` (by appointment date, current status), `booking.noShowRate` = No-show/(Completed+No-show), `booking.upcoming`; breakdowns `booking.status`, `booking.methods` (cancelled excluded). Inbox: `inbox.unread` (the Inbox badge's own rule), `inbox.new` (conversations someone else started, +series), breakdown `inbox.origins`. Media: `media.files`, `media.bytes`, `media.added`, `media.public` (files a published snapshot uses); breakdowns by kind in files and bytes. Blog: `blog.live`, `blog.firstPublished`, `blog.comments` (visitor comments, +series), `blog.unseenComments`, and `blog.reads` / `blog.likes` as separate **all-time** running totals.
- **Money** — `money.received`, `money.refunds`, `invoices.overdue`, `invoices.outstanding`, breakdown `invoices.status`: all `not-built`.
- **Assistant** — `assistant.conversations`, `assistant.unanswered`, `assistant.referrals`, `assistant.cost`: all `not-built`.

### Decisions made during the build (reversible)

- **Won / Lost in a period** count Leads whose *current* stage is Won/Lost and whose `won_at`/`lost_at` falls in the period. Leads keep no stage history, so a Won-then-reopened Lead counts nowhere and no historical stage trend is drawn; the response says so.
- **CSV provenance** is offered as a filter, with a caveat: a Lead remembers its import only while the import report is kept (deleting the report sets `import_id` to NULL, so those Leads count as hand-entered).
- **Trash** is excluded everywhere (Leads, Clients). Booking has no test mode, so nothing is excluded there.
- **Appointments** are counted by when they take place, with their current status; bookings made are counted by when they were made. A booking is never called a meeting.
- **No response-time or "answered" figure** for Inbox: no reliable reply-to-message link is stored.
- **No `0014` index migration.** Query plans on the in-process PostgreSQL use the existing indexes (`v2_leads_stage_idx`/`list_idx`, `v2_blog_comments_recent_idx`, the booking time indexes); the remaining scans are single aggregate passes over one owner's small tables. Revisit only with measured slowness.
- PostHog defaults to the EU host (`https://eu.posthog.com`); answers are cached in memory for 10 minutes, and `asOf` then shows the provider's time.

### Plug-in points for the coordinator

- **Money** — `src/backend2/modules/analytics/sources/money.ts`: replace `export const moneySource = null` with the Invoices module's `invoiceAnalyticsSource` from `src/backend2/modules/invoices/invoice.analytics.ts`. It must implement `MoneyAnalyticsSource { source: string; read(period, now): Promise<MoneySnapshot> }`, where `MoneySnapshot` = `receivedNet` and `previousReceivedNet` (payments received minus refunds recorded, per currency, minor units), `refunds`, `overdue {count, balance[]}` and `outstanding {count, balance[]}` (issued invoices only, right now), `statusMix [{status, label, count}]` (drafts and test documents excluded). It throws on failure; Analytics shows `error`.
- **Assistant** — `src/backend2/modules/analytics/sources/assistant.ts`: replace `export const assistantSource = null` with `assistantAnalyticsSource` from `src/backend2/modules/assistant/assistant.analytics.ts`, implementing `AssistantAnalyticsSource { source; read(period, now): Promise<AssistantSnapshot> }` with `conversations`, `previousConversations`, and `unanswered` / `referralClicks` / `cost` — each `null` when the module does not record it (shown as not recorded, never 0). No chat text.
- **PostHog** — `sources/website.ts` `WebsiteAnalyticsSource`; used only when `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` (digits) are set, optional `POSTHOG_HOST` (https). It reads PostHog's HogQL query API and **has never run against a real account**; switching it on is a separate owner decision after the privacy and cost gates above.

### Verification

`src/tests/backend2-analytics.test.ts` (37 tests, in-process PostgreSQL with fixed records): default and preset periods, custom-period refusals, Berlin midnights and day buckets on both 2025 clock-change days, week/month buckets, empty periods (real zeros, `empty` rate), the Won-rate denominator with a reopened and a trashed Lead, import filter, Clients from Leads vs direct, cancelled/no-show appointments and the method mix, Inbox unread/new, Media sizes and public files, Blog reads/likes vs comments, ranking pages and determinism, a renamed table taking down only Booking's figures, PostHog disabled / faked / failing / paged, Money and assistant not built / plugged / failing, no private text in any response, `no-store`, 404 off-local on all 10 routes, 401 without a session. `tsc` clean for these files. A runtime check over the real `pg` driver against a throwaway in-memory PostgreSQL returned the overview, sections and a ranking with `no-store` and 404 off-local. Neon was not touched.

### What the Analytics / Overview Design Lab needs

Frontend questions to settle first (after this backend): the Overview's four headline cards and the glimpse layout; how Analytics sections are navigated (tabs vs one long page); chart types per figure (series → line/bar, breakdowns → bars or a donut, rates with their denominator); the period picker (presets + custom range) and the bucket control; how `not-connected`, `not-built`, `empty` and `error` look so none can be mistaken for zero; comparison display (previous period) that does not colour an outcome as good or bad on its own; the `origin` filter in Sales; ranking tables with pagination; the PostHog "explore further" link; and the Analytics navigation item (added only with the working page). The lab must use clearly labelled demo values shaped exactly like these responses.


## Design Lab approval — 24 Sep 2026

The owner approved the Overview & Analytics Design Lab
(https://claude.ai/artifact/T2LvJTV2E81LKd5wPq6jtE) with every recommendation:
Overview shows the four headline figures first, then “Needs you” and “This
week”; the greeting line stays; Analytics sections are **tabs**; the default
period is **30 days**. Every card has an ⓘ definition and a table view; states
never show a fake zero. The Analytics menu item is added with the working page.

## Overview (Direction A) and Cloudflare Web Analytics — implementation record, 24 Sep 2026

The owner approved the Overview Design Lab **Direction A ("Hatch")** with its business funnel, and approved **Cloudflare Web Analytics** (cookieless) as the website-statistics provider in place of PostHog. PostHog's adapter stays in the code, dormant, and is used only if Cloudflare is not configured and the PostHog settings are.

### What `/dashboard` shows

One request, `GET /api/v2/owner/analytics/overview?period=30d`, now also returns `board` (`OverviewBoard` in `analytics.contract.ts`). Every block carries `state`, `source`, `asOf` and a plain-English `description`; a failing source takes down only its own block.

| Card | Figure | Definition |
| --- | --- | --- |
| Received · month | `board.receivedByMonth` (last entry) | Payments received in the Berlin calendar month so far, minus refunds recorded that month, each currency apart. Split into **one-off** invoices and invoices a **subscription** produced (`v2_invoices.subscription_id`) — the only split the invoice data really supports. "Year" sums this calendar year. The delta compares with the *whole* previous month. |
| Visits · 30 days | `headline` `website.visitors` | Cloudflare **visits** (a visit begins when someone arrives from another site or types the address), with a daily Berlin series and the change against the 30 days before. Cloudflare has no "unique visitors" (it is cookieless), so the card says *visits*, not visitors. |
| Outstanding | `board.outstanding` (`invoices.outstanding`) + `invoices.overdue` | Issued live invoices not fully paid now, open balance per currency; overdue count beside it. |
| Money in | `board.receivedByMonth` | The twelve months ending with the current one; the card shows this calendar year or the last 6 months, one currency at a time. |
| Paid on time | `board.paidOnTime` (`invoices.paidOnTime`, scope `last-90-days`) | Of the issued live invoices **paid in full** whose final payment falls in the last 90 days, the share whose final payment was on or before the due date (the last instalment's due date when there are instalments). No such invoice → `empty`, never 0 %. Unpaid invoices are under Outstanding, not here. |
| When people visit | `board.visitsHeatmap` | Cloudflare visits by Berlin weekday × slot (00–06, 06–09, 09–12, 12–15, 15–18, 18–21, 21–24), from hourly rows, 30 days. |
| From visitor to paid | `board.funnel` | Visits (own line, with "% who write" = Messages ÷ Visits), then on one shared scale: **Messages** = `inbox.new` exactly as Analytics defines it (conversations someone else started: email, contact form, booking), **Bookings** = `booking.made`, **Clients** = `clients.new`, **Paid** = `invoices.paidInFull` (issued live invoices whose final payment arrived in the period). Each step is counted **on its own** in the same 30 days; it is not a cohort, and the card says so. |
| Needs you | `headline`/`glimpse` | Overdue invoices, due Lead follow-ups, unread Inbox, appointments in the next 7 days. Only rows with something in them; a row whose source failed says so. |

Money board figures come from the Invoices module's optional `readBoard` (`invoice.analytics-source.ts` → `receivedByMonth`, `paidOnTime` in `invoice.analytics.ts`); a money source without it answers `not-built`.

### Cloudflare Web Analytics

**Public beacon.** When `CF_WEB_ANALYTICS_TOKEN` is set, every public `/$lang/…` page renders Cloudflare's snippet — `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"…"}'>` — with the page's CSP nonce, and the CSP adds `script-src https://static.cloudflareinsights.com` and `connect-src https://cloudflareinsights.com`. Never on `/dashboard`, `/admin`, `/api`, or a booking's private `manage`/`room` link (`src/shared/web-analytics.ts`, tested). **Unset, the HTML and the CSP are exactly as before** (tested).

**Dashboard reader** (`src/backend2/modules/analytics/sources/cloudflare.ts`). GraphQL Analytics API at `https://api.cloudflare.com/client/v4/graphql`, dataset `rumPageloadEventsAdaptiveGroups` under `viewer.accounts(filter: { accountTag })`, filtered by `siteTag` and `datetime_geq`/`datetime_lt`; `count` = page views, `sum { visits }` = visits; dimensions `datetimeHour` (≤ 92 days), `date` (longer), `requestPath` (top pages). 8-second timeout, answers cached in memory for 10 minutes, a failure logs only a short code — never the token, account or site tag. Field names were checked against Cloudflare's public descriptions of this dataset; they are isolated in four query strings and one parser with unit tests, and **have not yet run against the real account** — the first real read is the check. Cloudflare samples page loads, so figures are close estimates (said in each definition).

| Setting | Where | What |
| --- | --- | --- |
| `CF_WEB_ANALYTICS_TOKEN` | Worker variable (public value) | The beacon token from the site's JS snippet. Switches the public beacon on. |
| `CF_ACCOUNT_ID` | Worker variable or secret | The Cloudflare account ID (32 hex). |
| `CF_WEB_ANALYTICS_SITE_TAG` | Worker variable or secret | The Web Analytics **site tag** (32 hex) — not the beacon token. |
| `CF_ANALYTICS_API_TOKEN` | Worker **secret** | An API token with *Account → Account Analytics → Read*. |

Any of the last three missing → website figures `not-connected`; malformed → `not-connected` with a log line naming no value. `scripts/v2-preview.mjs` copies the last three from `.env` into the preview's secrets, never the beacon token (preview visits must not count as the live site's).

**Owner steps** (done on 24 Sep for the first two): Cloudflare dashboard → *Web Analytics* → *Add a site* → `yamanwarda.de` → *Enable with JS Snippet installation* → copy the token from the snippet (`CF_WEB_ANALYTICS_TOKEN`) and the site tag from the site's settings. Then *My Profile → API Tokens → Create Token → Custom* → permission *Account · Account Analytics · Read*, limited to this account → set it as the Worker secret `CF_ANALYTICS_API_TOKEN`, with `CF_ACCOUNT_ID` and `CF_WEB_ANALYTICS_SITE_TAG` beside it.

**Before the beacon goes live on yamanwarda.de:** the privacy page must match. The V2 privacy page adds a "Website statistics (Cloudflare Web Analytics)" section (DE/EN/AR, `privacy-v2.ts`, **wording awaiting the owner's approval**) only while the beacon is on. Two sentences elsewhere then become untrue and need the owner's decision first: the privacy intro ("no analytics tools") and the section "What does not happen" ("no web analytics, no statistics software"), in all three languages — and the legacy privacy page (shown while no public module reads Backend2) has no Cloudflare section at all. Whether a cookieless beacon needs consent under § 25 TDDDG is a legal question for a qualified review, not decided here.
