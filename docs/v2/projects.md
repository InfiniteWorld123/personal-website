# Projects V2 — planning draft

Status: **built on 22 Sep 2026** — Backend2 and the Dashboard screens, on the design the owner approved in the Design Lab that day. The public website is not connected to it yet; that remains a separate step. "What is built" below is the current state and the list of what is still missing. Everything after it is the planning record the module was built from: where a dated note corrects it, the note wins, and statements about what does or does not exist are evidence to verify against the code, not current fact. Do not rebuild Projects from this record, and do not rewrite its existing migrations — extend what is there.

## Purpose and boundary

Projects is the owner's portfolio and case-study collection. An entry can stay private in Dashboard V2 or be published on the public website. It is not a client task tracker or a system for claiming that a client's business grew.

The existing project form and public project page are references, not V2 specifications. Public-site integration must respect the preservation contract in `foundation.md`; any visible layout change needs separate approval.

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

- `src/backend2/modules/projects/` — drafts, publishing, the one global order, archive, restore and permanent delete. Owner routes live under `/api/v2/owner/projects` behind `ownerGuard`; public reads live under `/api/v2/projects`. `docs/v2/projects-backend.md` describes the routes.
- Saving cannot change what visitors see. The draft and the published copy are separate versions, and the public queries join only the published one. A publish that fails validation writes nothing.
- Images come only from the shared Media vault. A project declares its files with `replaceReferences`, at scope `draft` while editing and `published` for the live copy, so a file a project uses cannot be deleted from Media.
- `0004_projects_media.sql` repointed `v2_project_images` from the dead `v2_media_objects` at `v2_media_assets`, and added `v2_projects.published_draft_revision`, which is how "live, with saved changes" is one integer comparison. It is applied to the owner's database.
- Public project JSON is cached for one minute, not an hour. An hour would have made **Publish update** look like it did nothing. Images keep the hour the Media route gives them, because an asset never changes.

### Dashboard

- `/dashboard/projects` — every project in the one order visitors see: search, a state filter, a type filter, server-side pages of 20, and moving by arrows or by typing a position.
- `/dashboard/projects/$projectId` — the one-page editor. Sections: basics, the three languages, the case study, images, links and technology. The publish checklist sits beside them. **Publish** saves first, then publishes. Once a project is live, the editor puts what visitors see beside what was saved, and the button becomes **Publish update**.
- The case study has its own rich-text editor, because V2 stores an inline image by library id, never by URL. What a pasted web page may turn into is decided in `src/frontend/features/projects/case-study-document.ts`, which has its own tests.

### Approved in the Design Lab, 22 Sep 2026

| Question | Chosen | Turned down |
|---|---|---|
| Reordering | Arrows, plus "move to position" | Drag and drop — it cannot reach another page and cannot be done from a keyboard; a position box on every row |
| Publish checklist | A column beside the work | A bar pinned to the bottom — it covers the writing toolbar |
| The three languages | One tab per language | All three stacked — the page becomes three times as long |
| Row height | Roomy, with the cover | Compact rows, left for later |
| Showing the state | A word, with colour behind it | A coloured dot alone |

The lab itself was deleted after approval.

### Not built yet

- **Preview.** The backend answers `GET /api/v2/owner/projects/:id/preview?language=` with the draft in the public shape, but no Dashboard screen calls it yet. The approved design had a Preview button, and it is missing from the editor.
- **A live check of the web address.** A taken address is refused when publishing, with a message. It is not flagged while typing, although `GET .../slug-available` exists for exactly that.
- **The public website.** `/work`, the homepage selection and the project pages still read the legacy backend. Moving them onto Backend2 needs its own approval and must keep their accepted design.

### Verified

Typecheck, the full test suite and a production build all pass. The Backend2 tests run against a real PostgreSQL inside the test process. In the owner's own signed-in browser: create, fill all three languages, publish, read it back from the public API, edit and save while the public copy stays unchanged, then permanently delete.

## Current implementation, not V2 approval

- ~~`/dashboard/projects` is still a screen that says the section is not built. There is no `src/backend2/` Projects implementation.~~ **Corrected 22 Sep 2026:** both exist now — see "What is built" above. **The V2 database does exist now** — it holds Auth, the shared Media vault, and the Projects tables from `0001_projects.sql`, which were applied without the code that was meant to use them. Read the warning above before adding to it.
- The existing `/admin/projects` form, API, and database tables belong to the legacy system. They do not satisfy this V2 plan automatically.
- The public `/work` page currently loads the complete list and reveals it in groups of six in the browser. The V2 public read should request one batch at a time from Backend2 while retaining the accepted page design.

## Confirmed product decisions

- Each project has a type: **Demo**, **Personal**, or **Client**. The type is visible to visitors when the project is published, so a demo is not presented as client work.
- Work status and visibility are separate. A project may be **In progress** and published, or private regardless of its work status.
- Private projects remain visible to the owner in the dashboard and are not publicly accessible.
- The owner controls the order of published projects manually. The homepage uses the first projects in that same order; there is no separate featured ordering.
- Every published project has a public detail page, even when its optional case study is empty. The page shows the available summary, links, and images.
- A project may be published without a full case study, including while it is in progress. The full case study remains optional after completion.
- Editing a published project creates private pending changes. Saving those changes does not alter what visitors see; the existing published version stays live until the owner explicitly chooses **Publish update**. Publication validation applies to the pending version before it replaces the live version.
- Publication requires a project name, type, and short summary in German, English, and Arabic. A cover image and case study are optional. Every published image requires alternative text in all three languages.
- A case study uses one flexible rich-text body per language, with optional editorial guidance or a starter outline. The owner can change or omit the suggested sections.
- The editor supports headings, emphasis, lists, links, images within the story, code blocks, and tables.
- Project images can appear within the case study and in a separate gallery. A cover image can be chosen separately.
- A client project may be published without displaying the client's name. If the client does not allow the project to be shown at all, the entry stays private.
- The owner decides which client details and links to publish. Website URL, source-code URL, and other relevant links are independent and optional. A private repository URL is never required or automatically exposed.
- Demonstrated business results may be described in the case study when available, but no growth metrics or outcome claims are required.
- Existing legacy projects will be recreated by the owner in V2 rather than imported automatically.
- Every Project image—cover, gallery, or inline case-study image—must be chosen through the shared `/dashboard/media` picker. If the image is not in Media, **Upload from computer** adds it to the persistent shared library first, then selects it for the project. Projects must not keep a separate project-only upload path or asset store after integration. The shared library is built and running; `media.md` records it. There is no data to migrate — the old `v2_media_objects` table has always been empty — so Projects simply uses the picker.
- Both the public work list and the Dashboard project list use real Backend2 pagination, even while the number of projects is small. Manual ordering must work across Dashboard page boundaries.
- ~~Defer the V2 authentication design, including MFA, to a separate planning session.~~ **Done.** V2 authentication is built and the owner signs in with it; `docs/v2/auth.md` owns it. Projects' owner-only routes use the same guard every other V2 owner route uses — `ownerGuard` from `src/backend2/security/owner-guard.ts` — which is the deployment fence plus a real owner session. Do not invent a second one, and do not expose an owner route without it. The legacy `/admin` login is untouched and stays that way until a separate cutover.

## Proposed authoring flow — not yet approved

1. Create a private draft and choose its type and work status.
2. Add the short public-facing facts and translated card content.
3. Optionally write the richer case study and add cover, inline images, and gallery images.
4. Preview the public page in each language.
5. Publish when the agreed minimum content is complete; publish and work status remain independent.
6. For an already published project, save further content, link, and image edits privately; preview them and choose **Publish update** when ready. The previous public version remains visible in the meantime.
7. Change visibility and manual display order separately when needed.

## Frontend direction agreed with the owner

- Replace the temporary Projects placeholder inside the existing Dashboard V2 shell. Keep its approved visual system, including its light/dark and surface choices.
- Use one editor page with clearly grouped sections rather than a step-by-step wizard. The page supports saving a private draft, previewing each language, and publishing when ready.
- Keep optional editorial guidance inside the rich-text case-study editor without constraining the owner's structure.
- Extend the existing public project page to render the approved rich-text content, inline images, and tables while preserving the public website's accepted visual identity. This is an approved content-layout extension, not a general public-site redesign.

## Projects screen design — approved 22 Sep 2026

**Approved in the Design Lab and built.** The choices made are in the table under "What is built" above. The sketch below is the proposal as it was reviewed.

Reuse the existing Studio Workbench shell, type, blue accent, light/dark themes, and four surface choices. Do not create a separate visual theme for Projects. The distinctive visual focus is the project's real cover/preview and its publication state, not decorative dashboard cards or invented performance metrics.

```text
Projects list
Projects                                      [New project]
[Search] [Visibility] [Type / status]
Cover  Project + slug  Type  Status  Visibility  Updated  Order
...                                              [Move / Edit]
[Previous]              Page 1 of N              [Next]

One-page editor
Back to Projects     Project name            [Preview] [Save draft]
Main column: basics → DE/EN/AR content → case study → images → technology
Side column: private/published state → missing items → [Publish]
```

- On a small screen, the list becomes readable project rows/cards and the editor side column moves below the content; save/preview/publish remain reachable without covering the rich-text toolbar.
- Reordering should be accessible without drag-and-drop. Proposed controls: move up/down globally and move to a chosen position, including positions on another page. The exact interaction must be reviewed in a rendered prototype.
- The editor shows which language is incomplete and which fields block publication. The case-study outline is optional guidance inside the rich editor, never a fixed set of required text boxes.
- The public `/work` and detail pages retain their accepted visual identity. New content blocks must fit their existing typography, spacing, motion, and RTL behavior rather than introducing a second design system.

## Proposed first complete slice — for discussion

This is one Projects module delivered end to end, not permission to implement it yet:

1. Establish only the V2 database, migration, and API foundation needed for Projects, without writing to the legacy database or changing `/admin`. V2 authentication is deferred during this local-only slice; private V2 operations must not be available from a non-local deployment.
2. Replace the Dashboard Projects placeholder with a real list and a one-page editor: create a private draft, save incomplete work, preview, publish or unpublish, and reorder published projects.
3. Connect the public work list, homepage selection, and project detail pages to V2 Projects in a verified local preview first. Preserve current public appearance and behavior; any remote preview or production cutover remains separate and requires the approved access/security plan.
4. Review real desktop and mobile browser flows, plus API and database tests, before declaring the module complete.

Once this specification is approved, implementation proceeds backend-first: Claude completes and verifies the V2 data/API portion, then connects the Dashboard and public frontend, then shows the owner rendered browser results. A passing API test alone is not a finished Projects module.

### Proposed information and editor layout

- **Project facts:** stable internal ID, public URL slug, Demo/Personal/Client type, work status, private/public visibility, and manual public order.
- **Privacy and links:** optional client name with an explicit show/hide choice; optional website, source-code, and other links that are never published implicitly. The editor makes clear which values a visitor will see.
- **Per language (DE/EN/AR):** name, short category label for the existing public eyebrow, card summary, and optional rich-text case study. The case study may be blank in any language; publishing still requires the agreed name and summary in all three.
- **Images:** optional cover, ordered gallery, and images inserted within the case study. Select through shared Media, or upload from the owner's computer *into Media first* through its picker. Every public image has alt text in all three languages. A file can be reused by another module; its role, order, and alt text belong to this project use.
- **Technology:** optional ordered technology labels, as seen on the current public project page.
- **Dashboard list:** clearly distinguish published and private projects, show type/status/translation readiness, and paginate from Backend2 even when there are few entries. Manual ordering must work across pages; a proposed control is "Move to position" plus adjacent up/down actions. Search or filters must not silently reorder hidden projects.
- **Editor:** grouped sections on one page, DE/EN/AR language tabs, visible draft/publish state, clear missing-publication checklist, preview, and save/publish actions. Draft validation and publication validation are separate.
- **Published edits:** show when saved changes are still pending, and provide a distinct **Publish update** action. The preview shows pending content; public pages keep using the last published version until that action succeeds.

### Proposed Backend2 capabilities, not final route names

- Local-only private operations for the initial slice: list projects with bounded pagination, create a private draft, read one draft, save edits (including private edits to a published project), publish or publish an update, unpublish, reorder published projects across pages, select shared Media references, and preview pending content. Upload, file management, and the picker belong to the shared Media module. These owner operations must be unavailable outside a verified local development environment until V2 authentication is approved.
- Public: list only published projects in manual order by language and six-item batch, read one published project by slug and language, and return the first published projects for the homepage in that same order.
- Public responses contain only explicitly publishable fields. Private drafts, hidden client names, private repository links, internal IDs/notes, and upload storage keys must not leak into them.
- The exact URLs, HTTP methods, response shapes, error codes, storage provider, and database schema are still to be specified after the foundation choices are approved.

### Cloudflare media direction

- The owner prefers Cloudflare R2 for deployed V2 Media storage, isolated from legacy media; `media.md` owns the shared storage, upload, folder, picker, reference, and deletion design. Do not expose storage credentials to the browser or put image bytes in PostgreSQL.
- Keep the library and bucket private. A Project draft image is owner-only; a selected image may be served publicly only while referenced by a published Project version. Unpublishing must stop new public delivery under the approved cache policy.
- Shared assets persist when a Project unpublishes or deletes its record. A referenced file cannot be deleted from Media, including while a pending or published Project version still uses it. Removing one Project reference must not remove the file or break other uses. See `media.md` for the safe migration from existing project-owned images and automatic orphan cleanup.

### Provisional choices awaiting owner confirmation

**Where these stand, 22 Sep 2026.** Kept as written below, because they are the record of what was proposed:

- *Preview:* owner-only on the backend, as proposed, with no shareable links. There is no Dashboard screen for it yet (see "Not built yet").
- *Local-only fence and the legacy login:* superseded. Owner routes use `ownerGuard` — the deployment fence, plus a real V2 owner session when `BACKEND2_OWNER_AUTH=required`. See `docs/v2/auth.md`.
- *Slug:* built as proposed. A new project gets a suggested address from its name, the owner can edit it, and every address it was ever published under keeps resolving.
- *Delete or archive:* settled. Archive is the safe default. Permanent delete asks for the project's id to be typed back, and the images stay in Media either way.

- Preview an unpublished project only inside the local Dashboard during the initial slice; do not create shareable preview links in the first version.
- The local Projects slice does not need to integrate Backend2 with the legacy login session. The existing `/dashboard` page guard stays, but it does not protect an API called directly. Therefore owner-only Backend2 endpoints must be restricted to verified local development and absent or denied in non-local deployments; a Git branch, hidden route, or 404 on today's live site does not replace this requirement. Never write Projects data to the legacy database.
- Generate a suggested slug from a name, allow the owner to edit it before publication, and avoid casually changing public URLs after publication.
- Prefer unpublishing/keeping a private draft to accidental permanent deletion; the exact delete or archive behavior remains open.

### Proof required before a Claude build can be accepted

- A private draft survives incomplete translations and cannot be fetched through public endpoints.
- A publish attempt explains every missing required translation or image alt text, and leaves the draft intact.
- Saving an edit to a published project leaves the public version and its images unchanged. An invalid **Publish update** leaves that public version intact and keeps the pending changes for correction.
- Public list, detail, and homepage respect one manual order; public pagination requests only the needed batch. The Dashboard list is also server-paginated, and moving a published project across page boundaries preserves the intended global order.
- Client name and source link appear only when explicitly allowed; an unpublished project returns not found publicly.
- The editor and public pages are checked in DE, EN, and AR, including RTL, on desktop and mobile. Loading, empty, validation, server-error, and success states are visibly verified.
- Typecheck, relevant automated tests, build, local private/public browser checks, and explicit tests that owner-only Backend2 endpoints are unavailable outside local development pass. Production cutover is not implied.

## Pagination — agreed with the owner

- Preserve the public `/work` page's existing pattern: initially show six projects and reveal more in batches of six with the existing Load more control.
- Backend2 should return only each requested public batch, in the owner's manual order, with a stable secondary order and an indication of whether more projects exist. It must not expose private projects. The current public implementation slices an already loaded list; V2 should fetch successive batches from Backend2 instead. When the URL requests a later page directly, the frontend still shows all preceding batches so the existing "Load more" experience is preserved.
- The dashboard list also uses server-side pagination and visible page controls. Reordering is global rather than limited to the current page; the exact cross-page control is part of the frontend design review.

## Validation direction

- Follow the repository-wide form validation behavior in `AGENTS.md`: first submit, then revalidate on change; show accessible inline errors and focus the first invalid field.
- Saving a private draft permits incomplete translations and images. Publishing requires the approved minimum content in all three languages and translated alternative text for every image that will be public.
- Saving pending changes to a published project likewise permits incomplete work; only **Publish update** replaces the public version after full validation. Pending image additions or removals must not change the public version before then.
- The server independently enforces publication rules. A rejected publish attempt must leave the saved draft available and explain what needs attention.

## Specification sections still to complete

After the open product decisions are resolved: exact content fields, editor and image behavior, publication and preview rules, ordering behavior, private and public API contracts, permissions, data and migration rules, failure states, tests, and definition of done. Backend2 database, authentication, and API namespace decisions are prerequisites for implementation under `foundation.md`.

## Before you touch the database — read this first

**Updated 22 Sep 2026.**

- **`0001_projects.sql` exists. Do not create it and do not overwrite it.**
  These tables were applied to the owner's development database on 21 Sep 2026
  while the file itself was never committed; it was recovered on 22 Sep by
  reading the schema back out of that database. It matches what is installed,
  which the design block in `projects-backend.md` §4.3 does not, in two places.
- **The owner's database already holds these tables and two real project rows.**
  A new Projects migration is a *change* to what is there, not a fresh
  creation of it, and it takes the next free number — never a number already
  used. The runner sorts by filename, so a repeated low number runs before the
  wrong migrations on a new database and never runs at all on the owner's.
- **`0004_projects_media.sql` exists and is applied** (22 Sep 2026), so the next
  free number is **`0005`**. It repointed `v2_project_images.asset_id` at the
  shared `v2_media_assets` with `ON DELETE RESTRICT`, and added
  `v2_projects.published_draft_revision`. It refuses to run if either affected
  table holds rows, because moving existing rows needs a reviewed copy, not a
  rename.
- **Images are not Projects' to store.** Shared Media is built and running.
  Import `MediaPicker` from `src/frontend/features/media/MediaPicker` for
  choosing files, and call `replaceReferences` from
  `src/backend2/modules/media/media.service` in-process — never over HTTP — to
  declare which files a project version uses. Use scope `draft` while editing
  and `published` for the live snapshot: `published` is what makes a file
  reachable by a visitor, and any reference is what makes it undeletable. Alt
  text, ordering and the cover/gallery/inline role belong to Projects' own
  tables, because the same photograph needs different alt text per language.
- The old project-scoped upload, the `v2_media_objects` table and its automatic
  orphan cleanup are **superseded**. They still exist in the database because
  0001 created them; nothing reads them, and the vault never deletes a file
  merely because nothing references it.
- **`v2_media_objects` stays for now, by the owner's decision on 22 Sep 2026.**
  After 0004 nothing points at it — its only remaining key points outward, at
  `v2_projects`. It stays empty and unread until the Projects image design has
  settled, and dropping it is a separate, reviewed step. `v2_project_images` is
  **not** dead: it is where each image's role, order and use are recorded, and
  `v2_project_image_texts` holds its alt text in each language.

## Handoff on the owner's read-to-build request

Read `AGENTS.md`, `docs/v2/foundation.md`, this whole document, `docs/v2/projects-backend.md`, and `docs/v2/media.md`, then inspect the current implementation and working tree. Treat historical statements about what has or has not been built as evidence to verify, not current fact. Ask the owner only about material missing backend decisions; otherwise complete and verify the agreed Backend2 Projects work without overwriting concurrent changes. The older project-only image upload and automatic deletion design is superseded for final integration by shared Media; use a reviewed migration, not a silent rewrite.

After backend verification, ask only about material frontend/UX decisions still unanswered, then present an isolated interactive Design Lab with desktop/mobile and DE/EN/AR/RTL states. Wait for explicit visual approval before production frontend work. Build and test the approved Dashboard/public flows, preserve the accepted public appearance, and review the exact diff. Commit/push agreed files to `main-v2` only when the owner requests that Git action; do not deploy or cut over the live site without separate approval.
