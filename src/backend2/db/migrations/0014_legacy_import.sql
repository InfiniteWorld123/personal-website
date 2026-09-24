-- "Copy from the old site": the one-time import of the legacy public content.
-- See docs/v2/public-cutover.md, "Copy from the old site".
--
-- The owner decided on 24 Sep 2026 to start V2 from what the public website
-- shows today — projects, services, the article, the booking type and its
-- hours — and then edit it in the Dashboard. This table is the import's
-- memory, and the only thing that makes pressing the button twice harmless:
-- a row here means "this legacy thing has already been dealt with", so it is
-- never created a second time, even if the owner later deletes or renames what
-- was created.
--
--   kind        what the legacy thing is: project, service, post,
--               booking_type, availability, or image (one copied file).
--   legacy_key  which one: the legacy row id, a static slug, or an image's
--               address on the old site.
--   outcome     created — it exists in V2 now (`v2_id` says where);
--               failed  — it could not be copied (`note` says why), and the
--                         owner is told to add it by hand.
--   v2_id       the V2 record or media asset it became. Text, because the
--               kinds key on different things; never a foreign key, so
--               deleting the V2 record later never fails because of this log.
--
-- Nothing is ever written to the legacy database: the import reads it inside
-- `BEGIN TRANSACTION READ ONLY`. Numbered 0014: 0013 is the Assistant.
--
-- Structure only. No rows.

CREATE TABLE v2_legacy_imports (
    kind        text NOT NULL,
    legacy_key  text NOT NULL,
    outcome     text NOT NULL,
    v2_id       text,
    note        text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (kind, legacy_key),
    CONSTRAINT v2_legacy_imports_kind_check
        CHECK (kind IN ('project', 'service', 'post', 'booking_type', 'availability', 'image')),
    CONSTRAINT v2_legacy_imports_outcome_check CHECK (outcome IN ('created', 'failed')),
    CONSTRAINT v2_legacy_imports_created_check CHECK (outcome <> 'created' OR v2_id IS NOT NULL),
    CONSTRAINT v2_legacy_imports_key_check CHECK (btrim(legacy_key) <> '' AND length(legacy_key) <= 2000)
);
