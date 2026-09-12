-- The blog. A post is one record with one translation per language, the same
-- shape projects use; D23 replaced the original single-language plan.

CREATE TABLE tags (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- The slug reaches the public URL as ?tag=, so its shape is enforced here.
    CONSTRAINT tags_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- A tag is a label a reader sees, so it is written in all three languages.
-- Unlike a post it is a handful of words, so all three are required outright.
CREATE TABLE tag_translations (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    tag_id uuid NOT NULL REFERENCES tags ("id") ON DELETE CASCADE,
    "language" text NOT NULL,
    "name" text NOT NULL,
    CONSTRAINT tag_translations_language_check CHECK ("language" IN ('de', 'en', 'ar')),
    CONSTRAINT tag_translations_unique UNIQUE (tag_id, "language")
);

CREATE TABLE posts (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE,
    -- An article about one of the case studies links back to it. ON DELETE SET
    -- NULL because deleting a project must not take the writing with it.
    project_id uuid REFERENCES projects ("id") ON DELETE SET NULL,
    -- A public path today, an R2 object key once uploads land — as in projects.
    cover_src text,
    cover_width integer,
    cover_height integer,
    is_published boolean NOT NULL DEFAULT false,
    -- The date the reader sees and the feed sorts by. Set on first publish and
    -- kept afterwards, so re-publishing an edited post does not move it.
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT posts_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    -- A published post always has a date; a feed entry without one is invalid.
    CONSTRAINT posts_published_at_check CHECK (NOT is_published OR published_at IS NOT NULL),
    -- The cover is all three columns or none of them.
    CONSTRAINT posts_cover_check CHECK (
        (cover_src IS NULL AND cover_width IS NULL AND cover_height IS NULL)
        OR (cover_src IS NOT NULL AND cover_width > 0 AND cover_height > 0)
    )
);

-- The public listing is always "published, newest first".
CREATE INDEX posts_published_idx ON posts (is_published, published_at DESC);

-- One row per language. All three are required before publishing; that rule
-- lives in the service, because a draft has to be saveable with one.
CREATE TABLE post_translations (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid NOT NULL REFERENCES posts ("id") ON DELETE CASCADE,
    "language" text NOT NULL,
    title text NOT NULL,
    -- Plain text. It is the card summary, the meta description, and the feed
    -- description, so it is never rich content.
    excerpt text NOT NULL DEFAULT '',
    -- The article itself, as a ProseMirror document. Structured rather than
    -- HTML: the renderer only knows the node types it was written for, so
    -- there is no markup to sanitise and nothing to inject (D24).
    body jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
    -- Alt text for the cover, in this language, because it is copy.
    cover_alt text NOT NULL DEFAULT '',
    -- Derived from the body on every save so the list does not have to walk
    -- the document to print "6 min".
    reading_minutes integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT post_translations_language_check CHECK ("language" IN ('de', 'en', 'ar')),
    CONSTRAINT post_translations_unique UNIQUE (post_id, "language"),
    CONSTRAINT post_translations_reading_check CHECK (reading_minutes >= 1)
);

CREATE TABLE post_tags (
    post_id uuid NOT NULL REFERENCES posts ("id") ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES tags ("id") ON DELETE CASCADE,
    sort_order integer NOT NULL DEFAULT 0,
    PRIMARY KEY (post_id, tag_id)
);

-- Filtering the archive by tag reads this direction.
CREATE INDEX post_tags_tag_idx ON post_tags (tag_id);
