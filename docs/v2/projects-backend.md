# Projects V2 — backend specification

Status: historical initial Backend2 Projects specification. The owner's
explicit read-to-build instruction is approval to work on its agreed backend
scope under `AGENTS.md`; first compare it with current code and the later
shared Media amendment below. Do not reproduce superseded media behavior.

Scope: the Backend2 half of the Projects module only — database, migrations,
API, storage, validation, security boundary, and tests. The Dashboard Projects
UI and the public-site wiring are deliberately **not** in this document; their
rendered design is reviewed separately before they are built.

**Shared Media amendment (later owner decision):** The owner now requires all
Project cover, gallery, and inline images to be selected through the private,
shared `/dashboard/media` library. An upload from a Project editor must first
create a persistent asset in that library. This supersedes this document's
project-scoped upload, same-project-only image validation, project-owned object
keys, and automatic orphan deletion/sweep rules in §§4, 5, 7, and 10, plus the
corresponding endpoints and tests. Those sections describe the initial Projects
backend slice and must **not** be copied as the final integrated Media design.
See `docs/v2/media.md` and `docs/v2/projects.md`. The current Projects code may
still follow this initial slice: do not silently change its migration or delete
existing files. Plan and test a separate safe integration/migration preserving
existing objects, private drafts, published snapshots, and references after the
shared Media specification is approved. Non-media Projects decisions here are
not changed by this amendment.

This document assumes `docs/v2/foundation.md`, `docs/v2/projects.md` and
`AGENTS.md`. Where `projects.md` records a confirmed decision, it wins. Where it
recorded a provisional choice, the decision is restated here explicitly.

---

## 1. Decisions confirmed for this specification

Six questions were open when planning started. The owner answered them:

| # | Question | Decision |
|---|---|---|
| D1 | Where does the V2 database live? | A **separate PostgreSQL database** reached through its own `DATABASE_URL_V2`. |
| D2 | What is Backend2 built on? | **Elysia**, as an independent application that imports nothing from `src/backend/`. |
| D3 | Where do project images live? | A **new, private R2 bucket**. Every image — pending or published — is served through a Backend2 route. No public bucket hostname. |
| D4 | What happens when a project is deleted? | **Archive by default, with a separate permanent delete** behind an explicit confirmation. |
| D5 | What are the work-status values? | Exactly two: `in_progress` and `completed`. |
| D6 | May a published slug change? | **Yes**, and every previously published slug keeps resolving to the project so old links do not break. |

### Decisions taken in this document (flag any you disagree with)

- **D7 — Everything a visitor can see belongs to a *version*.** Not only text
  and images: the slug, the project type, the work status, the client name, the
  links and the technology list too. This is what makes the owner's rule
  literally true — *nothing* a visitor sees changes until **Publish update**.
- **D8 — A project has at most two versions at a time:** the private draft and
  the live published one. Publishing copies the draft into a new published
  version and deletes the previous one. There is no published-version history,
  because none was asked for and keeping one makes image cleanup unreliable.
- **D9 — Publication requires name and summary in all three languages, not the
  category label.** `projects.md` names "a project name, type, and short
  summary". The eyebrow/category label stays optional; when it is empty the
  public page falls back to the project type.
- **D10 — Manual order is global and covers every project, published or not.**
  One integer position per project. The public list is that same order filtered
  to published projects, so moving something on Dashboard page 3 lands exactly
  where the owner meant it.
- **D11 — The Dashboard list shows 20 projects per page** (max 50). The public
  list is served in batches of 6, as today.
- **D12 — The public API never issues an HTTP redirect.** A project fetched by
  an old slug answers `200` and states its `canonicalSlug`; the *frontend*
  decides to redirect. This keeps the API a pure data API.
- **D13 — Public reads are only mounted when the V2 database is configured.**
  `DATABASE_URL_V2` will not exist in production for now, so `/api/v2/projects`
  simply does not answer there. Nothing on the live site changes.

---

## 2. Non-goals

- No Dashboard Projects UI, and no editor.
- No change to `/work`, `/`, or any public page. The public site keeps reading
  the legacy backend until a separate approved step moves it.
- No V2 authentication, no session, no MFA. The existing `/dashboard` guard and
  the legacy `/admin` login stay exactly as they are.
- No write of any kind to the legacy database.
- No deployment, no commit, no push.
- No shareable preview links. Preview is local and owner-only.

---

## 3. Vocabulary

| Term | Meaning |
|---|---|
| **Project** | The stable identity: an id, a position in the manual order, and whether it is active or archived. Holds no visitor-visible content itself. |
| **Draft version** | The single private working copy. Always exists. This is what the editor edits. |
| **Published version** | The frozen copy visitors read. Exists only while the project is published. |
| **Pending changes** | The draft differs from the published version. Visible to the owner, invisible to visitors. |
| **Media object** | One uploaded file in R2, plus its row in the database. Immutable once written. |
| **Position** | The project's 1-based place in the one global manual order. |

### Lifecycle states

A project is always in exactly one of these, derived — never stored twice:

| State | `published_version_id` | Draft equals published | `lifecycle` |
|---|---|---|---|
| `draft` | `NULL` | — | `active` |
| `published` | set | yes | `active` |
| `published_with_pending_changes` | set | no | `active` |
| `unpublished` | `NULL`, but `first_published_at` set | — | `active` |
| `archived` | `NULL` | — | `archived` |

Archiving a published project unpublishes it first, in the same transaction.

---

## 4. Database

### 4.1 Separation from legacy

- A **different PostgreSQL database**, reached through `DATABASE_URL_V2`.
- Its own migration ledger, `v2_schema_migrations`. The legacy
  `schema_migrations` table is never read or written.
- Its own client module, `src/backend2/db/client.ts`. It does not import
  `src/backend/db/client.ts`.
- **A refusal, not a convention:** both the client and the migration runner
  throw at startup if `DATABASE_URL_V2` is missing, or if it is byte-identical
  to `DATABASE_URL`. A typo in `.env` therefore cannot point V2 at the legacy
  database — it stops the process instead.
- Every table is prefixed `v2_`, so even a misconfigured connection string
  cannot collide with a legacy table name.

### 4.2 Migration history

```
src/backend2/db/migrations/0001_projects.sql
src/backend2/db/migrate.ts          -- the runner
```

New script: `bun run db2:migrate`. The runner is the same shape as the legacy
one — ledger table, sorted filenames, one transaction per file — with the
`DATABASE_URL_V2` safety check added before the first statement.

### 4.3 Schema — `0001_projects.sql`

```sql
-- Identity, order, lifecycle. No visitor-visible content lives here (D7).
CREATE TABLE v2_projects (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    position             integer NOT NULL,
    lifecycle            text NOT NULL DEFAULT 'active',
    draft_version_id     uuid,
    published_version_id uuid,
    first_published_at   timestamptz,
    published_at         timestamptz,
    archived_at          timestamptz,
    -- Bumped on every draft save. The editor sends it back; a stale value is a
    -- 409 rather than a silent overwrite from a second browser tab.
    draft_revision       integer NOT NULL DEFAULT 1,
    created_at           timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_projects_lifecycle_check CHECK (lifecycle IN ('active', 'archived')),
    -- Deferred so one transaction can renumber the whole order without
    -- tripping over itself halfway through.
    CONSTRAINT v2_projects_position_unique UNIQUE (position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE v2_project_versions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       uuid NOT NULL REFERENCES v2_projects (id) ON DELETE CASCADE,
    kind             text NOT NULL,
    slug             text NOT NULL DEFAULT '',
    type             text NOT NULL,
    work_status      text NOT NULL DEFAULT 'in_progress',
    client_name      text,
    -- A client's name is never published because it happens to be stored.
    show_client_name boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_project_versions_kind_check CHECK (kind IN ('draft', 'published')),
    CONSTRAINT v2_project_versions_type_check CHECK (type IN ('demo', 'personal', 'client')),
    CONSTRAINT v2_project_versions_status_check CHECK (work_status IN ('in_progress', 'completed')),
    -- Empty while drafting; publication validation demands a real one.
    CONSTRAINT v2_project_versions_slug_check
        CHECK (slug = '' OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE UNIQUE INDEX v2_project_versions_one_per_kind
    ON v2_project_versions (project_id, kind);

ALTER TABLE v2_projects
    ADD CONSTRAINT v2_projects_draft_fk
        FOREIGN KEY (draft_version_id) REFERENCES v2_project_versions (id)
        ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT v2_projects_published_fk
        FOREIGN KEY (published_version_id) REFERENCES v2_project_versions (id)
        ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

-- Every slug the project has ever been published under (D6). Written on
-- publish, never on a draft save, and it is also what guarantees two projects
-- cannot claim the same public URL.
CREATE TABLE v2_project_slugs (
    slug       text PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES v2_projects (id) ON DELETE CASCADE,
    is_current boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX v2_project_slugs_current_idx
    ON v2_project_slugs (project_id) WHERE is_current;

-- Three rows per version, always, so the editor never meets a missing language.
CREATE TABLE v2_project_texts (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id     uuid NOT NULL REFERENCES v2_project_versions (id) ON DELETE CASCADE,
    language       text NOT NULL,
    name           text NOT NULL DEFAULT '',
    category_label text NOT NULL DEFAULT '',
    summary        text NOT NULL DEFAULT '',
    -- The rich-text document, or NULL when this language has no case study.
    case_study     jsonb,
    CONSTRAINT v2_project_texts_language_check CHECK (language IN ('de', 'en', 'ar')),
    CONSTRAINT v2_project_texts_unique UNIQUE (version_id, language)
);

-- One uploaded file. Immutable: editing an image means uploading a new one.
CREATE TABLE v2_media_objects (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid NOT NULL REFERENCES v2_projects (id) ON DELETE CASCADE,
    -- The R2 object key. Never leaves the server.
    storage_key  text NOT NULL UNIQUE,
    content_type text NOT NULL,
    byte_size    integer NOT NULL,
    width        integer NOT NULL,
    height       integer NOT NULL,
    -- SHA-256 of the bytes. Serves as the ETag and makes re-uploading the same
    -- file cheap instead of duplicated.
    checksum     text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_media_objects_size_check
        CHECK (byte_size > 0 AND width > 0 AND height > 0)
);

CREATE INDEX v2_media_objects_project_idx ON v2_media_objects (project_id);

-- Which images a version uses, and how. `inline` rows are derived from the
-- case-study documents on every save; they exist so one query can answer
-- "is this object still needed?".
CREATE TABLE v2_project_images (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id      uuid NOT NULL REFERENCES v2_project_versions (id) ON DELETE CASCADE,
    -- RESTRICT, not CASCADE: an object that a version still points at may not
    -- be deleted out from under it.
    media_object_id uuid NOT NULL REFERENCES v2_media_objects (id) ON DELETE RESTRICT,
    role            text NOT NULL,
    position        integer NOT NULL DEFAULT 0,
    CONSTRAINT v2_project_images_role_check CHECK (role IN ('cover', 'gallery', 'inline')),
    CONSTRAINT v2_project_images_unique UNIQUE (version_id, media_object_id, role)
);

CREATE UNIQUE INDEX v2_project_images_one_cover
    ON v2_project_images (version_id) WHERE role = 'cover';

CREATE INDEX v2_project_images_order_idx
    ON v2_project_images (version_id, role, position);

-- Alt text for cover and gallery images. An inline image carries its own alt
-- inside the case-study document, because it is already per language there.
CREATE TABLE v2_project_image_texts (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_image_id uuid NOT NULL REFERENCES v2_project_images (id) ON DELETE CASCADE,
    language         text NOT NULL,
    alt              text NOT NULL DEFAULT '',
    CONSTRAINT v2_project_image_texts_language_check CHECK (language IN ('de', 'en', 'ar')),
    CONSTRAINT v2_project_image_texts_unique UNIQUE (project_image_id, language)
);

CREATE TABLE v2_project_links (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id uuid NOT NULL REFERENCES v2_project_versions (id) ON DELETE CASCADE,
    kind       text NOT NULL,
    url        text NOT NULL,
    -- Default false: a link that exists is not a link that is published.
    is_public  boolean NOT NULL DEFAULT false,
    position   integer NOT NULL DEFAULT 0,
    CONSTRAINT v2_project_links_kind_check CHECK (kind IN ('website', 'source', 'other'))
);

CREATE UNIQUE INDEX v2_project_links_single_idx
    ON v2_project_links (version_id, kind) WHERE kind <> 'other';

CREATE INDEX v2_project_links_order_idx ON v2_project_links (version_id, position);

CREATE TABLE v2_project_link_texts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_link_id uuid NOT NULL REFERENCES v2_project_links (id) ON DELETE CASCADE,
    language        text NOT NULL,
    label           text NOT NULL DEFAULT '',
    CONSTRAINT v2_project_link_texts_language_check CHECK (language IN ('de', 'en', 'ar')),
    CONSTRAINT v2_project_link_texts_unique UNIQUE (project_link_id, language)
);

CREATE TABLE v2_project_tech (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id uuid NOT NULL REFERENCES v2_project_versions (id) ON DELETE CASCADE,
    name       text NOT NULL,
    position   integer NOT NULL DEFAULT 0,
    CONSTRAINT v2_project_tech_unique UNIQUE (version_id, name)
);

-- The public list is always "active, published, in the owner's order".
CREATE INDEX v2_projects_public_order_idx ON v2_projects (position)
    WHERE lifecycle = 'active' AND published_version_id IS NOT NULL;
```

### 4.4 Why two versions rather than a "pending changes" flag

A flag would mean one set of rows carrying both the live content and the edits,
and every public query would have to remember which columns are safe. One
forgotten `WHERE` and a visitor sees an unfinished sentence or an unapproved
photograph. With two versions, the public query cannot reach the draft at all:
it joins `published_version_id` and there is nothing else to join. That is also
why the images are duplicated per version — the published version keeps
pointing at the media objects it was published with, whatever the draft does.

---

## 5. Content model

### 5.1 Per project (version-level facts)

| Field | Type | Notes |
|---|---|---|
| `slug` | string | `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 80. May be empty on a draft. |
| `type` | `demo` \| `personal` \| `client` | Required at creation. Shown to visitors. |
| `workStatus` | `in_progress` \| `completed` | Independent of visibility. |
| `clientName` | string \| null | ≤ 120. |
| `showClientName` | boolean | Default `false`. |
| `tech` | string[] | ≤ 24 entries, each ≤ 60 chars, ordered. |
| `links` | see below | |

### 5.2 Links

```ts
type ProjectLink = {
  kind: 'website' | 'source' | 'other'
  url: string          // http(s) only, checked against the protocol allowlist
  isPublic: boolean    // false by default
  labels: { de: string; en: string; ar: string }   // required when public and kind === 'other'
}
```

At most one `website` and one `source` per project; up to 6 `other` links.
A link with `isPublic: false` is stored, shown in the editor, and **never**
appears in any public response — including `other` links and the source URL of
a private repository.

> The current public project page renders a website button and a source button
> only. `other` links are stored and returned by the owner API now; showing them
> publicly is a visible change and needs its own approval.

### 5.3 Per language (DE / EN / AR)

| Field | Type | Limit |
|---|---|---|
| `name` | string | ≤ 120 |
| `categoryLabel` | string | ≤ 80, optional (D9) |
| `summary` | string | ≤ 400 |
| `caseStudy` | rich-text document \| null | ≤ 60 000 characters of text |

### 5.4 The case-study rich-text document

Backend2 owns its own document schema at
`src/backend2/contracts/rich-text.contract.ts`. It is modelled on the legacy
one but is a separate file, because V2 adds tables and changes how images are
referenced, and legacy articles must keep parsing with the legacy schema.

Node types: `doc`, `paragraph`, `heading` (levels 2–4), `bulletList`,
`orderedList`, `listItem`, `blockquote`, `codeBlock`, `horizontalRule`,
`hardBreak`, `text`, `image`, `table`, `tableRow`, `tableHeader`, `tableCell`.

Marks: `bold`, `italic`, `underline`, `strike`, `code`, `link`.

Two rules carried over from legacy, for the same reasons:

- A link `href` must be site-relative or `http:` / `https:` / `mailto:`.
  `javascript:` and `data:` parse as valid URLs, so a protocol allowlist is used
  rather than a URL check.
- The document is stored as a validated tree, not HTML. Anything the schema does
  not name never reaches the page, so there is no markup to sanitise — which
  matters because the DOM-based sanitisers cannot run on Cloudflare Workers.

**Inline images differ from legacy.** The node is:

```ts
{ type: 'image', attrs: { mediaId: string; alt: string; width: number; height: number } }
```

`mediaId`, never a URL or a storage key. The server resolves it to a served URL
when it builds a response, and refuses a `mediaId` that does not belong to this
project. That is what makes image cleanup provable: every reference a project
holds is discoverable from the database alone.

---

## 6. Ordering

- One integer `position` per project, 1-based, unique, covering **every**
  project including archived ones (D10).
- A new project is appended: `position = max + 1`.
- The public list is that order, filtered to published and active projects.
  The homepage is simply the first N of the same query — there is no separate
  featured order.
- Moving: `POST /owner/projects/:id/position` with `{ position: n }`. The
  server clamps `n` into `[1, count]`, lifts the project out of the sequence,
  inserts it at `n`, and renumbers the whole list densely inside one
  transaction. "Move up" and "move down" are the same call with `n ± 1`.
- Because the order is global and the endpoint takes an absolute position, a
  move from Dashboard page 3 to position 2 works without the browser ever
  holding the full list.
- The unique constraint is `DEFERRABLE INITIALLY DEFERRED` so the renumbering
  statement is checked once at commit rather than row by row.
- Filters and search in the Dashboard list never renumber anything. They change
  which rows are shown, never `position`.

---

## 7. HTTP API

Namespace: **`/api/v2`**, mounted from a new route file
`src/frontend/routes/api.v2.$.ts` that hands the request to
`src/backend2/app.ts`. The existing `/api/$` catch-all and everything under it
is untouched.

### 7.1 Envelope

Identical in shape to the legacy envelope, in Backend2's own module
(`src/backend2/http/response.ts`) so removing `src/backend/` later cannot break
V2:

```ts
type Ok<T>    = { success: true;  message: string; data: T }
type Failure  = { success: false; message: string; code: string; details?: unknown }
```

### 7.2 Error codes

| HTTP | `code` | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed body, unreadable image, unknown field shape. |
| 404 | `NOT_FOUND` | Unknown project, slug or media id — **and every owner route when the local-only guard refuses.** |
| 409 | `CONFLICT` | Slug already used by another project; stale `draftRevision`. |
| 413 | `BODY_TOO_LARGE` | Over Backend2's own body cap. |
| 422 | `VALIDATION_ERROR` | Field validation, and every failed publication requirement. |
| 500 | `INTERNAL_ERROR` | Anything unexpected. Never echoes a database message. |
| 503 | `STORAGE_UNAVAILABLE` | No image store is reachable in this environment. |

`details` for a `VALIDATION_ERROR`:

```ts
{
  issues:  Array<{ field?: string; message: string }>,  // machine-addressable
  missing: string[]                                     // human sentences, for the publish checklist
}
```

### 7.3 Owner routes — `/api/v2/owner` (local development only)

Every route below is unreachable unless section 9's guard passes. All of them
answer `Cache-Control: no-store`.

| Method | Path | Body | Success |
|---|---|---|---|
| `GET` | `/projects` | — | `200` paginated list |
| `POST` | `/projects` | `{ type, workStatus?, name? }` | `201` full project |
| `GET` | `/projects/:id` | — | `200` full project |
| `PUT` | `/projects/:id` | full draft (§7.5) | `200` full project |
| `POST` | `/projects/:id/publish` | `{ draftRevision }` | `200` full project |
| `POST` | `/projects/:id/unpublish` | — | `200` full project |
| `POST` | `/projects/:id/discard-pending` | `{ draftRevision }` | `200` full project |
| `POST` | `/projects/:id/position` | `{ position }` | `200` `{ id, position, order }` |
| `POST` | `/projects/:id/archive` | — | `200` full project |
| `POST` | `/projects/:id/restore` | — | `200` full project |
| `DELETE` | `/projects/:id` | `{ confirm: "<project id>" }` | `200` `{ deleted: true, removedObjects: n }` |
| `POST` | `/projects/:id/images` | `multipart/form-data`, field `file` | `201` media object |
| `GET` | `/projects/:id/preview?language=` | — | `200` the public shape, built from the draft |
| `GET` | `/media/:mediaId` | — | `200` image bytes, `no-store` |
| `GET` | `/slug-available?slug=&projectId=` | — | `200` `{ available, reason? }` |

**List query:** `page` (default 1), `pageSize` (default 20, max 50), `search`,
`type` (`all` default), `workStatus`, `state`
(`all` \| `draft` \| `published` \| `pending` \| `unpublished` \| `archived`,
default `all` which excludes archived), `language` (which language's name to
show in the row, default `en`).

**List response:**

```ts
{
  items: Array<{
    id: string
    position: number
    state: 'draft' | 'published' | 'published_with_pending_changes' | 'unpublished' | 'archived'
    type: 'demo' | 'personal' | 'client'
    workStatus: 'in_progress' | 'completed'
    slug: string                      // the draft's slug
    publishedSlug: string | null      // what visitors currently use
    displayName: string               // requested language, falling back en → de → ar
    languagesComplete: Array<'de' | 'en' | 'ar'>   // name + summary present
    coverUrl: string | null           // owner media URL
    imageCount: number
    hasPendingChanges: boolean
    updatedAt: string
    publishedAt: string | null
  }>
  page: number
  pageSize: number
  total: number
  pageCount: number
  hasMore: boolean
}
```

A `page` beyond the end is **clamped** to the last page rather than returning an
empty list, so narrowing a filter never strands the owner on a page that no
longer exists.

**Full project response** (`data`):

```ts
{
  id: string
  position: number
  state: ProjectState
  lifecycle: 'active' | 'archived'
  draftRevision: number
  createdAt: string
  updatedAt: string
  firstPublishedAt: string | null
  publishedAt: string | null
  hasPendingChanges: boolean
  // What the owner is editing.
  draft: ProjectVersionPayload
  // What visitors see right now; null when the project is not published.
  published: ProjectVersionPayload | null
  // Recomputed on every read, so the editor's checklist is never stale.
  publishBlockers: string[]
  slugAvailable: boolean
}
```

```ts
type ProjectVersionPayload = {
  slug: string
  type: 'demo' | 'personal' | 'client'
  workStatus: 'in_progress' | 'completed'
  clientName: string | null
  showClientName: boolean
  tech: string[]
  links: ProjectLink[]
  texts: Record<'de' | 'en' | 'ar', {
    name: string
    categoryLabel: string
    summary: string
    caseStudy: RichTextDoc | null
  }>
  cover: OwnerImage | null
  gallery: OwnerImage[]
}

type OwnerImage = {
  mediaId: string
  url: string                 // /api/v2/owner/media/<mediaId>
  width: number
  height: number
  byteSize: number
  alt: Record<'de' | 'en' | 'ar', string>
}
```

Note what is **not** there: no `storage_key`, no version ids, no row ids for
texts/links/images. The owner API is private, but it still hands out only what
the editor needs.

### 7.4 Public routes — `/api/v2`

Mounted only when `DATABASE_URL_V2` is configured (D13). Read-only; no origin
check applies because nothing here mutates.

| Method | Path | Query | Success |
|---|---|---|---|
| `GET` | `/projects` | `language`, `offset`, `limit` | `200` batch |
| `GET` | `/projects/:slug` | `language` | `200` one project |
| `GET` | `/media/:mediaId` | — | `200` image bytes |

**`GET /api/v2/projects`**

- `language`: `de` \| `en` \| `ar`, default `de`.
- `offset`: integer ≥ 0, max 600. `limit`: integer 1–36, default 6.
- Both bounded on the server. The list is never fetched whole and sliced in the
  browser.

```ts
{
  items: PublicProjectCard[]
  offset: number
  limit: number
  total: number      // published, active projects
  hasMore: boolean
}
```

This one endpoint covers all three public needs:

- the `/work` "Load more" click → `offset = alreadyLoaded, limit = 6`;
- a deep link to `?page=3` → `offset = 0, limit = 18`, one request, still
  bounded;
- the homepage selection → `offset = 0, limit = N`, same order.

**`GET /api/v2/projects/:slug`** accepts the current slug **or any slug the
project was previously published under** (D6). The response always carries
`canonicalSlug`; when it differs from the requested slug the frontend issues its
own permanent redirect (D12).

An unpublished, draft-only or archived project answers `404 NOT_FOUND` — the
same answer as a slug that never existed, so nothing is revealed.

```ts
type PublicProjectCard = {
  slug: string
  type: 'demo' | 'personal' | 'client'
  workStatus: 'in_progress' | 'completed'
  name: string
  categoryLabel: string | null
  summary: string
  cover: PublicImage | null
  tech: string[]
  publishedAt: string
}

type PublicProjectDetail = PublicProjectCard & {
  canonicalSlug: string
  caseStudy: RichTextDoc | null      // images inside carry resolved public urls
  gallery: PublicImage[]
  website: string | null             // only when isPublic
  source: string | null              // only when isPublic
  otherLinks: Array<{ url: string; label: string }>   // only when isPublic
  client: { name: string } | null    // only when showClientName
}

type PublicImage = { url: string; width: number; height: number; alt: string }
```

**What a public response may never contain**, enforced by a projection function
that builds these objects field by field from typed input — never by spreading a
database row:

- any internal id (project id, version id, media id, row ids);
- any R2 storage key;
- a client name when `showClientName` is false;
- any link with `isPublic` false;
- any draft content, any pending change, any `draftRevision`;
- the requested language's text only — the other two languages are not sent.

### 7.5 Draft save — `PUT /owner/projects/:id`

One save replaces the whole draft version. There is exactly one editor, so
there is no merge to get wrong, and a full replace means the client never has to
compute a diff.

```ts
{
  draftRevision: number         // must match; otherwise 409 CONFLICT
  slug: string                  // may be ''
  type: 'demo' | 'personal' | 'client'
  workStatus: 'in_progress' | 'completed'
  clientName: string | null
  showClientName: boolean
  tech: string[]
  links: ProjectLink[]
  texts: Record<'de' | 'en' | 'ar', {
    name: string; categoryLabel: string; summary: string
    caseStudy: RichTextDoc | null
  }>
  coverMediaId: string | null
  gallery: Array<{ mediaId: string; alt: Record<'de'|'en'|'ar', string> }>
  coverAlt: Record<'de' | 'en' | 'ar', string>
}
```

Server behaviour, in one transaction:

1. Check `draftRevision`. Stale → `409`.
2. Validate against the **draft** rules (§8.1). Empty text is fine.
3. Verify every `mediaId` — cover, gallery, and every `image` node inside every
   case study — belongs to **this project**. A foreign or unknown id is `400`.
4. Replace the draft version's texts, links, tech, and cover/gallery image rows.
5. **Recompute the `inline` image rows** from the case-study documents, so the
   set of media a version references is always exactly what it uses.
6. Bump `draft_revision`, touch `updated_at`.
7. Recompute `publishBlockers` and `slugAvailable` for the response.

The published version is not read and not written by this operation. That is the
owner's rule, expressed as code: **saving cannot change what visitors see.**

### 7.6 Publish — `POST /owner/projects/:id/publish`

Covers both the first publication and **Publish update**; the server knows which
from `published_version_id`.

1. Run the full publication validation (§8.2) against the **draft**.
2. On failure: `422` with every blocker listed. **Nothing** is written — the
   published version stays live with its images, and the draft keeps every
   pending change for correction.
3. On success, in one transaction:
   - deep-copy the draft version into a new row with `kind = 'published'`,
     together with its texts, images, image alt text, links and tech;
   - point `published_version_id` at it;
   - delete the previous published version (D8) and its child rows;
   - write the slug into `v2_project_slugs`; mark the previous current slug
     `is_current = false` and keep it for redirects;
   - set `published_at`, and `first_published_at` if it is still null.
4. After commit, delete from R2 any media object of this project that no version
   references any more (§10.4).

`unpublish` clears `published_version_id`, deletes the published version, and
sets `is_current = false` on the slug rows. `first_published_at` is kept, so the
state is `unpublished` and not `draft`. The draft, including any pending
changes, is untouched.

`discard-pending` replaces the draft with a fresh copy of the published version.
It is refused (`422`) when the project has never been published — there would be
nothing to fall back to.

### 7.7 Archive and delete (D4)

- `archive` → `lifecycle = 'archived'`, `archived_at` set, and an unpublish in
  the same transaction. The project keeps its position and its images. It
  disappears from the default Dashboard list and from every public response.
- `restore` → back to `active`, still unpublished. Publishing again is a
  separate, deliberate act.
- `DELETE` → permanent. Requires `{ confirm: "<the project's id>" }` in the
  body; a mismatch is `400`. The service collects every `storage_key` the
  project owns **before** deleting the rows, then removes the objects from R2
  after the transaction commits, and reports how many it removed.

---

## 8. Validation

Contracts live in `src/backend2/contracts/`, are written in Valibot, and are
**pure** — no `pg`, no `env`, no Node built-ins — so the Dashboard can import
exactly the same rules the server enforces. A test asserts that the contracts
module pulls in nothing server-only.

The server re-checks everything regardless of what the client did.

### 8.1 Draft rules — an unfinished project must stay saveable

Checked on every draft save:

- `type` and `workStatus` are one of their allowed values.
- `slug` is `''` or matches the slug pattern, ≤ 80 characters.
- Every text field is within its length limit. **Empty is allowed.**
- Every case study is either `null` or a document that parses against the
  rich-text schema, with safe link protocols and ≤ 60 000 characters of text.
- `tech` ≤ 24 entries, each non-empty after trimming and ≤ 60 characters.
- Links: ≤ 1 `website`, ≤ 1 `source`, ≤ 6 `other`; every URL `http(s)` and
  ≤ 500 characters. Labels may be empty on a draft.
- Gallery ≤ 12 images; inline images ≤ 20 per language; ≤ 40 media objects per
  project. Alt text may be empty on a draft.
- Every referenced `mediaId` belongs to this project.

### 8.2 Publication rules — what must be true before a visitor sees it

Checked by `publishBlockers(draft)`, a pure function shared with the Dashboard
so the editor can show the checklist before anything is sent:

1. `slug` is present and valid.
2. The slug is free: not a current or historical slug of a **different**
   project. Otherwise `409 CONFLICT`, not a validation error.
3. For each of `de`, `en`, `ar`: `name` non-empty **and** `summary` non-empty
   (D9).
4. Every cover and gallery image has non-empty alt text in **all three**
   languages.
5. Inside each non-empty case study, every inline image has non-empty `alt` in
   that language.
6. Every link with `isPublic: true` has a valid URL, and every public `other`
   link has a label in all three languages.
7. If `showClientName` is true, `clientName` is non-empty.
8. `type` and `workStatus` are set.

Each blocker is a sentence naming the language and the field, e.g.
`"AR: summary is empty"`, `"Gallery image 2 has no DE alt text"`. They are
returned in `details.missing`, and also in `publishBlockers` on every read, so
the editor never has to guess.

### 8.3 Uploads

`probeImage` decides what a file **is** from its own bytes; the declared MIME
type and the filename are never trusted. Accepted: PNG, JPEG, WebP. Maximum
8 MB and 10 000 px on either side.

---

## 9. The local-only security boundary

`AGENTS.md`: *a Git branch, hidden UI, Origin/CORS check, or URL hostname alone
is not a security boundary.* This section is what replaces those.

### 9.1 The rule

Owner routes answer **only** when **all three** hold. Any failure denies:

1. **An explicit opt-in flag** — `BACKEND2_OWNER_API=local` in the server
   environment. Absent by default. It is added to `.env.example` as a
   development-only line, is never placed in `wrangler.jsonc`, and is never set
   as a Worker secret.
2. **Not a production build** — `process.env.NODE_ENV !== 'production'`.
3. **A loopback request host** — the request URL's hostname is `localhost`,
   `127.0.0.1`, `[::1]` or `0.0.0.0`.

Condition 1 is the boundary. Conditions 2 and 3 are there so that a flag set by
accident in the wrong place still does not open a remote door.

### 9.2 Two layers, deliberately

- **Registration.** `src/backend2/app.ts` only mounts the owner sub-application
  when condition 1 holds at startup. On a production build the routes do not
  exist.
- **Per request.** An Elysia guard re-evaluates all three conditions on every
  owner request and throws `notFound()` when any fails.

Either layer alone refuses a stranger. Both are tested separately, for the same
reason `admin-guard.test.ts` tests the legacy layers apart: a deleted guard
leaves no trace at runtime while the other one quietly covers for it.

### 9.3 Denial shape

`404 NOT_FOUND` with the standard envelope and `Cache-Control: no-store` —
never `401` or `403`, which would confirm that a private API is there.

### 9.4 What this is not

This is a development-time fence, not authentication. It is the reason the
module can be built now, and it is replaced wholesale by the V2 authentication
module (with MFA) before any owner route is reachable from a deployment. That
work is out of scope here.

### 9.5 Body limits and caching, owned by Backend2

`src/start.ts` is **not** modified. Backend2 enforces its own limits, so no
shared file has to learn about V2 paths:

- JSON bodies: 2 MB. Uploads: 8 MB. Over the cap → `413 BODY_TOO_LARGE`, read
  with a counting stream rather than buffered first.
- Every owner response sets `Cache-Control: no-store` itself.

The existing `start.ts` origin rule still applies to `/api/v2` mutations,
because it matches on the `/api` prefix. That is free CSRF cover and is kept.

---

## 10. Images and storage (D3)

### 10.1 A new, private bucket

- Bucket: **`yamanwarda-v2-media`**, separate from the legacy
  `yamanwarda-media`. Object keys are `projects/<projectId>/<uuid>.<ext>` —
  generated, never derived from the uploaded filename.
- The bucket stays private. Its `r2.dev` URL stays off. No public hostname.
- **Owner action required before any deploy:** create the bucket in Cloudflare.
  Until then the `r2_buckets` binding is deliberately **not** added to
  `wrangler.jsonc`, because a binding to a bucket that does not exist fails the
  deploy. Nothing in this phase needs it.

### 10.2 Three drivers, one interface

```ts
type MediaStore = {
  put(input: { key: string; body: Uint8Array; contentType: string }): Promise<void>
  get(key: string): Promise<{ body: ReadableStream<Uint8Array>; contentType: string } | null>
  remove(key: string): Promise<void>
}
```

Resolution order at request time:

1. An R2 **binding** named `MEDIA_V2`, when one exists — that is Cloudflare and
   `wrangler dev`, and it needs no credentials at all.
2. Otherwise, when `NODE_ENV !== 'production'`, a **local disk store** under
   `.backend2-media/` (added to `.gitignore`). This is what `bun run dev` uses.
3. Otherwise **no store**: media routes answer `503 STORAGE_UNAVAILABLE`.

There is deliberately no signed-S3 driver for V2. Consequence: V2 needs no R2
access key, no secret, and no credential in `.env` — there is nothing to leak,
and the whole feature is buildable and testable on this machine today.

### 10.3 Serving

| Route | Serves | Cache |
|---|---|---|
| `GET /api/v2/owner/media/:mediaId` | Any image of any project — pending, published, archived. Behind the §9 guard. | `no-store` |
| `GET /api/v2/media/:mediaId` | **Only** an object referenced by an active project's **published** version. Anything else is `404`. | `public, max-age=3600` + `ETag` |

Public URLs carry an opaque media id, never the R2 key. A media object is
immutable, so the checksum is a correct `ETag` and a `304` is cheap.

**Cache invalidation on unpublish.** One hour is a deliberate ceiling rather
than `immutable`: the moment a project is unpublished the origin refuses the
image, and any shared cache stops within the hour. Immutable caching would have
been cheaper and would have kept serving a withdrawn image indefinitely.

### 10.4 Cleanup

An object is needed while at least one `v2_project_images` row points at it —
which, because inline references are materialised on every save (§7.5 step 5),
is the complete picture.

- After any transaction that can orphan an object (publish replacing the old
  published version, unpublish, archive, draft save that drops an image,
  permanent delete), the service deletes the now-unreferenced objects from R2,
  then their rows.
- This happens **after commit** and its failure is logged, never propagated: a
  successful publish must not be reported as a failure because a delete call
  timed out.
- A leftover object is therefore possible. An idempotent sweep,
  `bun run db2:media:sweep`, removes objects with no references that are older
  than a **24-hour grace period** — the grace matters because an upload exists
  before the draft save that references it.
- `ON DELETE RESTRICT` on `v2_project_images.media_object_id` means a still-used
  object cannot be deleted by mistake; the delete fails loudly instead.

---

## 11. Code layout

```
src/backend2/
  app.ts                          assembles the V2 app; mounts owner routes conditionally
  contracts/                      pure, browser-safe Valibot schemas + types
    project.contract.ts
    rich-text.contract.ts
    media.contract.ts
    pagination.contract.ts
  db/
    client.ts                     V2 pool, request scope, transactions, the DATABASE_URL_V2 refusal
    migrate.ts                    V2 migration runner
    migrations/0001_projects.sql
  http/
    error.ts  response.ts  status.ts  validate.ts  body.ts
  security/
    local-only.ts                 the guard, and the pure decision function it calls
  media/
    store.ts  store.r2-binding.ts  store.local-disk.ts  probe.ts
  modules/projects/
    project.owner.route.ts        thin: parse, call, respond
    project.public.route.ts       thin
    project.repo.ts               all SQL
    project.service.ts            draft save, lifecycle
    project.publish.ts            publication validation + the publish transition
    project.order.ts              the global order
    project.mapper.ts             row → owner DTO, row → public DTO
  modules/media/
    media.owner.route.ts  media.public.route.ts  media.service.ts

src/frontend/routes/api.v2.$.ts   the only file added outside src/backend2/
```

Rules:

- `src/backend2/` imports **nothing** from `src/backend/` or `src/shared/`.
  Duplicating a small envelope module is the price of being able to delete the
  legacy backend without breaking V2.
- Route files stay thin: parse, delegate, respond. No SQL and no business rule
  in a route file.
- `contracts/` is the only part of `src/backend2/` the frontend may import.

### Files changed outside `src/backend2/`

| File | Change | Public behaviour |
|---|---|---|
| `src/frontend/routes/api.v2.$.ts` | new | none |
| `src/frontend/config/routeTree.gen.ts` | regenerated | none |
| `package.json` | `db2:migrate`, `db2:media:sweep` scripts | none |
| `.env.example` | `DATABASE_URL_V2`, `BACKEND2_OWNER_API`, `DATABASE_URL_V2_TEST` | none |
| `.gitignore` | `.backend2-media/` | none |

`src/start.ts`, `src/backend/**`, `/admin`, the legacy database and every public
page are **not** touched.

---

## 12. Tests

Two layers. Layer 1 always runs. Layer 2 needs a throwaway database and says so
plainly when it is skipped.

### 12.1 Layer 1 — pure tests, no database (`bun run test`)

| Area | What is proved |
|---|---|
| Local-only guard | The decision function denies when the flag is absent, when `NODE_ENV=production`, and when the host is not loopback; allows only when all three hold. Every combination is covered. |
| Guard, registration layer | With the flag absent, the assembled app has **no** owner route at all — asserted by walking the router, not by testing one path. |
| Guard, request layer | Mounted with the flag on but a non-loopback host, **every** owner route answers `404` — the route list is enumerated so a new route cannot be added without a test covering it. |
| Public projection | Given a fully populated project with a hidden client name, a private source link and a private `other` link, the serialised public JSON contains none of those strings, no uuid, and no storage key. Asserted by deep-scanning the output, not by checking named fields. |
| Publish blockers | Each of the eight rules in §8.2 produces its own sentence; a complete project produces none. |
| Draft rules | An empty project saves. Over-length text, a `javascript:` link, a malformed case study and a foreign `mediaId` are each rejected. |
| Rich text | Tables round-trip; unknown node types and unsafe hrefs are stripped or rejected; inline images carry a `mediaId`, never a URL. |
| Ordering | Pure renumbering: move to first, to last, across a page boundary, beyond the end (clamped), and onto itself. Positions stay dense and unique. |
| Pagination | Owner clamping beyond the last page; public `offset`/`limit` bounds; `hasMore` correctness at every edge. |
| Image probe | PNG/JPEG/WebP dimensions read from bytes; a renamed non-image, an empty file and an oversize file rejected. |
| Body limits | 2 MB JSON and 8 MB upload caps produce `413` without buffering the whole body. |
| Contracts purity | `src/backend2/contracts/**` imports nothing server-only. |
| Migration safety | The runner refuses when `DATABASE_URL_V2` is missing or equals `DATABASE_URL`. |

### 12.2 Layer 2 — integration, against a real throwaway database

Runs only with `DATABASE_URL_V2_TEST` set. The suite **refuses to run** if that
value equals `DATABASE_URL` or `DATABASE_URL_V2`, so it can never wipe the
legacy or the development database. Schema is migrated and truncated per test.

Every item from *"Proof required before a Claude build can be accepted"* in
`docs/v2/projects.md` that belongs to the backend:

1. A private draft survives missing translations, and is `404` on every public
   endpoint.
2. A publish attempt with missing translations or missing image alt text returns
   every blocker, and the draft is **byte-identically unchanged** afterwards.
3. Saving an edit to a published project leaves the published version and its
   image set identical — compared field by field and media id by media id.
4. An **invalid Publish update** leaves the published version identical **and**
   the pending changes still present in the draft.
5. A valid Publish update swaps the version atomically; the old published
   version and its orphaned objects are gone.
6. Public list, detail and homepage all follow one manual order; a move across a
   Dashboard page boundary is reflected in the public order.
7. A client name and a source link appear only when explicitly allowed.
8. An old slug still resolves and reports the canonical one; an unpublished
   project is `404`.
9. `GET /api/v2/media/:id` serves a published image, refuses a pending one, and
   refuses the same image after unpublish.
10. Archive hides a project everywhere and `restore` brings it back unpublished.
11. Permanent delete removes the rows and the R2 objects, and is refused without
    the matching `confirm` value.
12. Orphan sweep removes an unreferenced object older than the grace period and
    leaves a fresh one alone.
13. A stale `draftRevision` is `409` and does not overwrite.

### 12.3 Verification before the phase is reported complete

`bun run typecheck`, `bun run test`, `bun run build`, the migration applied to a
real V2 database, and a live run of the whole lifecycle against
`bun run dev` — create, save, publish, edit, confirm the public response is
unchanged, publish update, unpublish, archive, delete — with the actual HTTP
responses shown. A passing unit test alone is not a finished backend.

---

## 13. What the owner has to do

1. Create the V2 PostgreSQL database (a new Neon database or branch) and put
   `DATABASE_URL_V2=` in `.env`.
2. Optionally create a second throwaway database and set
   `DATABASE_URL_V2_TEST=` — without it the integration suite in §12.2 is
   skipped, and the completion report will say so.
3. Add `BACKEND2_OWNER_API=local` to `.env`.
4. Create the `yamanwarda-v2-media` R2 bucket **before any future deploy**. Not
   needed for local work.

---

## 14. Definition of done for this phase

- The migration applies to a clean V2 database and to nothing else.
- Every route in §7 exists and behaves as specified.
- Every test in §12.1 passes; §12.2 passes or is reported as skipped with the
  reason.
- `/admin`, `src/backend/`, the legacy database and every public page are
  provably untouched — shown by the diff.
- No secret, credential, real client datum or private attachment is in the
  repository.
- Nothing is committed, pushed, merged or deployed.
