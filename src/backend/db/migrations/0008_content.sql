-- B6 — editable content.
--
-- The copy still lives in `src/frontend/content/{de,en,ar}.ts`. These tables
-- hold only what the owner changed on top of it, which is the whole design:
--
--   * a key with no row falls through to the code, so a string added in a later
--     release appears immediately instead of waiting to be typed in again;
--   * every field can be put back to the code's wording, because the original
--     never left;
--   * an empty `content_translations` table is a working site, not a blank one.
--
-- Draft and published are two columns rather than two rows: a key has exactly
-- one of each, and a single row makes "what is live" and "what is waiting" one
-- read instead of a join against itself.

CREATE TABLE content_blocks (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The dotted path into `SiteContent` ('home.hero.headline'), a facts key
    -- ('site.email'), or a price ('price.websites'). A trailing '[]' marks a
    -- list of strings, stored whole.
    "key" text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT content_blocks_key_check CHECK (btrim("key") <> '')
);

CREATE TABLE content_translations (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    content_block_id uuid NOT NULL REFERENCES content_blocks ("id") ON DELETE CASCADE,
    -- '*' is a value that is the same in all three languages: an email address,
    -- a phone number, a price. It is stored once so the three language tabs
    -- cannot drift into three different phone numbers.
    "language" text NOT NULL,
    -- Text is a JSON string, a list of strings a JSON array, a price a number.
    -- One column holds all three; a text column would need a delimiter, and a
    -- delimiter would eventually appear inside somebody's sentence.
    draft_value jsonb,
    published_value jsonb,
    -- Set on the other two languages when one is edited. The site keeps serving
    -- their old wording — a flag is a reminder, never a gap.
    needs_review boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT content_translations_language_check
        CHECK ("language" IN ('de', 'en', 'ar', '*')),
    CONSTRAINT content_translations_unique UNIQUE (content_block_id, "language")
);

-- Every public render reads the published overrides for one language and
-- nothing else, so that read is the one worth an index.
CREATE INDEX content_translations_published_idx
    ON content_translations ("language")
    WHERE published_value IS NOT NULL;

-- The admin's "unpublished" count and the publish diff both ask this.
CREATE INDEX content_translations_draft_idx
    ON content_translations ("language")
    WHERE draft_value IS NOT NULL;

CREATE INDEX content_translations_review_idx
    ON content_translations ("language")
    WHERE needs_review = true;


-- Every saved wording, kept so a sentence that read better yesterday can be
-- brought back. The row carries the value *after* the change: reverting means
-- writing an old row's value back into the draft, which is an ordinary edit and
-- is itself recorded.
CREATE TABLE content_revisions (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    content_block_id uuid NOT NULL REFERENCES content_blocks ("id") ON DELETE CASCADE,
    "language" text NOT NULL,
    "value" jsonb,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT content_revisions_language_check
        CHECK ("language" IN ('de', 'en', 'ar', '*'))
);

CREATE INDEX content_revisions_recent_idx ON content_revisions (created_at DESC);
CREATE INDEX content_revisions_block_idx
    ON content_revisions (content_block_id, "language", created_at DESC);
