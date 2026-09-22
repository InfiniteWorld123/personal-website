-- The shared Media vault. See docs/v2/media.md.
--
-- One private library for every module. Projects, Blog, Services and later
-- Invoices select from these rows; none of them owns storage of its own, and
-- none of them may delete a file another one is still using.
--
-- Numbered 0003 because 0002_auth.sql is the highest migration this repository
-- contains.
--
-- 0001_projects.sql is a different matter, and whoever reads this next needs to
-- know it. The owner's development database has it in `v2_schema_migrations`,
-- applied 21 Sep 2026, and carries the tables it created — `v2_projects`,
-- `v2_project_versions`, `v2_media_objects` and the rest. The FILE is not in
-- this repository and is not in its history, and neither is the Projects
-- backend code that went with it. The database is ahead of the source.
--
-- So a fresh `bun run db2:migrate` produces a database WITHOUT the Projects
-- tables, while the owner's has them. That divergence is not something this
-- migration can fix, and guessing at the missing file would be worse than
-- leaving it visible. Nothing here touches those tables.
--
-- Note for the Projects module when it is rebuilt: it cannot simply be called
-- 0001_projects.sql again. The runner sorts by filename, so on a fresh
-- database a new 0001 would run BEFORE this file and on the owner's it would
-- not run at all — it is already in the ledger. It needs the next free number
-- and a deliberate reconciliation of what the existing tables hold.

-- A folder is an organising choice, never a permission boundary. A file with
-- no folder sits at the library root, which is allowed on purpose.
CREATE TABLE v2_media_folders (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- RESTRICT rather than CASCADE: deleting a folder tree by deleting its
    -- root is exactly the accident this module refuses. A folder must be
    -- emptied deliberately, one level at a time.
    parent_id  uuid REFERENCES v2_media_folders (id) ON DELETE RESTRICT,
    name       text NOT NULL,
    -- Materialised depth, root = 0. Kept by the application so the bound on
    -- nesting is one column read rather than a recursive walk per insert.
    depth      integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_media_folders_name_check
        CHECK (btrim(name) = name AND name <> '' AND length(name) <= 120),
    CONSTRAINT v2_media_folders_depth_check CHECK (depth >= 0 AND depth <= 7),
    -- A folder cannot be its own parent. Longer cycles are refused by the
    -- service, which walks the ancestors before a move.
    CONSTRAINT v2_media_folders_not_self CHECK (parent_id IS NULL OR parent_id <> id)
);

-- Two partial indexes rather than UNIQUE (parent_id, name): a NULL parent —
-- the library root — compares unequal to itself, so a plain unique constraint
-- would let `Projects` be created at the root twice.
CREATE UNIQUE INDEX v2_media_folders_name_in_parent_idx
    ON v2_media_folders (parent_id, lower(name)) WHERE parent_id IS NOT NULL;

CREATE UNIQUE INDEX v2_media_folders_name_at_root_idx
    ON v2_media_folders (lower(name)) WHERE parent_id IS NULL;

CREATE INDEX v2_media_folders_parent_idx ON v2_media_folders (parent_id, lower(name));

-- One uploaded file. The bytes are immutable: renaming changes `display_name`,
-- moving changes `folder_id`, and neither touches the object in the bucket.
CREATE TABLE v2_media_assets (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NULL means the library root. RESTRICT, so a folder holding files cannot
    -- be deleted; the service refuses first, with a readable reason.
    folder_id     uuid REFERENCES v2_media_folders (id) ON DELETE RESTRICT,
    -- The object key. Generated from a uuid, never derived from the uploaded
    -- filename, and it never leaves the server.
    storage_key   text NOT NULL UNIQUE,
    kind          text NOT NULL,
    -- The type the server detected from the bytes, not the one the browser
    -- claimed.
    content_type  text NOT NULL,
    -- Private metadata. Kept because the owner recognises their own file by
    -- it; never used as a key, a path, or a Content-Disposition value as-is.
    original_name text NOT NULL,
    -- The sanitised name shown in the library and used for a download.
    display_name  text NOT NULL,
    byte_size     bigint NOT NULL,
    -- SHA-256 of the bytes, hex. Serves as the ETag, and lets the library warn
    -- that a file being uploaded is already in it.
    checksum      text NOT NULL,
    -- Images only. A video or a PDF leaves these NULL rather than pretending
    -- to a size the server did not measure.
    width         integer,
    height        integer,
    created_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_media_assets_kind_check CHECK (kind IN ('image', 'video', 'document')),
    CONSTRAINT v2_media_assets_size_check CHECK (byte_size > 0),
    CONSTRAINT v2_media_assets_name_check
        CHECK (btrim(display_name) = display_name AND display_name <> ''),
    CONSTRAINT v2_media_assets_dimensions_check
        CHECK ((width IS NULL AND height IS NULL) OR (width > 0 AND height > 0))
);

-- The library list: one folder, newest first, with `id` breaking ties so a
-- page boundary never repeats or skips a row.
CREATE INDEX v2_media_assets_folder_idx
    ON v2_media_assets (folder_id, created_at DESC, id DESC);

CREATE INDEX v2_media_assets_created_idx ON v2_media_assets (created_at DESC, id DESC);

CREATE INDEX v2_media_assets_kind_idx ON v2_media_assets (kind);

CREATE INDEX v2_media_assets_checksum_idx ON v2_media_assets (checksum);

-- Filename search, case-insensitive.
CREATE INDEX v2_media_assets_name_idx ON v2_media_assets (lower(display_name));

-- Every *use* of a file, by every module.
--
-- This table is the vault's whole safety property. A row here is what makes a
-- file undeletable, and a row with `scope = 'published'` is the only thing
-- that makes an asset publicly servable. Alt text, captions and ordering
-- belong to the consuming module, because the same image needs different alt
-- text in a DE article and an AR project.
CREATE TABLE v2_media_references (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- RESTRICT, deliberately. The service checks references and refuses with
    -- an explanation first; this is the layer that holds when a future module
    -- forgets to ask. The bytes are never removed before the references are.
    asset_id   uuid NOT NULL REFERENCES v2_media_assets (id) ON DELETE RESTRICT,
    module     text NOT NULL,
    -- Which snapshot of the consuming record this use belongs to. `published`
    -- is the only one a visitor can reach; `draft`, `scheduled` and `record`
    -- (a private module row, such as an invoice attachment) never are.
    scope      text NOT NULL,
    -- The consuming row: its table-ish name and its id, as text so a module
    -- that does not key on uuid can still take part.
    owner_type text NOT NULL,
    owner_id   text NOT NULL,
    -- How the file is used there, for the "where is this used" list.
    usage      text NOT NULL,
    position   integer NOT NULL DEFAULT 0,
    -- What the dashboard shows the owner when it refuses a deletion. Written
    -- by the consuming module; never rendered as markup.
    label      text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_media_references_module_check
        CHECK (module IN ('projects', 'blog', 'services', 'invoices', 'content')),
    CONSTRAINT v2_media_references_scope_check
        CHECK (scope IN ('draft', 'scheduled', 'published', 'record')),
    CONSTRAINT v2_media_references_usage_check
        CHECK (usage IN ('cover', 'gallery', 'inline', 'attachment', 'other')),
    CONSTRAINT v2_media_references_owner_check
        CHECK (btrim(owner_type) <> '' AND btrim(owner_id) <> '')
);

CREATE INDEX v2_media_references_asset_idx ON v2_media_references (asset_id, module, scope);

-- "May a visitor have this file?" is one index lookup, on every request.
CREATE INDEX v2_media_references_published_idx
    ON v2_media_references (asset_id) WHERE scope = 'published';

-- The set a consuming module replaces when it saves. Also what makes the
-- unused-file filter cheap.
CREATE INDEX v2_media_references_owner_idx
    ON v2_media_references (module, owner_type, owner_id, scope);

-- Objects the bucket holds that the library does not.
--
-- Two moments can leave one behind, and both are a process dying between a
-- database write and a bucket call:
--
--   'upload' — the bytes landed, the asset row never did.
--   'delete' — the asset row is gone, the bytes are still there.
--
-- Writing the intent down first is what makes either recoverable. Without this
-- table the second case is invisible — there is no row left to find the key
-- from — and `docs/v2/media.md` is explicit that a failure must not be able to
-- leave metadata pointing at missing bytes, or the reverse, while the owner is
-- told the operation succeeded.
--
-- What this is NOT is the old project-scoped cleanup that deleted any object
-- nothing referenced. A file no module uses is a file the owner kept on
-- purpose: "Keeping unused assets is intentional for a vault." Only keys
-- recorded here are ever removed, and only after the grace period.
CREATE TABLE v2_media_pending_objects (
    storage_key text PRIMARY KEY,
    purpose     text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Set when a sweep tried and failed, so a key that cannot be removed
    -- becomes visible rather than retried silently for ever.
    attempts    integer NOT NULL DEFAULT 0,
    last_error  text,
    CONSTRAINT v2_media_pending_objects_purpose_check CHECK (purpose IN ('upload', 'delete'))
);

CREATE INDEX v2_media_pending_objects_age_idx ON v2_media_pending_objects (created_at);
