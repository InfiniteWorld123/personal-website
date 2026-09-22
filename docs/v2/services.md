# Services V2 — product and implementation plan

Status: **Backend2 and the Dashboard screens built and verified on 22 Sep 2026; the public website is not connected yet.** The owner asked for this document to be executed that day. "What is built" below is the current state, including the decisions taken while building and the frontend questions put to the owner. Everything after it is the planning record the backend was built from; where a dated note corrects it, the note wins. This document alone is not permission to change live prices, public pages, Leads, Invoices, or legacy content.

## Owner communication — mandatory

Use very simple Arabic with the owner, even when the owner writes English, in
natural right-to-left Arabic prose.
Explain any necessary technical word in the same sentence, lead with what
happened and whether the owner needs to act, and distinguish local work from a
later public release. Keep English identifiers in backticks, avoid unnecessary
internal detail, and ask small batches of material questions while saying how
many remain. The complete rule is in `AGENTS.md`.

## What is built — 22 Sep 2026

### Backend2

- `src/backend2/modules/services/` — drafts, pending edits, publish and **Publish update**, unpublish and republish, discard pending edits, the one manual order, permanent delete, the owner's preview, and the public reads. The shared rules live in `src/backend2/contracts/service.contract.ts`, which the editor imports, so its publication checklist is the same function the server runs.
- `0005_services.sql` adds four tables: `v2_services` (identity, order, two pointers), `v2_service_versions` (at most one draft and one live version each), `v2_service_texts` (one row per version per language) and `v2_service_slugs` (every address a service was published under). It starts empty — nothing is imported from the PDFs or the current page. Applied to the owner's V2 database (Neon) on 23 Sep 2026 with the owner's go-ahead: the ledger reads 0001–0005 and the four tables are empty. Verification before that ran on throwaway databases.
- Nothing refers to Leads, Invoices, Booking, Inbox or Media, in either direction. A test takes the row count of every other V2 table before and after a full lifecycle — including a monthly price with an offer — and they are identical: no lead, no invoice, no charge.
- Saving cannot change what visitors see. The public queries join only the live version; the draft is never read for them. The database itself refuses a live version whose price is incomplete, whose "on request" carries a number, or whose switched-on offer is not lower than the price.

### Routes, reconciled with the Backend2 conventions

Owner routes sit behind `ownerGuard`, like Projects: they do not exist outside local development (404, never 401), demand a V2 session with `BACKEND2_OWNER_AUTH=required`, and every write needs the CSRF header. Every owner reply is `no-store`.

| Method | Route | What it does |
| --- | --- | --- |
| GET | `/api/v2/owner/services` | List: `page`, `pageSize` (20, max 50), `search` (address and every language), `state`, `featured`, `language` |
| POST | `/api/v2/owner/services` | New private draft at the end of the order: optional `name` and the `language` it is written in |
| GET | `/api/v2/owner/services/slug-available` | Is an address free? For the editor while typing |
| GET | `/api/v2/owner/services/:id` | The draft, the live version beside it, the publication checklist |
| PATCH | `/api/v2/owner/services/:id` | Pending edits. Only the fields sent change — down to one text in one language — so the list can star a service with `{ draftRevision, featured }` |
| DELETE | `/api/v2/owner/services/:id` | Permanent, with `{ confirm: "<the service id>" }` |
| GET | `/api/v2/owner/services/:id/preview?language=` | The draft through the same projection the public page uses |
| POST | `/api/v2/owner/services/:id/publish` | **Publish** and **Publish update**, with `{ draftRevision }` |
| POST | `/api/v2/owner/services/:id/unpublish` | Off every public surface; kept privately, whole |
| POST | `/api/v2/owner/services/:id/discard-pending` | Throw pending edits away: the draft becomes the live version again |
| POST | `/api/v2/owner/services/:id/position` | Move to an absolute place in the one order, from any page |
| GET | `/api/v2/services` | Published cards in one language: `offset`, `limit` (6, max 36), `featured=only` for the homepage |
| GET | `/api/v2/services/:slug` | One published service in one language, by its current or any earlier address |

Public replies are cached for one minute, like Projects, so **Publish update** shows on the live page within a minute. They are mounted only where a V2 database is configured, so the live site is unaffected. A sitemap pages through `GET /api/v2/services`; no separate endpoint.

The planning table below proposed `POST /owner/services/reorder`; it became `/:id/position`, the Projects convention. `slug-available` and `discard-pending` were added because Projects has them and the editor uses them.

### Decisions taken while building

The specification left these details open. Each follows the spec's wording or the approved Projects module; any of them can be changed.

| Question | Decision | Why |
| --- | --- | --- |
| May a published address change? | Yes, as a pending edit that takes effect on **Publish update**. Every earlier address keeps working: the API answers it with `canonicalSlug`, and the website redirects. No other service can take an old address while its service exists; permanent delete frees it. | This is the "redirect plan" the spec asks for, and exactly what Projects does. An address is never changed by the system — only by the owner typing a new one. |
| Does moving a service wait for **Publish update**? | No. Moving arranges the catalogue and takes effect at once, like Projects. | The spec puts the star under the publication rule and lists reordering separately. |
| Does a star wait for **Publish update**? | Yes, on a live service. The list shows both the saved star and the live one. | The spec says so. |
| How are prices stored? | Euro cents, whole numbers from 0.01 € to 999,999.99 €. 0 € is not a price. | Exact for 49.90 €/month; "free" belongs in the copy. |
| Price mode | Not chosen yet (`null`) is allowed in a draft and blocks publishing. Fixed and starting-from need an amount **and** an explicit one-time / monthly / yearly. Choosing "on request" clears the amount, the period and the offer. | "Absent for quote-only"; a price with no stated period is what the spec means by obscuring the difference. Whether "one-time" is printed on the page is a Design Lab question. |
| The offer | Stored whether on or off, so it can be switched back on. When on, it must be lower than the price and labelled in DE, EN and AR to publish. Off, it is invisible and checks nothing. | "A short promotion label in DE/EN/AR"; a lower price with no reason shown would be misleading. |
| A save that changes nothing | Writes nothing and keeps the revision. A save that returns the draft to exactly the live version (a star on, then off) makes the service "Live" again. | A timed autosave must not make a live service look edited. |
| Two tabs | A stale `draftRevision` is a 409, never an overwrite. | As Projects. |
| Delete | Allowed for a live service too: it leaves the site in the same step. The body must repeat the service id. No archive. | The spec lists delete and unpublish, not archive; Projects asks for the id the same way. |
| Limits | Name 120, short description 400, 1–20 included items of 200, longer text 6,000, offer label 60, search title 80, search description 200. | Generous ceilings; the editor can show softer guidance. |
| SEO | The detail answer carries `seo.title` and `seo.description`, already resolved: the owner's override, or the name and short description. Canonical, `hreflang`, social tags and the sitemap are built by the website from the one shared address. | "No manual canonical field." |

### Verified on 22 Sep 2026

- `bun run typecheck`, the whole test suite (801 passing), and `bun run build`.
- `src/tests/backend2-services.test.ts`: 51 tests against a real PostgreSQL inside the test process — one-language drafts, trilingual publishing, every price mode, the offer on and off, the lower-price and label rules, the database refusing an incomplete live price, pending edits beside the untouched live version, a failed **Publish update** writing nothing, duplicate and retired addresses, stars and the homepage, order across pages, page limits, 404 for draft/taken-down/deleted services identical to one that never existed, no internal id or other language in a public answer, the deployment fence, 401 without a session and 200 with a real one, and no row changed outside the catalogue.
- The running app over real HTTP, against a throwaway database with `BACKEND2_OWNER_AUTH=required` and a real session: 27 checks from create to delete, including 401 without a session, a refused write without the CSRF header or from a foreign origin, and no server errors.
- The production build, started locally with `BACKEND2_OWNER_API=local` deliberately set: every owner route answered 404 — they do not exist in a production build — while the public reads answered from any host.

### Dashboard screens — built 22 Sep 2026

- `/dashboard/services` — the list, in the one order visitors see: search, a state filter, a homepage filter, server pages of 20, a star on every row (choice 5A), and arrows plus "move to position" across pages. A moved row is followed to the page it lands on.
- `/dashboard/services/$serviceId` — the one-page editor with TanStack Form: Basics (web address with a live availability check, homepage star), Price (fixed / starting from / on request, amount, period, offer with its three labels, and the price as visitors read it in DE/EN/AR), Content (one tab per language: name, short description, included lines, longer text with its formatting help and preview, search title and description with a result preview). The checklist sits beside it and each line jumps to its field. **Publish** and **Preview** save first; **Publish update** is locked when there is nothing new. Discard, take down, and delete by typing the name (choice 6A). Leaving with unsaved work asks first, in the app and on closing the tab.
- The preview dialog shows the saved draft through the server's public projection, in all three languages.
- **Services** is in the sidebar directly after Projects (`dashboard-navigation.ts`). The tenth section made the sidebar taller than the owner's window, and its scrollbar covered the right edge of the active pill and the site card. Fixed on 23 Sep 2026: the menu scrolls inside the sidebar instead of the sidebar itself, and the site card steps aside below 860px of window height (it was 780 for nine sections) — see `dashboard.css`.
- The price words and the longer-text formatting live in `src/frontend/features/services/service-display.ts`, ready for the public pages; `publicPriceOf` moved into the contract so the Dashboard preview and the server share one rule.

Verified in a browser against a throwaway database, signed in with a V2 owner session: create, the first-submit validation with focus on the first wrong field and errors clearing while typing, fill three languages, publish (public API answers), a saved edit that leaves the public answer unchanged, the star waiting for the update, moving across the list with the screen-reader announcement, the unsaved-change warning, the preview in German and Arabic, **Publish update** reaching the public answer and the homepage list, delete by name, and the phone-width layout. `src/tests/services-ui.test.tsx` covers the form conversion, the price words and the text formatting.

On 23 Sep 2026, after the sidebar fix: `bun run typecheck`, the whole test suite (822 passing, 1 skipped) and `bun run build`.

### Not verified, and not built

- **The public website.** `/services`, the homepage section and the new service pages still show today's static content. Connecting them to Backend2 — with the approved layout — is a separate step that changes what visitors see, so it waits for the owner's go-ahead, like Projects.
- **The public words for prices** — "ab", "einmalig", "/ Monat", "Preis auf Anfrage" and their English and Arabic — were approved with the Design Lab and live in `service-display.ts`; visitors see them only once the public website is connected. The backend sends structured values, never wording, so the preview and the page cannot disagree.

### Frontend questions put to the owner, 22 Sep 2026 — answered the same day

Asked after backend verification, as the handoff orders.

| Question | Answer |
| --- | --- |
| Today's page shows a "who it's for" list and a note under the price; V2 has only the optional longer text. Add two optional fields for them? | **No.** Both are written inside the longer text. The backend is unchanged; the longer text's plain-text structure (paragraphs, lists, small headings) is shown in the Design Lab. |
| Should the Services screens work like the approved Projects screens — arrows and "move to position", one tab per language, the checklist in a column beside the editor? | **Yes**, the same patterns. |
| Where does **Services** go in the Dashboard sidebar? | **Directly after Projects.** |

The owner then asked for the Design Lab as a Claude artifact rather than as files in the repository.

### Design Lab — 22 Sep 2026, approved the same day

`https://claude.ai/artifact/Tk6JuZpybnhrJ8PCXn6B3m` — private to the owner. Nothing in the repository; the Dashboard screens above were built from it.

One page with the English Dashboard and the DE/EN/AR public site side by side, sharing one sample catalogue — the owner's three current services, plus three invented examples for monthly and yearly prices, an offer, an incomplete draft and a taken-down service. The site reads only published versions, so saving a draft visibly changes nothing and **Publish update** visibly does. It covers the list (search, filters, stars, arrows and "move to position" across pages of four), the editor (Basics, Price, Content in three language tabs, checklist column, preview, discard, take down, delete), the visitor preview, the public homepage section, list, service page and not-found page, redirects from an old address, loading/empty/error states, a failing save, light and dark, desktop and phone width, and Arabic RTL. The rules in it are the contract's.

The Dashboard gets **Services** directly after Projects in the sidebar, as the owner chose.

The owner approved the lab with every recommendation (`1A 2A 3A 4A 5A 6A`), and the new public words with it:

| # | Choice | Recommended |
| --- | --- | --- |
| 1 | Homepage when many services are starred | Up to 6, the grid adapting to the count (4 → 2×2), plus an "All services" link |
| 2 | The blue tile on each card, now that a service has no icon | The first letter of the service's name |
| 3 | The public `/services` list | Alternating sections like today's page, shorter, each with "See details" |
| 4 | "einmalig / one-time" beside a one-time price | On the service page only |
| 5 | Where the homepage star is set | A star button on every list row, and a checkbox in the editor |
| 6 | Confirming a permanent delete | Type the service's name |

The lab also lists the new public words the site needs in all three languages — "einmalig", "/ Monat", "Preis auf Anfrage", "Alle Leistungen", the empty and error sentences — for the owner to approve with the design. When no starred service is live, the homepage section is not shown at all; when the list fails to load, the homepage hides the section silently and `/services` shows the error sentence with a retry.

## Purpose and boundaries

Manage the services Yaman Warda offers from `/dashboard/services`, and show selected published services on the public site. This is an owner-operated catalogue, not a SaaS marketplace, checkout, subscription billing system, booking system, or lead-management workflow. There is no fixed limit of three services and no predefined service categories. The owner may change the catalogue in a few months without rebuilding unrelated modules.

Services are independent records. Do **not** add a required Leads or Invoices relationship, create invoices from a service, or make a lead form depend on a service record in this module. A future separately approved integration may store an optional service ID and a snapshot of the displayed name/price at the time of inquiry or sale; later changes to the catalogue must not silently rewrite historical business records. Keep the shared contract narrow and versioned rather than copying the Services database model into other modules.

The two PDFs under `docs/services/` and the current public website are references, not an automatically imported V2 catalogue or approved new prices. V2 starts with an empty Services catalogue. The owner creates its entries manually. Preserve the current public website until an explicit, verified cutover; do not replace it with an empty V2 list during development.

## Service model and lifecycle

- The owner can create any number of independent services as private drafts. There are no categories, child offers, or fixed three-service schema in V2. A draft may be incomplete and written in only one language.
- Publishing requires complete German, English, and Arabic versions. Each version needs a name, short description, and a list of what is included. Longer explanatory copy can be plain structured text if useful, but a mandatory rich-text editor or image is not part of this initial module. Services have no required Media asset. If an optional image or other asset is later approved, it must be selected through shared `/dashboard/media`; **Upload from computer** adds it to Media first. Never add a Service-only upload endpoint or store.
- Each service has a stable shared slug and a dedicated public page per language, plus a summary on the public `/services` list. A published slug is not silently changed: a later URL change needs a redirect plan. The public list supports any number of services through bounded server-side pagination.
- A draft can be saved without publication validation. The owner may publish, unpublish, republish, or permanently delete a service with appropriate confirmation. Unpublishing removes it from the public list, its detail page, the homepage, navigation, sitemap, and public API while retaining it privately in the dashboard.
- Changes to a published service are saved as private pending edits. Visitors keep seeing the last published version until **Publish update** succeeds. Failed validation leaves the live version unchanged and retains the pending edits. Republished content uses the same identity and slug.
- The owner sets one global manual display order across the public list. A separate `featured` star decides whether a published service appears on the homepage; featured items follow that same manual order. The Design Lab must decide how the homepage layout handles a larger number of starred services while respecting the accepted public design. An unpublished service is never shown even if starred.

## Pricing and offers

- Price presentation is catalogue content only. There is no checkout, automatic recurring charge, installment plan, or invoice creation in Services V2.
- For each service choose one display mode: **fixed price**, **starting from**, or **request a quote**. A numeric public price is required for fixed/starting-from and absent for quote-only. Monetary prices use EUR. A priced service can say the amount is one-time, per month, or per year; those labels describe an offer, not a billing engine. The service page must not combine a one-time building price with an ongoing charge in a way that obscures their distinction. Any more complex price structure can be explained in the service copy or planned separately.
- A fixed/starting-from service may have an optional lower promotional price and a short promotion label in DE/EN/AR. The owner manually turns the offer on or off; there is no automatic start/end time. The normal and promotional amounts use the same one-time/monthly/yearly period. Quote-only services have no numeric discount. Price and offer changes on a published service remain private pending edits until **Publish update**; the live price cannot change from a draft save alone.
- Coupon codes, timed expiry, automatic campaign scheduling, affiliate tracking, commissions, referral payouts, and payment logic are **out of scope**. Revisit those as dedicated modules after the owner has real selling experience, rather than coupling them to the Services catalogue now. Do not invent legal claims or promotional wording automatically.
- The public page and Dashboard preview must display the same approved price terms in each language. Price edits to a published service remain private until **Publish update**; no live price can change merely because a draft was saved.

## Public experience and SEO

- Keep the current accepted public visual identity and `/de/services`, `/en/services`, `/ar/services` list routes. Add service detail routes under each language only after Design Lab approval. Public ordering and pagination must remain deterministic. The homepage contains only starred published services, in manual order.
- Default CTA on each service leads to the existing contact page. Do not add service-specific booking, payment, or lead automation now. The public copy may mention a service, but submitting the contact form does not require a Service database record.
- Use per-language title and description, optional editable SEO title/meta description, automatically generated canonical and `hreflang`, suitable social metadata, and sitemap entries for published details. No manual canonical field. Draft/unpublished services have no public detail/SEO entry. SEO setup does not promise traffic or rankings.
- A future mega menu is not required for the first release. Navigation changes are a separate visible-design decision in the Design Lab if the number of services makes them useful.

## Dashboard experience to take into Design Lab

- English-only Dashboard list: server-side pagination, search, publish status, featured status, manual sorting across pages, and clear create/edit/preview/publish/unpublish/delete actions. The public list also uses backend pagination with a frontend control; small homepage previews do not need pagination.
- Editor: shared settings separate from DE/EN/AR fields, distinct **Save draft**, **Publish**, and **Publish update** actions, clear publication blockers, unsaved-change warning, and visitor preview for all three languages. Price mode and billing-period labels must be understandable without implying a payment system. Do not copy an invoice or subscription UI into this editor.
- Use TanStack Form and the repository-wide behavior: validation on first submit, then on change; accessible field errors and focus of the first invalid field; pending/success/server-error states; no duplicate submissions. Draft-save and publish validation differ.
- Create an isolated interactive Design Lab with rendered desktop/mobile list, detail, editor, price variations, featured home section, empty/error states, and Arabic RTL. Explain recommendations/tradeoffs and wait for explicit owner approval before production frontend work.

## Proposed Backend2 routes

Actual route names should be reconciled with current Backend2 conventions before implementation, while preserving the owner/public separation.

| Method | Route | Purpose |
| --- | --- | --- |
| GET / POST | `/api/v2/owner/services` | Paginated owner list and create private draft |
| GET / PATCH / DELETE | `/api/v2/owner/services/:id` | Read, save pending edits, permanently delete |
| GET | `/api/v2/owner/services/:id/preview` | Private visitor-style preview by language |
| POST | `/api/v2/owner/services/:id/publish` | First publication or publish update |
| POST | `/api/v2/owner/services/:id/unpublish` | Remove from public surfaces, retain privately |
| POST | `/api/v2/owner/services/reorder` | Change global order across list pages |
| GET | `/api/v2/services` | Paginated published summaries by language |
| GET | `/api/v2/services/:slug` | Published service detail by language |

Owner star/feature changes can be part of the owner PATCH contract; their public effect must follow the same explicit publication rule for already published services. Homepage preview is a bounded subset of published featured services, not a request for the entire catalogue.

## Verification and delivery

- Test incomplete one-language drafts; trilingual publication; valid/invalid price modes; no automatic billing; duplicate slug handling; featured/public order; page boundaries and cross-page reorder; public 404 for private/unpublished/deleted services; owner auth; private pending edits versus live snapshot; failed publish preserving live content; unpublish/republish; permanent delete; SEO output and language routing.
- Test that no service change mutates Leads or Invoices, and no public read exposes draft values or private IDs. Test manual promotion on/off, lower-price and period validation, trilingual labels, and the live-versus-pending price boundary.
- Implement and verify Backend2 first: migrations, domain rules, typed API contracts, auth, pagination, tests, build, and real runtime checks. Then use `frontend-design` for an isolated Design Lab, wait for owner approval, build the approved frontend, and browser-test connected flows. Do not report the whole module complete from backend tests alone.
- Review exact scope, working tree, staged files, and checks before a module-only commit/push to `main-v2`. Do not deploy, alter `main`, or cut over legacy data without separate approval.

## Handoff prompt for Claude — execute on the owner's read-to-build request

> Read `AGENTS.md`, `docs/v2/foundation.md`, and the complete approved `docs/v2/services.md`. Inspect current Backend2/Auth, public Services/Home routes, and unrelated concurrent changes. Services V2 is an independent owner-managed catalogue, not a lead, invoice, checkout, subscription, referral, or booking workflow. The current PDFs and public content are references only; do not silently import them or change live prices. No asset is required in the initial Services module; if an asset is separately approved, read the approved `docs/v2/media.md` and use only the shared Media picker/upload flow. If a material decision is still open, ask the owner first. Otherwise implement the full Backend2 phase with independent service records, trilingual draft/publish rules, private pending edits, public snapshots, manual order, featured flag, approved price/offer presentation, owner auth, bounded pagination, SEO data, tests, and real runtime verification. Report what was and was not verified; stop before production frontend.
>
> After backend verification, ask the owner only about material frontend/UX decisions still unanswered. Then use the `frontend-design` skill for an isolated interactive Design Lab covering desktop/mobile Dashboard and public list/detail/home in DE/EN/AR and RTL. Show recommendations and tradeoffs; wait for explicit visual approval. Only then build the production frontend, connect it, browser-test the complete flow, and review the exact diff/staged scope. Commit/push agreed work to `main-v2` only when the owner requests that Git action. No deployment, live cutover, or changes to `main` without separate approval.
