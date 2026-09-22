# Content V2 — static website copy plan

Status: planning specification recording the owner's decisions. The owner's explicit read-to-build instruction supplies implementation approval under `AGENTS.md`; material gaps still require a question before coding. This document does not authorize a live cutover, legacy deletion, or changes to public copy now.

## Purpose and ownership

`/dashboard/content` manages the existing public website's **static copy**: page headings, descriptions, calls to action, fixed explanatory sections, SEO title/description, site facts, and legal-page text in German, English, and Arabic. The owner likes the old `/admin/content` information architecture and wants to retain its page/section grouping, language switch, field search, visitor preview, history, and ability to restore original wording. Adapt that experience to the accepted Dashboard V2 shell; do not turn it into a general page builder or redesign the public website.

Content does **not** own dynamic records or their prices: Services owns service records, offers, prices, and service detail copy; Blog owns articles and tags; Projects owns portfolio entries and case studies. The Inbox, Leads, Clients, Invoices, and Booking modules own their respective records. Static labels and explanatory copy *around* those modules may remain here, but the same service price, project summary, or article body must never be editable in two modules. Remove/retire the legacy Content price and service-item fields from the V2 editable registry when the owning V2 module is connected; preserve the currently visible public wording until that module's approved cutover.

## Editable field registry

- Keep a release-controlled registry of supported static fields grouped by public page and section. The registry defines stable field keys, language scope, value shape (short text, longer plain text, or ordered text list), and helpful length guidance. It follows the accepted site layout; the dashboard cannot create arbitrary pages, sections, routes, or executable HTML.
- Initial scope follows the existing public site's static areas: landing page, shared Services/Work/Blog page framing, About, FAQ, Contact, Stack, Legal, header/footer, not-found page, and shared site facts such as public contact channels. Include static SEO title and description per existing page/language. Dynamic service/project/blog entries are excluded even if the old editor displayed their text.
- DE, EN, and AR are edited independently. Shared facts that are genuinely identical in all languages have one shared field. A change to one translation goes live without forcing simultaneous edits to the others; the editor may show a non-blocking review reminder for their counterparts.
- Field names, data shapes, defaults, and limits must match the exact public components. Do not expose route destinations, arbitrary scripts, private credentials, or system/security configuration as editable copy. A newly added public field is not automatically editable until the release registry intentionally includes it.
- Preserve list-field add/remove/reorder interactions where the accepted layout supports lists. A field or list update is one validated operation; do not publish a temporary empty list entry while the owner is still typing it.
- Images, videos, PDFs, or other files are not required for the initial static-copy editor. If a future Content field needs an asset, it must select or upload through the shared `docs/v2/media.md` library and picker, never a Content-only media store.

## Direct-live editing — intentionally different from other modules

- Content has **no private draft, Publish button, or Publish update button**. A valid edit is written directly to the live V2 content state. This is intentionally different from Blog, Projects, and Services.
- Do not send every keystroke. When the owner finishes a field and leaves it, save that complete value and make it live after the server confirms success. Show `Saving`, `Saved`, and a clear failed-save state. The browser must not claim a failed or still-pending value is published. Preserve the unsaved local value on failure and offer retry; navigation must not silently discard an in-flight or failed edit.
- List add/remove/reorder actions save one coherent list state after validation. Suppress incomplete local rows until they are valid and committed. Reject blank required text, unsupported field keys/shapes, over-limit content where the contract makes a limit hard, and malformed links. Show field-level accessible errors using TanStack Form's repository-wide pattern for new/materially changed forms; the server enforces the same authoritative rules.
- The changed field/language becomes visible through public reads immediately after a successful save, allowing for normal network propagation. Do not require an extra publish operation. If a public cache exists, invalidate or update it so a save is not misleadingly reported as live while visitors still receive an older version indefinitely.
- Legal text remains editable, as the owner requested. Keep the old deliberate Legal unlock/warning pattern so an accidental field focus cannot alter it. After unlock and a successful field save, legal text follows the same direct-live rule. Preview and history remain available; the system does not assert the legal wording is correct.

## Preview, original wording, and history

- `Preview as visitor` renders the real accepted public page for the selected language with the editor's current local text clearly marked when it has not yet saved. Preview must not secretly publish. It should show desktop/mobile and Arabic RTL behavior in the Design Lab.
- `Original` shows the field's release default and allows a deliberate restore. A restore is a live change only after server confirmation, with the previous value recorded in history. Do not silently discard a failed save or an in-progress edit.
- History records complete successful field changes, including restores, with field, language, time, and before/after values. It is not a revision for every keystroke. Restoring a past value creates a new live revision after an explicit owner action; it does not create a hidden draft. History browsing is bounded and server-paginated.
- Keep search across editable static fields, grouped results, length guidance, loading/error/empty states, and clear feedback for values needing translation review. A failed initial snapshot must not silently fall back to hard-coded defaults and permit editing the wrong apparent live state.

## Existing content and cutover

- The owner explicitly wants the current published static text preserved in V2, including Legal. Do not start V2 with blank pages. The migration source is the *effective published content* currently visible on the legacy site: code defaults plus published overrides, not unpublished legacy drafts. Capture DE/EN/AR and shared facts, preserving Unicode, links, lists, and page-specific SEO copy.
- Design a one-time import/cutover procedure with a manifest of source keys, V2 destination keys, excluded dynamic-module keys, counts, validation, preview, and rollback. The old content can change while V2 is built, so perform a final read/compare before the approved public cutover. Do not dual-write legacy and V2 databases or delete old content as a shortcut.
- Preserve the accepted public routes, layout, motion, responsive behavior, copy, and languages during development. Switching the public reader to V2 is separate owner-approved work after the imported values and live-edit flow are verified. Post-cutover, V2 is the authoritative source for these static fields.

## Proposed Backend2 surface

Route names are proposed under the current `/api/v2` transition namespace and must be reconciled with the implemented Backend2/Auth contracts before coding. Owner routes require V2 owner authentication; while unavailable, refuse them outside verified local development. Never expose a write route publicly.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/v2/owner/content` | Registry plus current effective values, field statuses, and language review hints |
| PUT | `/api/v2/owner/content/fields/:key` | Validate and directly publish one field/language value with a revision |
| POST | `/api/v2/owner/content/fields/:key/restore-original` | Restore release default as a new live revision |
| GET | `/api/v2/owner/content/history` | Paginated field/language history |
| POST | `/api/v2/owner/content/history/:id/restore` | Restore one previous value as a new live revision |
| GET | `/api/v2/content` | Public effective static copy for one language and the approved shared facts |

Use a stable field version/ETag or equivalent conditional write so simultaneous edits or slow save responses cannot overwrite a newer value unnoticed. Public responses contain only approved static copy, never history, owner metadata, or private fields. Fixed page navigation and its field list are not independent collection lists; History is paginated. Keep transport, domain behavior, and UI state separate without inventing a broad CMS architecture.

## Dashboard and implementation sequence

- The Dashboard V2 editor is English-only and uses the accepted V2 shell. Reuse the old Content workflow's clear page/section organization, DE/EN/AR switch, search, preview, history, and original-value control, but replace its draft/publish controls with field-level `Saving`/`Saved`/retry feedback. Show any public impact before restoring or changing Legal text.
- Backend phase: define the registry and typed API contract, migrate/import design, effective-content reads, direct-live writes and revisions, owner authorization, concurrency/validation rules, caching behavior, and automated tests. Verify an actual write/read cycle in a safe local V2 environment without changing production or the legacy database.
- Then use the `frontend-design` skill for an isolated interactive Content Design Lab showing page navigation, language edits, live-save states, history, preview, Legal unlock, desktop/mobile, and Arabic RTL. Explain recommendations/tradeoffs and wait for explicit owner approval before production frontend.
- After approval, implement the frontend and connect it to Backend2; verify the rendered public and private flows in all three languages, typecheck, relevant tests, build, and runtime/browser behavior. Review exact changes and staged files before a scoped commit/push to `main-v2`. Neither a passing backend suite nor this document authorizes deployment or public cutover.

## Acceptance checks

- Editing a DE static field updates only its live DE value after successful save; EN/AR and dynamic service/project/blog records remain unchanged. A failed save leaves the previous public value live and retains the owner's local edit for retry.
- No half-typed value is published; navigating during an in-flight save does not lose or mislabel content. Two competing saves cannot silently revert a newer value.
- History records successful values once per complete edit; restoring one creates a new immediately live revision. `Original` restores the release default only after confirmation/success. Legal fields cannot be modified while locked.
- Import comparison covers every approved current static field, language, shared fact, and legal text, while excluding dynamic module data and legacy drafts. No dual writes or live changes occur before an approved cutover.
- Public reads never reveal owner/history/private data. Owner writes are denied without authorization. Fixed fields need no pagination; History has bounded server pagination and a matching frontend control.

## Handoff prompt for Claude — execute on the owner's read-to-build request

> Read `AGENTS.md`, `docs/v2/foundation.md`, this entire approved `docs/v2/content.md`, and the current static-copy registry and legacy `/admin/content` implementation as *evidence*, not automatic V2 authority. Read the active Auth, Media, Blog, Projects, and Services specifications before changing shared contracts. Content V2 owns only static public-site copy and approved shared facts; do not duplicate dynamic service prices/items, blog posts, or project entries. Preserve all current published static text, including Legal, through a separately verified one-time import and cutover. Do not dual-write databases, delete legacy data, or change live public behavior during ordinary module implementation.
>
> Ask the owner only if a material requirement is genuinely unanswered. Otherwise implement and test Backend2 first: fixed registry, typed owner/public routes, direct-live field saves on blur rather than per keystroke, failure/retry and concurrency protection, history/restore, legal lock behavior, translation review, authorization, import tooling and comparison, and safe caching. Do not add a draft or Publish action to Content. Verify a real local write/read cycle and report exact evidence and anything untested; stop before production frontend.
>
> After backend verification, ask the owner only about material frontend/UX decisions still unanswered. Then use the `frontend-design` skill to present an isolated interactive Design Lab based on the old editor's strengths, with desktop/mobile and DE/EN/AR/RTL states. Wait for explicit design approval before building the production frontend. Connect and browser-test the approved UI and public reads, review exact scope and staged files, and commit/push only when the owner requests that Git action, to `main-v2`. Do not deploy or cut over the live site without a separate owner-approved plan.
