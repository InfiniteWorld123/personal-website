-- Content V2. See docs/v2/content.md.
--
-- The public website's static copy: headings, descriptions, calls to action,
-- search titles, legal text, and a few shared facts. The list of editable
-- fields is not here — it is the release registry in
-- `src/backend2/modules/content/content.registry.ts`, and a key this database
-- holds but the registry does not is simply never read.
--
-- There is no draft column and no published column, on purpose. Content is
-- the one module where a saved field is live: `v2_content_values` *is* what
-- visitors read. A field with no row still shows the wording the release
-- ships, which is also what **Original** restores.
--
-- Numbered 0007 because 0006 (Blog) is the highest that exists. The runner
-- sorts by filename.
--
-- Structure only. No rows: the current wording arrives through the one-time
-- import (`bun run db2:content:import`), never through a migration.


-- One row per imported batch, so an import can be described and rolled back.
CREATE TABLE v2_content_imports (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Where the values came from, as the operator described it.
    source_label   text NOT NULL,
    -- Counts, exclusions and the fields that differ from the release default.
    manifest       jsonb NOT NULL,
    imported_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rolled_back_at timestamptz
);

CREATE TABLE v2_content_values (
    -- A registry key: 'home.hero.headline', 'home.hero.typed[]', 'site.email'.
    field_key  text NOT NULL,
    -- 'de', 'en', 'ar', or 'shared' for a fact that is the same everywhere.
    language   text NOT NULL,
    -- A JSON string, or a JSON array of strings for a list.
    value      jsonb NOT NULL,
    -- Increments on every change. The editor sends back the revision it last
    -- saw; a mismatch means somebody saved in between, and the write is refused
    -- rather than allowed to overwrite the newer wording.
    revision   integer NOT NULL DEFAULT 1,
    -- Set when the row came from an import. Rollback removes that import's
    -- rows, and refuses while any of them has been edited since (revision > 1).
    import_id  uuid REFERENCES v2_content_imports (id),
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (field_key, language),
    CONSTRAINT v2_content_values_key_check CHECK (btrim(field_key) <> ''),
    CONSTRAINT v2_content_values_language_check
        CHECK (language IN ('de', 'en', 'ar', 'shared')),
    CONSTRAINT v2_content_values_shape_check
        CHECK (jsonb_typeof(value) IN ('string', 'array')),
    CONSTRAINT v2_content_values_revision_check CHECK (revision > 0)
);

CREATE INDEX v2_content_values_import_idx ON v2_content_values (import_id)
    WHERE import_id IS NOT NULL;

-- Every successful change, once per complete edit — never per keystroke.
-- Both sides are stored whole, so the history reads on its own even after the
-- release default changes.
CREATE TABLE v2_content_history (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- A tie-breaker for two changes in the same instant, so the order is fixed.
    seq           bigint GENERATED ALWAYS AS IDENTITY,
    field_key     text NOT NULL,
    language      text NOT NULL,
    action        text NOT NULL,
    before_value  jsonb NOT NULL,
    after_value   jsonb NOT NULL,
    revision      integer NOT NULL,
    restored_from uuid REFERENCES v2_content_history (id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_content_history_language_check
        CHECK (language IN ('de', 'en', 'ar', 'shared')),
    CONSTRAINT v2_content_history_action_check
        CHECK (action IN ('edit', 'restore_original', 'restore_history'))
);

CREATE INDEX v2_content_history_recent_idx ON v2_content_history (created_at DESC, seq DESC);
CREATE INDEX v2_content_history_field_idx
    ON v2_content_history (field_key, language, created_at DESC, seq DESC);

-- "The German changed after this one." A reminder, never a gap: the flagged
-- language keeps serving its own wording. Kept apart from the values so that
-- raising a flag never changes a revision the other language's editor holds.
CREATE TABLE v2_content_review_flags (
    field_key  text NOT NULL,
    language   text NOT NULL,
    flagged_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (field_key, language),
    CONSTRAINT v2_content_review_flags_language_check CHECK (language IN ('de', 'en', 'ar'))
);
