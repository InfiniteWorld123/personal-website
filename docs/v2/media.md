# Shared Media V2 — product and implementation plan

Status: planning draft recording the owner's decisions, ready for whole-document review and approval before implementation. The public-visibility boundary is confirmed below. Do not implement or change Projects/Blog/Invoices from this draft alone.

## Purpose and scope

`/dashboard/media` is the owner's private, reusable file vault for V2. It is not a Blog gallery, a public media site, or separate upload storage for each module. Projects, Blog, future Services, and other modules may select assets from this same library. Invoices and other private modules may also use it later, but their business workflows and generated documents are planned in their own specifications. The Media module does not generate invoices.

Initial accepted file families are images, locally uploaded videos, and PDFs. Word, Excel, PowerPoint, and other documents can be considered later; do not silently accept every file type now. Upload source is the owner's computer only. No import-by-URL, YouTube import, remote synchronization, or automatically saved generated invoice PDF is part of this initial module. A future invoice feature may explicitly save its generated PDF into Media only after that workflow is designed and approved.

The Cloudflare R2 direction already recorded for V2 remains preferred for deployed object storage, with a private bucket and local development storage. Check actual platform upload and streaming limits before promising a video size or deployment readiness. Do not add an unusable Cloudflare binding or expose R2 credentials/keys in the browser. No deploy or live cutover is authorized by this document.

## Owner workflow

- The owner can create, rename, and browse folders and subfolders such as `Projects`, `Blog`, and `Services`. These are organizational choices, not permission boundaries or separate storage systems. Files at the library root are allowed. A folder can be moved only if that cannot create a cycle; deleting a folder requires it to be empty. Files can move between folders without changing their identities or breaking content references.
- The owner uploads files from the computer into a chosen folder, or moves them later. The library shows filename, file type, size, upload date, folder, preview/thumbnail where useful, and where each file is used. Search by filename and filter by type/folder/use. File and folder contents are server-paginated with stable ordering; the UI provides a way to reach every page or batch.
- Every module uses one shared Media picker. To add an image/video/PDF, the owner browses existing Media. If the desired file is absent, the picker offers **Upload from computer**, which first adds it to the shared library and then selects it. Modules must not maintain independent upload paths or duplicate the file as a separate module-owned asset. A file can be reused in multiple modules and content records without uploading it twice.
- A folder does not restrict which module may use an asset. The picker can browse all folders, search, filter, and upload. Cover/gallery/inline roles, ordering, image alt text, captions, and language-specific descriptions belong to each *use* of a file, not to the shared file itself. A shared image can therefore have different suitable alt text in a DE article and an AR project.
- Only the owner can browse the library or see its folder tree, unselected assets, original file metadata, and use history. Owner endpoints use V2 authentication and must not be remotely accessible without it. Filenames and storage keys do not become public merely because a file exists in Media.

## File lifecycle and safety

- Upload creates a persistent library asset, even before any module selects it. Saving, publishing, unpublishing, or deleting a Project/Blog/Service must **not** automatically delete the shared file. Keeping unused assets is intentional for a vault.
- The owner may permanently delete an asset only if nothing references it, including unpublished drafts, scheduled snapshots, published versions, and private module records. If it is referenced, deletion is denied atomically and the dashboard explains where it is used. Never remove the bytes first and then discover a reference. A module must remove or replace every reference before deletion becomes possible.
- Deleting an unused file requires explicit confirmation and removes its metadata and stored bytes. Make failures recoverable/visible: never claim deletion succeeded while metadata still points to missing bytes, or vice versa. Deleting an empty folder never deletes files implicitly.
- Store opaque IDs and generated object keys. Preserve the original filename only as private metadata, sanitize it for display/download, and never use it directly as an R2 key or filesystem path. Verify actual file contents/signatures, allowed MIME types, size, image dimensions, and PDF/video handling on the server. Reject unsafe or unsupported files with clear errors. Do not execute or inline arbitrary uploaded HTML/SVG/script content.
- Plan bounded image previews and video playback in the private dashboard. Large videos need an upload flow that shows progress and handles interrupted/failed uploads without creating phantom library items. Exact size limits and transfer mechanics must be chosen against verified Cloudflare/runtime constraints and documented before implementation; they are not guessed here.
- Files referenced by private content stay private. A file selected for approved published content may be served to visitors through a controlled route or derivative, never by opening the bucket or all Media objects. Invoices and other explicitly private records never become public merely because they use Media.

## Integration and transition

- Projects currently has project-owned image uploads and a project-linked `v2_media_objects` shape. Its planned cleanup also deletes unreferenced objects. Those behaviors conflict with a persistent shared vault. Reconcile this deliberately in a reviewed migration and integration plan: preserve already uploaded files, references, private/public version isolation, and published snapshots; then route Project selection through the shared picker. Do not silently rewrite Projects or its migrations while concurrent work is unfinished.
- Blog's approved direction selects images from shared Media and allows upload through the shared picker. It must not build Blog-only storage. Later Services and Invoices consume the shared contract when their own module plans are approved.
- The library's reference accounting must cover all consuming modules. Published-version references remain in use while a published snapshot is live, even if its draft no longer selects the file. Removing one use does not delete the object or break other uses.
- This module adds the shared vault and picker contract; it does not retroactively approve a public-site redesign, old-data import, invoice behavior, or production cutover.

## Proposed backend and frontend contract

Under the current `/api/v2` transition namespace, expose owner-only routes for: paginated/searchable file listing; upload initiation/completion or direct upload as verified feasible; file metadata and private preview/download; move/rename file; reference/use lookup; guarded delete; and folder create/list/rename/move/delete. Use typed responses and stable error codes for unsupported type, oversize file, missing file/folder, storage unavailable, upload failure, forbidden access, and deletion blocked by references. Public serving, if confirmed, is a separate read-only route that checks current published references on every request or a correctly invalidated equivalent; possession of an opaque ID alone grants no access.

The Dashboard Design Lab must show the library, folders, file list/grid, search/filter, upload/progress/errors, previews, reference list, deletion refusal, and the shared picker embedded in at least Projects and Blog. Include desktop/mobile and keyboard/accessibility behavior. Use TanStack Form for new/materially changed forms and the repository-wide validation pattern. Backend and frontend both handle paginated library and picker results; neither silently loads the entire vault.

## Verification and delivery sequence

1. Review and approve this specification as a whole.
2. Backend first: design a safe migration from project-scoped objects, implement Media/folder/reference APIs and storage, enforce owner authorization, and test real file upload/read/delete behavior. Verify R2 adapter locally where possible and report anything not tested; local-disk success is not proof of deployment storage.
3. Use the `frontend-design` skill for an isolated interactive Design Lab with rendered desktop/mobile results, recommendations, and tradeoffs. Wait for explicit owner approval before production UI.
4. Build the approved Dashboard library/picker and connect the agreed Projects/Blog integration without unrelated changes. Verify file privacy, published-versus-private use, duplicate/reuse behavior, upload failure recovery, folder operations, referenced-delete blocking, pagination, typecheck, tests, build, runtime, and browser flows.
5. Review exact scope and staged files before a module-only commit/push to `main-v2` when requested/approved. Do not deploy, cut over, or push `main` through this plan.

## Confirmed visibility boundary

The Media library at `/dashboard/media`, its folders, private files, bucket, original metadata, and private drafts are owner-only. A selected image or other approved asset may appear on a published Blog article, Project, or later Service because the owner chose to publish that content. Only that referenced asset is served to visitors; the selection does not reveal the library or any other asset. Removing the published reference must stop new public delivery, subject to explicitly documented cache behavior. A private invoice attachment remains private even if the same library contains public-site assets.

## Handoff prompt for Claude — use only after approval

> Read `AGENTS.md`, `docs/v2/foundation.md`, this entire approved `docs/v2/media.md`, `docs/v2/projects.md`, `docs/v2/projects-backend.md`, and `docs/v2/blog.md`. Inspect current code and concurrent owner changes before touching any files. Media is one private, persistent shared vault with folders/subfolders, uploads from the owner's computer, and a reusable picker for all modules. Module upload buttons must add to Media first; no parallel Project-only or Blog-only storage. A file may be reused across modules. Never delete a referenced file; show its uses. The existing Projects media shape and automatic cleanup conflict with this model, so make a safe, tested migration/integration plan before implementation. Respect the approved public-delivery distinction and never expose the library, bucket, private drafts, invoice material, or unrelated files.
>
> Ask only about a genuinely material unanswered decision. Implement and verify the Backend2 Media phase first, including storage, folders, references, permissions, bounded pagination, file validation, migrations, failure states, and integration contract. Then present an isolated interactive Design Lab with desktop/mobile library and shared picker, recommendations, and tradeoffs. Wait for explicit design approval before production frontend. Implement the approved UI, verify connected flows, review the exact diff, and commit/push only agreed changes to `main-v2` after completion. Do not deploy or cut over production without separate approval.
