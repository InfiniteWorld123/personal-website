-- Projects joins the shared Media vault.
--
-- `0001_projects.sql` gave Projects its own image table, `v2_media_objects`,
-- with project-scoped keys and an automatic cleanup that deleted any object
-- nothing referenced. `0003_media.sql` replaced that idea outright: one
-- private library every module selects from, where a file nothing uses is a
-- file the owner kept on purpose.
--
-- `docs/v2/projects.md`: "Every Project image—cover, gallery, or inline
-- case-study image—must be chosen through the shared `/dashboard/media`
-- picker... Projects must not keep a separate project-only upload path or
-- asset store after integration."
--
-- So this migration moves the one column that still pointed the old way.
--
-- Numbered 0004 because 0003 is the highest this repository contains, and the
-- runner sorts by filename: a second 0001 would run before the Media
-- migration on a fresh database and never at all on the owner's, where that
-- name is already in `v2_schema_migrations`.
--
-- There is no data to migrate, and that was verified rather than assumed:
-- `v2_media_objects` and `v2_project_images` both hold zero rows on the
-- owner's development database, and `v2_media_assets` is empty too. If either
-- had held a row this would have to be a copy, not a rename.
--
-- WHAT IS LEFT BEHIND, AND WHY IT STAYS
--
-- `v2_media_objects` belongs to the superseded project-scoped design. After
-- this migration **nothing reads it and nothing points at it**: the only
-- foreign key that did — `v2_project_images.media_object_id` — is the one
-- being moved below. What remains is its own key *outward*, to `v2_projects`,
-- so it hangs off the project rather than the other way round.
--
-- It is left standing on purpose. The owner's rule in `AGENTS.md` is "do not
-- delete legacy code, routes, configuration, or data merely because a V2
-- replacement has started", an empty table costs nothing, and dropping one
-- out of a live database deserves its own reviewed step rather than being a
-- side effect of wiring Projects up. Decide that separately, once the
-- Projects image design has settled.
--
-- For whoever reads this next, so the three names stop being confusing:
--
--   v2_media_assets  — the shared vault (0003). THE file. Every module
--                      selects from here; this is what images really are now.
--   v2_project_images — Projects' own row per *use* of a file: which version,
--                      which role (cover / gallery / inline) and in what
--                      order. Repointed at the vault below. Still current,
--                      still the right place for the role.
--   v2_media_objects  — the old project-owned file table (0001). Empty, dead,
--                      kept only so the migration histories match.
--
-- The role and the ordering live with Projects rather than in the vault
-- because the same photograph is a cover here and an illustration there, and
-- needs a different alt text in German and in Arabic. `v2_project_image_texts`
-- holds those sentences, one row per language.


-- A rename would silently succeed on a table that had rows pointing at
-- objects the vault has never heard of, and those rows would then violate the
-- new key. Refuse first, loudly, rather than discovering it at COMMIT.
DO $$
DECLARE
    stray integer;
BEGIN
    SELECT count(*) INTO stray FROM v2_project_images;

    IF stray > 0 THEN
        RAISE EXCEPTION
            'v2_project_images holds % row(s) pointing at the superseded v2_media_objects. '
            'Migrating them into v2_media_assets needs a reviewed copy, not this rename.',
            stray;
    END IF;
END $$;

-- The old key has to go before the column can mean something else.
ALTER TABLE v2_project_images
    DROP CONSTRAINT v2_project_images_media_object_id_fkey;

ALTER TABLE v2_project_images
    RENAME COLUMN media_object_id TO asset_id;

-- RESTRICT, and this time it is the rule the whole vault rests on: an asset a
-- project version still points at cannot be deleted, and the refusal happens
-- in the database even if a future module forgets to ask the service first.
--
-- Not deferrable, unlike the key it replaces. 0001 made that one deferrable
-- with the default NO ACTION, which let a delete inside a transaction pass
-- every statement and fail only at COMMIT. Nothing here needs to write an
-- image row before its asset exists.
ALTER TABLE v2_project_images
    ADD CONSTRAINT v2_project_images_asset_id_fkey
        FOREIGN KEY (asset_id) REFERENCES v2_media_assets (id) ON DELETE RESTRICT;

-- The unique constraint followed the column through the rename; the index
-- did not have one to follow, so it is rebuilt under a name that matches.
CREATE INDEX v2_project_images_asset_idx ON v2_project_images (asset_id);


-- Which draft the live version was made from.
--
-- "Pending changes" is the difference between what the owner has saved and
-- what visitors are reading, and the dashboard has to show it in a list of
-- twenty without loading twenty whole projects to compare them field by
-- field. `draft_revision` already increments on every save, so recording its
-- value at the moment of publication turns that comparison into one integer:
--
--     published_version_id IS NOT NULL
--       AND draft_revision IS DISTINCT FROM published_draft_revision
--
-- NULL while the project has never been published, which is why the check
-- above asks about `published_version_id` first.
--
-- It errs toward *reporting* a pending change: saving a draft without
-- altering anything still bumps the revision. Telling the owner there is
-- something to publish when there is not is a wasted click; the opposite
-- would be a change they believe is live and is not.
ALTER TABLE v2_projects ADD COLUMN published_draft_revision integer;
