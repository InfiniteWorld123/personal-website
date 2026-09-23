# Blog V2 — product and implementation plan

Status: **Backend2 and the Dashboard screens built and verified on 23 Sep 2026. The public blog pages and the public comment UI wait for the separate public cutover step (answer 2A).** The owner asked for this document to be executed that day. "What is built" below is the current state, including every decision taken while building; the frontend questions, the approved Design Lab and the Dashboard delivery follow at its end. Everything after it is the planning record the backend was built from. Where a dated note corrects it, the note wins. Shared Media is **built and running** as of 22 Sep 2026, so Blog's image flows have nothing to wait for: select through the shared picker, never build storage of its own. This document does not authorize unrelated changes to Projects or Auth.

## What is built — 23 Sep 2026

### Backend2

- `src/backend2/modules/blog/` — articles (`post.*`), tags (`tag.*`), comments (`comment.*`) and the two routes files. The rules shared with the future editor live in `src/backend2/contracts/blog.contract.ts`; its publication checklist is the function the server runs.
- `0006_blog.sql` adds seven tables: `v2_blog_posts` (identity, the fixed public address, pointers to at most three versions, the comment switch, the two counters), `v2_blog_post_versions` (the draft, a frozen schedule and the live snapshot), `v2_blog_post_texts` (one row per version per language), `v2_blog_post_tags`, `v2_blog_tags`, `v2_blog_tag_names` and `v2_blog_comments`. It starts empty; nothing is imported. **It is not applied to the owner's Neon database** — applying it is a change to a cloud database and waits for the owner's go-ahead. Everything below ran against throwaway databases.
- Saving cannot change what visitors see: public queries join only the live snapshot. A schedule is a frozen copy of the draft, validated in full when it is made; saves after it change only the draft.
- The rich-text body reuses the case-study nodes from `rich-text.contract.ts` (headings 2–4, emphasis, lists, links, quotes, inline images, tables, code blocks) and adds one Blog capability: a YouTube video, **stored as its eleven-character id only** and allowed only at the top level of an article, never inside a list, quote or table. No URL, no `<iframe>`, no embed code is ever accepted. The case study itself is unchanged; the only edit to the shared file exports its node schema.
- Images come only from shared Media. An article declares its files with `replaceReferences` at scope `draft`, `scheduled` and `published`, so a file an article uses cannot be deleted from Media, and only files of the live snapshot are served to visitors. A cover must be an image; a PDF is refused. Deleting an article forgets its uses and keeps the files.
- Nothing refers to Leads, Invoices, Booking, Inbox or Services. The optional project link reads the V2 Projects tables and shows a project to visitors only while that project is live itself.

### Routes, reconciled with the Backend2 conventions

Owner routes sit behind `ownerGuard`, like Projects and Services: absent outside local development (404, never 401), a V2 session required with `BACKEND2_OWNER_AUTH=required`, the CSRF header on every write, `no-store` on every reply.

| Method | Route | What it does |
| --- | --- | --- |
| GET | `/api/v2/owner/blog/posts` | List: `page`, `pageSize` (20, max 50), `search` (address, titles and summaries in every language), `state` (`draft`, `scheduled`, `published`, `pending`, `unpublished`), `tag` (a tag id), `sort` (`updated`, `created`, `published`), `language` |
| POST | `/api/v2/owner/blog/posts` | New private draft: optional `title` and the `language` it is written in |
| GET | `/api/v2/owner/blog/posts/slug-available` | Is an address free? For the editor while typing |
| GET | `/api/v2/owner/blog/posts/:id` | The draft, a schedule and the live snapshot beside it, the checklist with a field for each blocker, the counts |
| PATCH | `/api/v2/owner/blog/posts/:id` | **Save**. Only the fields sent change, down to one field in one language |
| DELETE | `/api/v2/owner/blog/posts/:id` | Permanent, with `{ confirm: "<the article id>" }` |
| GET | `/api/v2/owner/blog/posts/:id/preview?language=&version=` | `draft` (default), `scheduled` or `published`, through the public projection, images through the owner's route |
| POST | `/api/v2/owner/blog/posts/:id/publish` | **Publish** and **Publish update**, with `{ draftRevision }` |
| POST | `/api/v2/owner/blog/posts/:id/schedule` | `{ draftRevision, date: "YYYY-MM-DD", time: "HH:MM", snapshot: "draft" \| "keep" }` on the Berlin clock |
| POST | `/api/v2/owner/blog/posts/:id/cancel-schedule` | Discard the frozen snapshot |
| POST | `/api/v2/owner/blog/posts/:id/unpublish` | Off every public surface; kept privately, whole |
| POST | `/api/v2/owner/blog/posts/:id/discard-pending` | Throw pending edits away: the draft becomes the live version again |
| POST | `/api/v2/owner/blog/posts/:id/comment-setting` | `{ enabled }` — comments on or off, at once |
| GET / POST | `/api/v2/owner/blog/tags` | Paginated tags (50, max 100) with how many articles carry each; create with all three names |
| PATCH / DELETE | `/api/v2/owner/blog/tags/:id` | Rename or re-address; delete only when no version of any article carries it |
| GET | `/api/v2/owner/blog/comments` | Every comment newest first, or one article's threads (`parentId=root`), or one comment's replies (`parentId=<id>`, oldest first); `status=new`, `search`; the answer carries `newTotal` |
| POST | `/api/v2/owner/blog/comments/seen` | `{ ids }`, `{ postId }` or `{ all: true }` — "new comment activity" is this |
| GET | `/api/v2/owner/blog/comments/:id` | The comment, the conversation above it, and how many replies hang below it |
| POST | `/api/v2/owner/blog/comments/:id/replies` | The owner's reply, marked as Yaman Warda |
| DELETE | `/api/v2/owner/blog/comments/:id` | The comment and its whole subtree; answers how many went |
| GET | `/api/v2/blog/posts` | Live articles, newest first by original date: `language`, `offset`, `limit` (9, max 36), `tag` (a tag's address) |
| GET | `/api/v2/blog/posts/:slug` | One live article in one language |
| GET | `/api/v2/blog/tags` | The filter chips: tags at least one live article carries |
| GET / POST | `/api/v2/blog/posts/:slug/comments` | One page of threads, newest first (`cursor`, `limit` 10, max 30); post a comment or reply |
| GET | `/api/v2/blog/posts/:slug/comments/:id/replies` | One page of direct replies, oldest first (`cursor`, `limit` 10, max 50) |
| POST | `/api/v2/blog/posts/:slug/read` | One more read |
| POST | `/api/v2/blog/posts/:slug/like` | `{ liked: true }` or `{ liked: false }` |

Public article answers are cached for one minute, like Projects and Services; comment answers and every public write are `no-store`. The public routes are mounted only where a V2 database is configured, so the live site is unaffected. RSS and the sitemap page through `GET /api/v2/blog/posts`; the website keeps building `/rss/{de,en,ar}.xml`, `/sitemap.xml`, canonical, `hreflang` and `BlogPosting` from the answers at cutover.

The planning table did not have `slug-available`, `discard-pending`, `comment-setting`, `comments/seen` or `GET comments/:id`; they were added because the sibling modules have the first two and the specification's comment and "new activity" requirements need the others. Unlike the planning table, `like` takes `{ liked }` rather than two methods.

### Decisions taken while building

The specification left these open or to engineering. Each can be changed.

| Question | Decision | Why |
| --- | --- | --- |
| When is the address fixed? | When the article is first **scheduled or published**. A cancelled schedule of a never-published article gives it back. An address is unique among articles for as long as the article exists; permanent delete frees it. | "After first publication, keep it stable"; a schedule must not lose its address while it waits. |
| What can be scheduled? | Only a **first** publication. A live article changes through **Publish update**; a taken-down one is published again directly. **Publish** is refused (`ARTICLE_SCHEDULED`) while a schedule waits, so a schedule is never overtaken silently. | The specification's wording; updates are manual in the first version. |
| Moving a schedule | `snapshot: "keep"` moves the time and keeps the frozen content; `"draft"` freezes the current draft instead. | "Change or cancel the time"; "explicitly cancel/replace the schedule to change that snapshot". |
| Berlin time | The owner sends a date and a time on the Berlin clock. 02:30 on the last Sunday of March does not exist and is refused; 02:30 on the last Sunday of October happens twice and means the first, summer-time one. The time must be in the future and within 366 days. | One reading of a chosen time, whatever the owner's laptop is set to. |
| Who publishes a due schedule? | `publishDuePosts`, which runs before every public Blog read and every Dashboard list, and as `bun run db2:blog:publish-due`. Each due article is locked and published in its own transaction, so it happens exactly once. | Works on a machine with no scheduler. **In deployment a Cloudflare Cron Trigger calling it every minute is still needed** — see prerequisites. |
| The publication time of a schedule | The moment it actually went live. If that is more than **5 minutes** after the scheduled time, the Dashboard receives `publicationDelay` with both times. | "Surface the delay". Without the cron, "late" also means nobody asked in the meantime. |
| When does "last updated" appear? | Only after a publication that changed what the article **says** — a title, summary, body or cover in any language — compared with what was last live, including after a take down. A new tag, an SEO text or a corrected alt text does not date the article. The original date never moves. | "A real published update… do not bump the original date merely to appear fresh." |
| A save that changes nothing | Writes nothing and keeps the revision. A save that makes the draft equal to what is live again makes the article "Live" again; the same for a schedule. | As Services. |
| Two tabs | A stale `draftRevision` is a 409, never an overwrite. | As Projects and Services. |
| Tags | All three names at creation, each at most 40 characters and unique in its language; the address is suggested from the English name. Renaming takes effect everywhere at once. At most 10 tags per article. | A tag missing a language would be a missing filter chip; the legacy blog had the same rule. |
| Limits | Title 160, summary 400, SEO title 80, SEO description 200, alt text 500; per language at most 30 images, 10 videos and 100,000 characters; at most 60 distinct files per article. | Generous ceilings; the editor can guide more softly. |
| A body that counts as written | Any words, image or video. Empty paragraphs do not. | An article that is one video and its summary is still an article. |
| Comments on or off | Immediate, not waiting for **Publish update**, and on by default. The owner may still reply while comments are off; the reply waits with the thread. | Switching comments off is the thing that must happen now. |
| Owner replies | Held to the length rule only (links allowed); replying marks the comment as seen. No top-level owner comment. | "The owner may reply." |
| Thread depth | 20 levels; a deeper reply is refused with a reason. | A real tree without letting a script build a chain ten thousand deep. |
| Reads and likes | Per article, across languages. The browser remembers what it counted, as the legacy blog does; the server keeps two integers. | "Do not claim counts represent unique people." |

### Comment abuse controls — the thresholds the specification asked for

| Control | Threshold | Answer |
| --- | --- | --- |
| Size | 3,000 characters after normalising (one kind of line break, no invisible control or bidirectional-override characters, never more than one blank line); requests over 16 KB are refused unread | 422 `too_long`, 413 |
| Links | More than 2 | 422 `COMMENT_REJECTED`, `too_many_links` |
| Markup | Only markup that would *do* something: `<a href=`, a `<script>…</script>` or `<script src=`, `<iframe src=`, an HTML event handler, `[url=` / `[link=`. Text that merely mentions `<script>` or `<img>` is kept exactly as written and always shown escaped. | 422 `markup` |
| Hidden field | A `website` field the page hides from people; a script that fills it is refused | 422 `rejected` |
| Frequency | Per sender 3 a minute and 15 an hour; per article 100 an hour from everyone together | 429 `too_fast` |
| Copies | The same text of 20+ characters on the same article within a day, from anyone; the same text of any length twice from the same sender within a day | 409 `DUPLICATE_COMMENT` |
| Reads / likes | 120 reads and 60 like changes an hour per sender | 429 `too_fast` |

"Sender" is a keyed hash (HMAC with `AUTH_V2_SECRET`) of the address in the shared `v2_auth_rate_limits` table, which forgets it within two days. No comment row stores an address, a name, a fingerprint or a cookie id. Nothing judges sentiment. Every refusal carries a stable `details.reason` for the website to translate.

### Verified on 23 Sep 2026

- `bun run typecheck`, the whole test suite (888 tests, 1 skipped), and `bun run build`.
- `src/tests/backend2-blog.test.ts` (46) and `src/tests/backend2-blog-comments.test.ts` (20) against a real PostgreSQL inside the test process: one-language drafts; all-language publication and scheduling rules; cover and inline alt text; YouTube stored by id only and refused anywhere but the top; the Berlin clock across both clock changes; frozen schedules, moving, replacing and cancelling them, publishing once, and the late notice; pending edits beside the untouched live version; a refused update writing nothing; take down and republish with date, counters and comments intact; the fixed address; files undeletable while used and served only while live; permanent delete; tags; the Dashboard list; 404 from a non-local host on all 22 owner routes and 401 without a session; nothing private or from another language in a public answer; comments, replies, both paginations, every refusal, the owner's reply, subtree delete, the comment switch, and the counters.
- The running app over real HTTP, against a throwaway database, signed in with a real V2 session: 50 checks from creating a draft to deleting everything again, including the CSRF and foreign-origin refusals, a real image upload, the cover private before publication and public after it, comments and replies, and a schedule two minutes ahead that went live on the next request. The test machine paused the script for 16 minutes, so that schedule was published 16 minutes late — and the Dashboard reported it as late, which is the designed behaviour.
- The production build, started locally with `BACKEND2_OWNER_API=local` deliberately set: every owner route answered 404, while the public reads answered.

### Not verified, and prerequisites before a public release

- **Neon.** `0006_blog.sql` is not applied to the owner's database; the Dashboard screens will need it.
- **A Cloudflare Cron Trigger** calling `publishDuePosts` every minute, so a schedule goes live on time and gets its correct date with no visitor traffic. Without it, a schedule publishes on the first request after its time.
- **`AUTH_V2_SECRET`** must be set wherever the public comment and counter routes run: it keys the sender hash.
- **YouTube on the public site.** The production Content-Security-Policy allows no YouTube frame today; the embed also sends visitor data to Google. How it loads is a frontend question below.
- **The privacy review** the specification requires before anonymous comments go public: the notice, retention, the two-day rate-limit hashes, and handling unlawful content.
- **The public website** still reads the legacy blog. Connecting `/blog`, the article pages, RSS and the sitemap to Backend2 changes what visitors see, so it waits for the owner's decision.

### Frontend questions put to the owner, 23 Sep 2026 — answered the same day

Asked after backend verification, as the handoff orders.

| Question | Answer |
| --- | --- |
| How does a YouTube video load on the public page? | **Only after the visitor clicks it (1A).** Until then the page shows a placeholder and nothing is requested from Google. The production Content-Security-Policy gains the one YouTube frame origin at cutover, not before. |
| Are the public blog pages and the new comment section connected to Backend2 in this module? | **No — later, as a separate step, like Projects and Services (2A).** This module's production frontend is the Dashboard. The public comment section and the new rich-content rendering are designed and approved in the Design Lab now, and built and connected at the public cutover step, together with RSS and the sitemap. |

Everything else — where comment management and tags sit inside Blog, the visitor label, and how deep branches fold — is shown with a recommendation in the Design Lab rather than asked.

### Design Lab — presented and approved 23 Sep 2026

**The owner approved the lab with every recommendation (`1A 2A 3A 4A 5A 6A 7A`) and its new public words, the same day.** Per 2A, the production frontend of this module is the Dashboard; the public comment section, the click-to-load video and the table styling are built at the public cutover step from this approved design.

`https://claude.ai/artifact/Da78kfw5xVgPvtHAAiecNU` — private to the owner. Nothing in the repository.

One page with the English Dashboard and the DE/EN/AR public blog side by side, sharing one sample blog: eight invented articles, one in every state (draft with blockers, scheduled with a later-edited draft, live, live with pending edits, taken down, live after a late schedule, comments switched off), their comments — including a branch seven levels deep — and eight tags. The public side reads only published snapshots, so a save visibly changes nothing and **Publish update** visibly does. It covers the articles list (search, state, tag, sort, pages), the one-page editor (the three-versions strip — draft, frozen schedule, live — address, tags, project, cover and inline pictures from the shared Media picker with its upload, three language tabs with the rich-text editor and its new YouTube button, search appearance, the checklist beside it, readers and the immediate comment switch, take down, discard, delete), the schedule dialog on the Berlin clock, the private preview of any version, the comments activity list with the conversation view and subtree delete, the tag manager and its refusal, the public list and article with tables, the click-to-load video, the comment form with every refusal in three languages, replies and folding, loading/empty/error states, a stale second tab, a failing save, light and dark, desktop and phone width, and Arabic RTL. The rules in it are the contract's.

Seven decisions, each with a recommendation (`A` everywhere):

| # | Question | Recommended |
| --- | --- | --- |
| 1 | Where comments and tags live in the Dashboard | Tabs inside Blog, the new-comment count beside **Blog** in the sidebar |
| 2 | The label beside a visitor's comment | Gast / Guest / زائر |
| 3 | Deep reply branches | Indented up to 5 levels (3 on a phone), then "Continue this conversation" |
| 4 | Where the comment form sits | Above the comments |
| 5 | Unsaved changes when pressing Publish / Schedule / Preview | Saved first, in the same click, as in Projects and Services |
| 6 | Confirming a permanent delete | Type the article's title |
| 7 | One conversation per article, or one per language | One per article, as the backend is built |

The lab also lists the new public words — the comment section, the refusals, the video notice and "Updated on" — for approval with the design.

### Dashboard — built and verified 23 Sep 2026

Built from the approved lab, connected to the verified Backend2 routes. English, like the rest of Dashboard V2.

- **Where it lives.** `/dashboard/blog` (articles), `/dashboard/blog/comments` (`?post=` narrows to one article, `?status=new` to the unseen), `/dashboard/blog/tags`, and `/dashboard/blog/$postId` for one article (`?language=` opens that tab). The placeholder route is gone. The three tabs are links, so each has an address and Back works (1A). The sidebar shows the unseen-comment count beside **Blog**, read every minute and silent when Backend2 does not answer.
- **Code.** `src/frontend/features/blog-v2/` — the API client and query hooks, the editor values and their save/publish checks (`blog-form.ts`), the editor's body normaliser (`blog-document.ts`), Berlin-clock wording, the dialog shell, the rich-text editor and the preview body. `src/frontend/pages/dashboard/blog/` — the list, the editor, comments, tags, schedule and preview. `features/blog/` is still the legacy blog and is untouched.
- **The editor is the Projects editor, extended** (`docs/v2/blog.md`: one reusable editor with module-specific capabilities). `CaseStudyEditor.tsx` now exports its toolbar, image node and content styles, with one optional slot after the table button; Projects behaves exactly as before. The Blog adds a picture's alternative text directly under the picture, in the language being written, and the **YouTube** button: a dialog takes a link, keeps only the eleven-character id, and places the video after the block the cursor is in — the document itself refuses a video anywhere but the top level.
- **Forms.** TanStack Form with `revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' })` for the editor, new article, schedule, YouTube, tag and owner-reply forms: quiet until the first attempt, then checking as the owner types; errors beside their fields with `aria-invalid` and a description; focus on the first invalid field — switching to its language tab first, and for a picture, to that picture's description. Save checks shape and limits only; Publish and Schedule check the publication rules, and their sentences appear beside the fields and in the checklist, in page order.
- **Saving.** Manual only. A save sends only what changed, with the revision it was based on. Publish, Schedule and Preview save first in the same click (5A); a refused Publish still keeps the saved work and publishes nothing. If another tab saved in between, nothing is overwritten: a banner offers **Reload**, and the owner's typing stays on screen until they choose it. Leaving with unsaved work asks first, in the app and when closing the tab.
- **Delete** asks for the article's title to be typed (6A); the request still sends the article's id. Comments show **Guest** for a visitor (2A). Tags in use cannot be deleted: the refusal lists the articles that carry them.

Taken while building, beyond the lab:

| Decision | Why |
| --- | --- |
| The section shortcuts (Address & tags · Cover · Article) are buttons that scroll, and the unsaved-work guard ignores moves within the article's own address | As `#` links they changed the address, and the guard read that as leaving: "Leave without saving?" appeared on a click that went nowhere. Found in the browser. |
| Blog dialogs are drawn at the Dashboard's root | One opened from inside the editor was a form inside a form, and one opened from the Arabic tab would inherit its direction. |
| An image of unknown size is stored with `null`, never `0` | The case study's normaliser reads a missing size as 0, which the server refuses; the Blog's normaliser corrects it. |
| The editor's writing area fills its box | Clicking below the first line now starts writing. |

Verified the same day:

- `bun run typecheck`, the whole suite (928 tests, 1 skipped) and `bun run build`. `src/tests/blog-ui.test.tsx` (39) covers the editor values, the patch, the save and publish checks and their order, the body normaliser against the server's own schema (a save leaves nothing "unsaved"), the Berlin clock, and the screens against a faked API: list states, filters on the server, new article, save, refused and successful publish with focus, the second-tab conflict, the comment switch, the fixed address, typed-title delete, not-found, schedule refusal and keep-the-frozen-version, tag validation and refusal, conversation reply and branch delete, the sidebar count.
- In the browser, against a throwaway in-memory database with a real V2 session — never Neon: tags created with validation; a new article; cover and inline picture from Media with descriptions in three languages; the rich-text toolbar; the YouTube dialog refusing a non-YouTube link and inserting a video; saving (the server stored the video as its id and the picture as its library id); a Publish refused for an empty Arabic article, which saved first, opened the Arabic tab and put the cursor there; publishing; edits after publishing ("Live · edited", visitors unchanged); preview of draft and live in three languages with Arabic right to left; discard; comments posted through the public API, the count beside Blog, the conversation, an owner reply, a branch delete and "Mark all as seen"; schedule refusing the spring clock change, scheduling, moving the time while keeping the frozen version, cancelling; the tag refusal; take down and publish again; typed-title delete; the leave warning; the second-tab conflict; the comment switch hiding comments from visitors at once; phone width and light and dark. The test image, the throwaway database, the temporary launch entry and the test cookies were removed afterwards.

Still open before real use or release:

- **Neon.** The Dashboard needs `0006_blog.sql` in the owner's database. Applying it is a cloud change and waits for the owner's go-ahead.
- Everything under "Not verified, and prerequisites before a public release" above still applies: the Cron Trigger, `AUTH_V2_SECRET`, the YouTube frame origin at cutover, the privacy review, and the public cutover itself — the public pages, the comment section and folding (3A, 4A), RSS and the sitemap.

## Owner communication — mandatory

Use very simple Arabic with the owner, even when the owner writes English, in
natural right-to-left Arabic prose.
Explain any necessary technical word in the same sentence, lead with what
happened and whether the owner needs to act, and distinguish local work from a
later public release. Keep English identifiers in backticks, avoid unnecessary
internal detail, and ask small batches of material questions while saying how
many remain. The complete rule is in `AGENTS.md`.

## Goal and boundaries

Build an owner-managed, trilingual blog in Backend2 and `/dashboard/blog`. Preserve the accepted public blog routes and visual identity while replacing their data source at an explicitly approved cutover. The owner wants useful articles, strong technical SEO foundations, and a low-friction place for readers to comment. SEO implementation is not a promise of rankings or traffic.

V2 uses `src/backend2/` and its own database. Do not write to the legacy database or remove `/admin`. The single owner is the only dashboard editor. Public readers do not need accounts. The old article was test content: do not import it into V2, and do not remove it from the live site until a separate cutover explicitly permits that change. Calendar, Inbox, Leads, Services, and their workflows are outside this module.

## Approved content model

- An article has one stable shared slug across German, English, and Arabic. It may be edited while private; after first publication, keep it stable. Changing a published URL requires a separately planned redirect, not a silent rename.
- A private draft can contain only one language and can be saved incomplete. Publishing or scheduling requires a complete title, short summary, and nonempty rich-text body in **all three** languages.
- Each language has its own body, optional editable SEO title and meta description with defaults from title/summary, and image alternative text. SEO overrides are not required merely to publish.
- A single cover image can be used across languages. It is optional; the editor warns if missing. When present, its alternative text is required in all three languages before publication.
- Inline images belong to the language-specific body and require suitable alternative text in that language before publication. Do not force the same body layout or inline image set across languages.
- Every Blog image, including the cover and images inserted in rich text, is selected through the shared `/dashboard/media` picker. If the file is not there, **Upload from computer** first creates a persistent asset in Media, then selects it for the article. Blog has no separate upload path or image store. The library is shared with Projects and other modules. It is built; `media.md` records the contract and the delivery.
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
- The editor should keep shared article settings separate from DE/EN/AR content, expose manual Save versus Publish/Publish update/Schedule distinctly, show publication blockers near relevant fields, and permit preview in each language. Use the shared Media picker for cover and inline images, including its upload-into-Media action. Warn about unsaved changes, scheduled snapshots, missing optional cover, and pending changes that are not public.
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

The public `/rss/{de,en,ar}.xml` and `/sitemap.xml` routes remain at their current public URLs. Image, video and document upload/select/serve endpoints belong to the shared Media module — built on 22 Sep 2026 and running at `/api/v2/owner/media` — not to duplicate Blog-specific storage endpoints.

## Verification and acceptance

- Tests cover incomplete one-language drafts; all three publish/schedule requirements; cover and inline alt text; schedule snapshot immutability, cancellation, delayed idempotent execution; private pending edits versus public snapshot; update failure preserving the live article; unpublish/re-publish; permanent delete and reference-safe media handling.
- Tests cover owner authentication/authorization, public 404 for private/deleted articles, no private fields/media leakage, pagination/filter order, tag translation, shared slug stability, and public SEO/RSS/sitemap output for all three languages.
- Tests cover immediate anonymous comments, nested replies, root and child pagination, article comment toggle, subtree deletion, owner reply, conservative abuse rejection, safe text rendering, and counters surviving article updates.
- Verify typecheck, relevant tests, build, real Backend2 runtime, and browser flows in desktop/mobile and DE/EN/AR (including RTL) before reporting completion. A passing backend suite is not evidence that frontend or cutover is complete.
- No legacy data import or live cutover is part of this module's ordinary implementation. The old test article may disappear only at a separately approved cutover; do not delete it as a planning side effect.

## Handoff prompt for Claude — execute on the owner's read-to-build request

> Read `AGENTS.md`, `docs/v2/foundation.md`, this entire `docs/v2/blog.md`, the shared Media specification, and the current Backend2/Auth/Projects code before changing anything. This Blog specification records the owner's decisions; preserve legacy `/admin`, the current public site, the V2 database boundary, and all unrelated in-progress work. Verify the shared Media contract is actually implemented before connecting media-backed Blog flows; if it is not, report the dependency rather than invent a Blog-only upload system or silently refactor Projects media.
>
> If a material product decision is genuinely unanswered, ask the owner first. Otherwise implement and fully test the Backend2 Blog phase: article drafts and publication/scheduling snapshots, translations, tags, SEO/RSS data, counters, anonymous nested comments and owner actions, security/privacy controls, pagination, migrations, and typed API contracts. Use the V2 owner authentication guard for owner routes; never expose them remotely without it. Report exact tests and runtime evidence, plus anything not verified. Stop before production frontend.
>
> After backend verification, ask the owner only about material frontend/UX decisions still unanswered. Then use the `frontend-design` skill to create an isolated interactive Blog Design Lab. Show rendered desktop/mobile dashboard flows and the approved public comment/rich-content additions in DE/EN/AR, including RTL and deep replies. Explain recommendations and tradeoffs; wait for explicit visual approval. After approval, build the production frontend with TanStack Form, connect it to the verified backend, and browser-test the complete flows.
>
> Finally review the exact Blog and approved Media-integration diff, tests, build, and staged files. Commit/push only if the owner requests that Git action, with the agreed module changes going to `main-v2`. Do not push `main`, deploy, migrate/delete legacy content, or cut over production without separate approval.

## Unresolved cross-module dependency, not another Blog questionnaire

~~Unresolved cross-module dependency.~~ **Resolved, 22 Sep 2026: shared Media is built.** The library, its public/private delivery and the shared picker all exist and are verified, so Blog has nothing to wait for and still no reason to build storage of its own.

What Blog does when it is built: import `MediaPicker` from `src/frontend/features/media/MediaPicker`, and declare which files an article uses by calling `replaceReferences` from `src/backend2/modules/media/media.service` — in-process, never over HTTP, because a reference is what makes a file undeletable and, at `published` scope, publicly reachable. Use the scope that matches the snapshot: `draft` while editing, `published` once live, `scheduled` for a frozen future publication. Alt text belongs to Blog's own tables, not to Media: the same photograph needs different alt text in each language.

None of this reopens the Blog product questions answered above.
