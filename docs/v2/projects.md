# Projects V2 — planning draft

Status: historical planning draft with some stale implementation notes. The owner's explicit read-to-build instruction activates the agreed Projects scope under `AGENTS.md`, but the implementation agent must first inspect actual Projects code and reconcile this document with `projects-backend.md` and the later shared Media decision. Do not blindly rebuild Projects or rewrite its existing media migrations.

## Purpose and boundary

Projects is the owner's portfolio and case-study collection. An entry can stay private in Dashboard V2 or be published on the public website. It is not a client task tracker or a system for claiming that a client's business grew.

The existing project form and public project page are references, not V2 specifications. Public-site integration must respect the preservation contract in `foundation.md`; any visible layout change needs separate approval.

## Current implementation, not V2 approval

- `/dashboard/projects` is a temporary shape-only screen. There is no `src/backend2/` Projects implementation or new V2 database yet.
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
- Every Project image—cover, gallery, or inline case-study image—must be chosen through the shared `/dashboard/media` picker. If the image is not in Media, **Upload from computer** adds it to the persistent shared library first, then selects it for the project. Projects must not keep a separate project-only upload path or asset store after integration. The shared Media contract and safe migration from the current project-scoped implementation are planned in `media.md`.
- Both the public work list and the Dashboard project list use real Backend2 pagination, even while the number of projects is small. Manual ordering must work across Dashboard page boundaries.
- Keep the existing login guard on `/dashboard` during local development. This does not start a new V2 authentication module or change the legacy `/admin` login.
- Defer the V2 authentication design, including MFA, to a separate planning session. Projects may be built and tested locally without making the legacy session an implementation prerequisite for Backend2; owner-only V2 APIs must remain unavailable on non-local deployments until an approved authentication plan exists.

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

## Proposed Projects screen design — awaiting visual approval

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

## Handoff on the owner's read-to-build request

Read `AGENTS.md`, `docs/v2/foundation.md`, this whole document, `docs/v2/projects-backend.md`, and `docs/v2/media.md`, then inspect the current implementation and working tree. Treat historical statements about what has or has not been built as evidence to verify, not current fact. Ask the owner only about material missing backend decisions; otherwise complete and verify the agreed Backend2 Projects work without overwriting concurrent changes. The older project-only image upload and automatic deletion design is superseded for final integration by shared Media; use a reviewed migration, not a silent rewrite.

After backend verification, ask only about material frontend/UX decisions still unanswered, then present an isolated interactive Design Lab with desktop/mobile and DE/EN/AR/RTL states. Wait for explicit visual approval before production frontend work. Build and test the approved Dashboard/public flows, preserve the accepted public appearance, and review the exact diff. Commit/push agreed files to `main-v2` only when the owner requests that Git action; do not deploy or cut over the live site without separate approval.
