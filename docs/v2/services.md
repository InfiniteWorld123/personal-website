# Services V2 — product and implementation plan

Status: planning specification recording all Services product decisions made with the owner. No product question remains open. The owner's explicit read-to-build instruction supplies implementation approval under `AGENTS.md`. This document alone is not permission to change live prices, public pages, Leads, Invoices, or legacy content now.

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
