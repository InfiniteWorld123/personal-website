# Blog V2 — product and implementation plan

Status: planning draft recording the owner's decisions. Review and approve this whole document before implementation. The shared Media module in `media.md` is a dependency that still needs its own approved specification before Blog's media-backed backend can be completed. This document does not authorize changes to the partially built Projects or Auth modules.

## Goal and boundaries

Build an owner-managed, trilingual blog in Backend2 and `/dashboard/blog`. Preserve the accepted public blog routes and visual identity while replacing their data source at an explicitly approved cutover. The owner wants useful articles, strong technical SEO foundations, and a low-friction place for readers to comment. SEO implementation is not a promise of rankings or traffic.

V2 uses `src/backend2/` and its own database. Do not write to the legacy database or remove `/admin`. The single owner is the only dashboard editor. Public readers do not need accounts. The old article was test content: do not import it into V2, and do not remove it from the live site until a separate cutover explicitly permits that change. Calendar, Inbox, Leads, Services, and their workflows are outside this module.

## Approved content model

- An article has one stable shared slug across German, English, and Arabic. It may be edited while private; after first publication, keep it stable. Changing a published URL requires a separately planned redirect, not a silent rename.
- A private draft can contain only one language and can be saved incomplete. Publishing or scheduling requires a complete title, short summary, and nonempty rich-text body in **all three** languages.
- Each language has its own body, optional editable SEO title and meta description with defaults from title/summary, and image alternative text. SEO overrides are not required merely to publish.
- A single cover image can be used across languages. It is optional; the editor warns if missing. When present, its alternative text is required in all three languages before publication.
- Inline images belong to the language-specific body and require suitable alternative text in that language before publication. Do not force the same body layout or inline image set across languages.
- The owner uploads images from the computer or chooses previously uploaded assets in the shared `/dashboard/media` library. The library is shared with Projects and later Services; it is not owned by Blog. Its full contract is still open in `media.md`.
- The rich-text editor should be reusable across V2 content modules, with module-specific capabilities where needed. Blog supports headings, emphasis, lists, links, quotes, inline images, tables, code blocks, and YouTube embeds. Store structured content and render it safely; do not accept arbitrary executable HTML or arbitrary embed code.
- Tags, not categories, organize articles. A tag has names in DE/EN/AR and can be created/edited in the dashboard. Keep a curated set and the public tag-filter pattern; do not create empty/thin tag landing pages solely for SEO.
- An article may link to one portfolio project, or none. No project link is required.
- The visible author is always **Yaman Warda**. No per-article author picker is needed.

## Article lifecycle

- Manual **Save** is the only way to persist editor changes. **There is no autosave.** Clearly indicate unsaved changes and warn before leaving or closing an editor with unsaved changes; never imply a change is safe before the save succeeds.
- Preview private or pending content in each language as a visitor would see it, without exposing a public preview link.
- Publish immediately or schedule the first publication for a chosen date and time in the Europe/Berlin timezone. A scheduled article must pass all publication requirements when scheduled.
- Scheduling freezes the approved content snapshot. Later manual saves do not alter what will publish. Explicitly cancel/replace the schedule to change that snapshot. The owner can change or cancel the time before publication. If a temporary service outage delays the job, publish the approved snapshot when processing resumes, once only, and surface the delay in the dashboard.
- Published articles may have separately saved pending edits. Visitors continue to see the previous published version until the owner chooses **Publish update**. The update must pass publication validation; an invalid attempt leaves the old public version and pending edits untouched. Updates are manual, not scheduled in the first version.
- Preserve article identity, URL, original publication date, read count, like count, and comments when publishing an update. Show a last-updated date after a real published update. Do not bump the original date merely to appear fresh.
- **Unpublish** removes the article and its comments from public pages, RSS, and sitemap while preserving content and counters privately. Re-publication restores the same article and its retained data. This is separate from permanent deletion.
- **Permanent delete**, with a clear confirmation, is available for both drafts and previously published articles. It removes the article, translations, comments and descendants, and article counters from V2. The URL stops serving the article. Shared media objects must not be deleted merely because this article is deleted; the Media specification owns reference-safe cleanup.

## Public blog, discovery, and engagement

- Preserve `/de/blog`, `/en/blog`, `/ar/blog` and their article routes, existing page appearance, responsive behavior, and language behavior except for the owner-approved new comments UI and supported rich-content rendering. Use bounded server-side pagination behind the existing public browsing pattern.
- Each published language page has an automatically generated self-referencing canonical URL, `hreflang` alternatives for all three languages, suitable title/description, social metadata using the cover when present, `BlogPosting` structured data, and a sitemap entry. No manual canonical field. Drafts, scheduled, unpublished, and deleted articles must not appear in public reads, sitemap, or RSS.
- Keep one RSS feed per language with the published article's stable URL/identity, title, summary, publication date, and tags. A published update refreshes its feed information without inventing a second article; unpublishing removes it from the current feed. Readers' previously saved copies cannot be recalled.
- Preserve simple read and article-like counts as visitor interaction, not as an SEO ranking claim. No reader account or durable visitor identity is required. Do not claim counts represent unique people. Apply proportionate abuse controls without breaking ordinary reading.
- Keep the existing tag filtering and optional project relation. Do not invent categories or a public-site redesign in this module.

## Comments — approved visitor experience

- Comments ship in the first Blog V2 release. A visitor submits **text only** with no account, name, or email. Publish an ordinary valid comment immediately; there is no owner approval queue. Use a generic visitor label in the UI and mark owner replies as Yaman Warda.
- Support replies to replies as a real comment tree from day one. Main threads appear newest first; replies within a thread follow chronological order. The Design Lab must prove readability and navigation on desktop and mobile even for deep branches; it may collapse visual branches without discarding parent relationships.
- The owner may reply, delete any comment, and switch comments on/off per article. Deleting a comment deletes its entire descendant subtree. When comments are off, both old comments and the form are hidden publicly, but the records remain in the dashboard and reappear if comments are enabled again. Dashboard visibility of new comments is enough; do not send comment email notifications.
- There is no reliable person-level ban without reader identity. Do not add device fingerprinting, long-term IP bans, or a misleading **Block user** control. The owner can remove abusive comments.
- Reject obvious automated abuse conservatively: excessive posting frequency, duplicate submissions, oversized payloads, excessive promotional links, and unsafe markup. Ordinary disagreement or criticism must not be suppressed by sentiment analysis. Use server-side validation and bounded, privacy-conscious anti-abuse controls. Normal comments publish immediately; a rejected submission gets a clear retryable or validation message. Exact thresholds/storage are engineering choices to document and test before release.
- Escape/render visitor text safely. Do not render visitor HTML or arbitrary scripts. Public comment and reply queries must be bounded and paginated, with deterministic order; do not fetch the whole tree to paginate in the browser. The dashboard comment list also needs server-side pagination.
- Before a public launch of anonymous comments, review the privacy notice, retention, abuse-control data, and handling of unlawful content for the German/EU deployment. This is a release check, not approval to invent a tracking system.

## Dashboard experience to take into Design Lab

- Use the accepted Dashboard V2 shell and English UI. Provide a server-paginated article list with clear draft, scheduled, published, unpublished, and pending-update states; search and tag/status filters; and article-level actions. The visual details require the owner's approval in the Design Lab.
- The editor should keep shared article settings separate from DE/EN/AR content, expose manual Save versus Publish/Publish update/Schedule distinctly, show publication blockers near relevant fields, and permit preview in each language. Warn about unsaved changes, scheduled snapshots, missing optional cover, and pending changes that are not public.
- Include a translated tag manager and a paginated comment-management view. Show nested context when replying or deleting a subtree; confirm destructive actions. Show new-comment activity inside the dashboard only.
- Use TanStack Form and the repository-wide validation behavior: errors after first submit, then on change, accessible field errors and focus management, pending/success/server-error states, and duplicate-submit prevention. Draft-save validation and publish/schedule validation are different.
- Present an isolated, interactive Design Lab with rendered desktop/mobile screens and states for list, editor, preview, schedule, tag management, and deep comment threads, including public DE/EN/AR and Arabic RTL effects. Explain recommendations and tradeoffs. Wait for explicit owner approval before production UI work.

## Proposed Backend2 route surface

The current Backend2 app is mounted at `/api/v2`; these names are the planned Blog contract to reconcile with the approved Media and Auth contracts before coding. Define typed request/response schemas and consistent error envelopes before treating the backend phase as complete.

Owner routes, protected by V2 owner auth:

| Method | Route | Purpose |
| --- | --- | --- |
| GET / POST | `/api/v2/owner/blog/posts` | Paginated list and create private draft |
| GET / PATCH / DELETE | `/api/v2/owner/blog/posts/:id` | Read, manually save, permanently delete |
| GET | `/api/v2/owner/blog/posts/:id/preview` | Owner-only pending preview by language |
| POST | `/api/v2/owner/blog/posts/:id/publish` | First publication or explicit update |
| POST | `/api/v2/owner/blog/posts/:id/schedule` | Freeze and schedule first publication |
| POST | `/api/v2/owner/blog/posts/:id/cancel-schedule` | Cancel a pending schedule |
| POST | `/api/v2/owner/blog/posts/:id/unpublish` | Hide publicly, retain privately |
| GET / POST | `/api/v2/owner/blog/tags` | Paginated tags and create tag |
| PATCH / DELETE | `/api/v2/owner/blog/tags/:id` | Edit or delete an unused tag safely |
| GET | `/api/v2/owner/blog/comments` | Paginated dashboard comments and activity |
| POST | `/api/v2/owner/blog/comments/:id/replies` | Owner reply to a comment |
| DELETE | `/api/v2/owner/blog/comments/:id` | Delete comment subtree |

Public routes (published, enabled content only):

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/v2/blog/posts` | Paginated language/tag-filtered summaries |
| GET | `/api/v2/blog/posts/:slug` | One published article in one language |
| GET | `/api/v2/blog/tags` | Public translated tags used by published posts |
| GET / POST | `/api/v2/blog/posts/:slug/comments` | Paginated root threads and submit comment/reply |
| GET | `/api/v2/blog/posts/:slug/comments/:id/replies` | Paginated children of a thread |
| POST | `/api/v2/blog/posts/:slug/read` | Increment simple read count with abuse limits |
| POST | `/api/v2/blog/posts/:slug/like` | Add/remove simple article like with abuse limits |

The public `/rss/{de,en,ar}.xml` and `/sitemap.xml` routes remain at their current public URLs. Image, video, and PDF upload/select/serve endpoints belong to the later approved shared Media module, not duplicate Blog-specific storage endpoints.

## Verification and acceptance

- Tests cover incomplete one-language drafts; all three publish/schedule requirements; cover and inline alt text; schedule snapshot immutability, cancellation, delayed idempotent execution; private pending edits versus public snapshot; update failure preserving the live article; unpublish/re-publish; permanent delete and reference-safe media handling.
- Tests cover owner authentication/authorization, public 404 for private/deleted articles, no private fields/media leakage, pagination/filter order, tag translation, shared slug stability, and public SEO/RSS/sitemap output for all three languages.
- Tests cover immediate anonymous comments, nested replies, root and child pagination, article comment toggle, subtree deletion, owner reply, conservative abuse rejection, safe text rendering, and counters surviving article updates.
- Verify typecheck, relevant tests, build, real Backend2 runtime, and browser flows in desktop/mobile and DE/EN/AR (including RTL) before reporting completion. A passing backend suite is not evidence that frontend or cutover is complete.
- No legacy data import or live cutover is part of this module's ordinary implementation. The old test article may disappear only at a separately approved cutover; do not delete it as a planning side effect.

## Handoff prompt for Claude — use after owner approval and Media planning

> Read `AGENTS.md`, `docs/v2/foundation.md`, this entire `docs/v2/blog.md`, the approved shared Media specification, and the current Backend2/Auth/Projects code before changing anything. This Blog specification records the owner's decisions; preserve legacy `/admin`, the current public site, the V2 database boundary, and all unrelated in-progress work. If the shared Media specification is still only the planning note in `docs/v2/media.md`, stop before implementing media-backed Blog work and report that dependency. Do not invent a project-only Blog upload system or silently refactor Projects media.
>
> If a material product decision is genuinely unanswered, ask the owner first. Otherwise implement and fully test the Backend2 Blog phase: article drafts and publication/scheduling snapshots, translations, tags, SEO/RSS data, counters, anonymous nested comments and owner actions, security/privacy controls, pagination, migrations, and typed API contracts. Use the V2 owner authentication guard for owner routes; never expose them remotely without it. Report exact tests and runtime evidence, plus anything not verified. Stop before production frontend.
>
> Then use the `frontend-design` skill to create an isolated interactive Blog Design Lab. Show rendered desktop/mobile dashboard flows and the approved public comment/rich-content additions in DE/EN/AR, including RTL and deep replies. Explain recommendations and tradeoffs; ask the owner only about material visual/UX choices and wait for explicit approval. After approval, build the production frontend with TanStack Form, connect it to the verified backend, and browser-test the complete flows.
>
> Finally review the exact Blog and approved Media-integration diff, tests, build, and staged files. Commit/push only the agreed module changes to `main-v2` after the whole connected module is complete and reviewed. Do not push `main`, deploy, migrate/delete legacy content, or cut over production without separate approval.

## Unresolved cross-module dependency, not another Blog questionnaire

`docs/v2/media.md` currently records the shared-library direction only. Its object model, public/private delivery, existing V2 project-image integration, reuse, video/PDF rules, and deletion policy must be planned and approved in a separate bounded Media session before the Blog implementation prompt above can run end to end. This does not reopen the Blog product questions answered here.
