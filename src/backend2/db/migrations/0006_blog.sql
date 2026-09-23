-- Blog V2. See docs/v2/blog.md.
--
-- The owner's trilingual articles, their tags, the anonymous comments under
-- them and two plain counters. Nothing is imported: the one legacy article was
-- test content and stays in the legacy database until a separately approved
-- cutover.
--
-- The shape follows Projects and Services, for the reason they have it:
--
--   * `v2_blog_posts` is the identity — the public address once it is claimed,
--     pointers to at most three versions, the counters and the comment switch.
--     A visitor's query joins `published_version_id` and nothing else, so an
--     unfinished sentence cannot reach the site because somebody forgot a WHERE.
--   * `v2_blog_post_versions` holds the private draft the owner edits, the
--     frozen snapshot a schedule will publish, and the snapshot visitors read.
--     Saving writes the draft; only Publish, Publish update or a due schedule
--     writes the others.
--   * `v2_blog_post_texts` is one row per version per language.
--   * `v2_blog_post_tags` is which tags a version carries, in order.
--
-- Numbered 0006 because 0005 is the highest that exists. The runner sorts by
-- filename, so a lower number would run out of order on a new database and
-- never at all on one that has already recorded the name.
--
-- Structure only. No rows.


-- A tag is a label a reader filters by, so it is written in all three
-- languages from the start. It is a handful of words, so all three are
-- required outright rather than being a publication rule.
CREATE TABLE v2_blog_tags (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Reaches the public list as `?tag=`, so its shape is enforced here.
    slug       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_blog_tags_slug_check
        CHECK (length(slug) <= 60 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE UNIQUE INDEX v2_blog_tags_slug_idx ON v2_blog_tags (slug);

CREATE TABLE v2_blog_tag_names (
    tag_id   uuid NOT NULL REFERENCES v2_blog_tags (id) ON DELETE CASCADE,
    language text NOT NULL,
    name     text NOT NULL,
    PRIMARY KEY (tag_id, language),
    CONSTRAINT v2_blog_tag_names_language_check CHECK (language IN ('de', 'en', 'ar')),
    CONSTRAINT v2_blog_tag_names_name_check
        CHECK (btrim(name) = name AND name <> '' AND length(name) <= 40)
);

-- Two tags called the same thing in one language would be one filter chip
-- shown twice.
CREATE UNIQUE INDEX v2_blog_tag_names_unique_idx ON v2_blog_tag_names (language, lower(name));


CREATE TABLE v2_blog_posts (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The public address, claimed when the article is first scheduled or
    -- published and never changed afterwards: `docs/v2/blog.md` says a
    -- published URL changes only through a separately planned redirect. NULL
    -- until then — a draft's address lives on its draft version.
    slug                     text,
    draft_version_id         uuid,
    scheduled_version_id     uuid,
    published_version_id     uuid,
    -- Increments on every save that changes the draft. A stale value from a
    -- second browser tab is refused rather than allowed to overwrite.
    draft_revision           integer NOT NULL DEFAULT 1,
    -- Which draft revision the frozen schedule and the live snapshot were
    -- taken from, so "your draft differs from what is scheduled / live" is one
    -- integer comparison in a list.
    scheduled_draft_revision integer,
    published_draft_revision integer,
    -- When the frozen snapshot goes live, as an instant. The owner chose it as
    -- a wall-clock time in Europe/Berlin; the conversion lives in the contract.
    scheduled_for            timestamptz,
    -- The date a reader sees. Set by the first publication and never moved by
    -- an update or a republication — the article is not new because it was
    -- edited.
    first_published_at       timestamptz,
    -- When the snapshot visitors read now went live.
    published_at             timestamptz,
    -- The "last updated" date a reader sees: set only by a Publish update that
    -- changed what the article says, never by a publication that did not.
    content_updated_at       timestamptz,
    -- A fingerprint of what the last live snapshot said, kept through a take
    -- down, so a republication can tell whether it is a real update.
    published_substance      text,
    -- The most recent schedule that ran: when it was due and when it actually
    -- published. The dashboard reports a late one instead of hiding it.
    last_scheduled_for       timestamptz,
    last_schedule_ran_at     timestamptz,
    -- Per article, and immediate. Off hides the comments and the form from
    -- visitors; the rows stay and reappear when it is switched back on.
    comments_enabled         boolean NOT NULL DEFAULT true,
    -- Two integers and nothing else: no reader row, no address, no cookie id
    -- exists anywhere, so a figure cannot be joined to a person. Approximate
    -- by design — the dashboard says "reads", never "readers".
    read_count               integer NOT NULL DEFAULT 0,
    like_count               integer NOT NULL DEFAULT 0,
    created_at               timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_blog_posts_slug_check
        CHECK (slug IS NULL OR (length(slug) <= 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')),
    CONSTRAINT v2_blog_posts_revision_check CHECK (draft_revision > 0),
    CONSTRAINT v2_blog_posts_counts_check CHECK (read_count >= 0 AND like_count >= 0),
    -- A schedule is a snapshot, a time and the revision it froze, or none of
    -- the three.
    CONSTRAINT v2_blog_posts_schedule_check CHECK (
        (scheduled_version_id IS NULL AND scheduled_for IS NULL AND scheduled_draft_revision IS NULL)
        OR (scheduled_version_id IS NOT NULL AND scheduled_for IS NOT NULL
            AND scheduled_draft_revision IS NOT NULL)
    ),
    -- An article is waiting to go live or it is live, never both.
    CONSTRAINT v2_blog_posts_scheduled_or_live_check
        CHECK (scheduled_version_id IS NULL OR published_version_id IS NULL),
    -- Nothing reaches a visitor, or waits to, without its address.
    CONSTRAINT v2_blog_posts_address_check
        CHECK ((scheduled_version_id IS NULL AND published_version_id IS NULL) OR slug IS NOT NULL),
    CONSTRAINT v2_blog_posts_first_published_check
        CHECK (published_version_id IS NULL OR (first_published_at IS NOT NULL AND published_at IS NOT NULL))
);

-- One article per address, for as long as the article exists. A plain unique
-- index: NULLs, the drafts that have claimed nothing yet, never collide.
CREATE UNIQUE INDEX v2_blog_posts_slug_idx ON v2_blog_posts (slug);

-- The public list: live articles, newest first by their original date, with
-- the id breaking ties so a page boundary never repeats or skips one.
CREATE INDEX v2_blog_posts_public_idx ON v2_blog_posts (first_published_at DESC, id DESC)
    WHERE published_version_id IS NOT NULL;

-- "Is anything due?" is asked often, so it is one index lookup.
CREATE INDEX v2_blog_posts_due_idx ON v2_blog_posts (scheduled_for)
    WHERE scheduled_version_id IS NOT NULL;

CREATE INDEX v2_blog_posts_updated_idx ON v2_blog_posts (updated_at DESC, id DESC);


CREATE TABLE v2_blog_post_versions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id        uuid NOT NULL REFERENCES v2_blog_posts (id) ON DELETE CASCADE,
    kind           text NOT NULL,
    -- One address for all three languages. Empty is a perfectly good draft.
    slug           text NOT NULL DEFAULT '',
    -- One optional cover for all three languages; its alt text is per
    -- language, in the texts below. RESTRICT, like every use of the vault: a
    -- file an article still shows cannot be deleted from Media.
    cover_asset_id uuid REFERENCES v2_media_assets (id) ON DELETE RESTRICT,
    -- One portfolio project, or none. Deleting the project unlinks it rather
    -- than taking the writing with it.
    project_id     uuid REFERENCES v2_projects (id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_blog_post_versions_kind_check CHECK (kind IN ('draft', 'scheduled', 'published')),
    CONSTRAINT v2_blog_post_versions_slug_check
        CHECK (slug = '' OR (length(slug) <= 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')),
    -- A frozen snapshot always knows where it will be read.
    CONSTRAINT v2_blog_post_versions_frozen_slug_check CHECK (kind = 'draft' OR slug <> '')
);

CREATE UNIQUE INDEX v2_blog_post_versions_one_per_kind ON v2_blog_post_versions (post_id, kind);

CREATE INDEX v2_blog_post_versions_cover_idx ON v2_blog_post_versions (cover_asset_id)
    WHERE cover_asset_id IS NOT NULL;

CREATE INDEX v2_blog_post_versions_project_idx ON v2_blog_post_versions (project_id)
    WHERE project_id IS NOT NULL;

CREATE TABLE v2_blog_post_texts (
    version_id      uuid NOT NULL REFERENCES v2_blog_post_versions (id) ON DELETE CASCADE,
    language        text NOT NULL,
    title           text NOT NULL DEFAULT '',
    -- Plain text: the card summary, the default meta description and the
    -- feed description, so it is never rich content.
    summary         text NOT NULL DEFAULT '',
    -- The article as a validated document tree, never HTML. Inline images are
    -- held by library id and YouTube videos by video id; the server refuses
    -- any node type the contract does not name, so there is no markup to
    -- sanitise and no embed code to trust.
    body            jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
    -- Derived from the body on every save, so a list of twenty articles does
    -- not have to walk twenty documents.
    body_empty      boolean NOT NULL DEFAULT true,
    reading_minutes integer NOT NULL DEFAULT 1,
    -- The cover's alternative text in this language: the same photograph
    -- needs a different sentence in German and in Arabic.
    cover_alt       text NOT NULL DEFAULT '',
    -- Optional overrides. Empty means the title and the summary are used.
    -- There is deliberately no canonical field: that is generated.
    seo_title       text NOT NULL DEFAULT '',
    seo_description text NOT NULL DEFAULT '',
    PRIMARY KEY (version_id, language),
    CONSTRAINT v2_blog_post_texts_language_check CHECK (language IN ('de', 'en', 'ar')),
    CONSTRAINT v2_blog_post_texts_reading_check CHECK (reading_minutes >= 1)
);

CREATE TABLE v2_blog_post_tags (
    version_id uuid NOT NULL REFERENCES v2_blog_post_versions (id) ON DELETE CASCADE,
    -- RESTRICT: a tag an article carries — in a draft, a schedule or the live
    -- snapshot — is not deleted from under it.
    tag_id     uuid NOT NULL REFERENCES v2_blog_tags (id) ON DELETE RESTRICT,
    position   integer NOT NULL DEFAULT 0,
    PRIMARY KEY (version_id, tag_id)
);

CREATE INDEX v2_blog_post_tags_tag_idx ON v2_blog_post_tags (tag_id);

-- The pointers from an article to its versions. The tables point at each
-- other, so these are deferrable: the article row is written before the draft
-- it names, and the pair is checked once at COMMIT.
ALTER TABLE v2_blog_posts
    ADD CONSTRAINT v2_blog_posts_draft_fk FOREIGN KEY (draft_version_id)
        REFERENCES v2_blog_post_versions (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE v2_blog_posts
    ADD CONSTRAINT v2_blog_posts_scheduled_fk FOREIGN KEY (scheduled_version_id)
        REFERENCES v2_blog_post_versions (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE v2_blog_posts
    ADD CONSTRAINT v2_blog_posts_published_fk FOREIGN KEY (published_version_id)
        REFERENCES v2_blog_post_versions (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;


-- Anonymous comments, and the owner's replies to them.
--
-- A visitor sends text and nothing else: no account, no name, no email. So
-- this table holds the text, where it sits in the tree and when it arrived —
-- and no address, no fingerprint, no cookie id. The abuse limits that need a
-- source work on a keyed hash in the shared rate-limit table, which forgets it
-- within two days; nothing here can be joined to a person.
CREATE TABLE v2_blog_comments (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    uuid NOT NULL REFERENCES v2_blog_posts (id) ON DELETE CASCADE,
    -- NULL for a thread's first comment. A reply's parent must be a comment
    -- on the same article, which the composite key below makes a property of
    -- the schema rather than a check somebody has to remember.
    parent_id  uuid,
    -- 0 for a thread's first comment. Stored so a reply's depth is one read
    -- rather than a walk up the tree, and bounded so a script cannot build a
    -- chain ten thousand levels deep.
    depth      integer NOT NULL DEFAULT 0,
    author     text NOT NULL,
    -- Plain text, always. Rendered escaped; never HTML.
    body       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- NULL until the owner has seen it in the dashboard: that is the whole of
    -- "new comment activity". Nothing sends an email.
    seen_at    timestamptz,
    CONSTRAINT v2_blog_comments_post_id_unique UNIQUE (post_id, id),
    -- Deleting a comment deletes its whole subtree.
    CONSTRAINT v2_blog_comments_parent_fk FOREIGN KEY (post_id, parent_id)
        REFERENCES v2_blog_comments (post_id, id) ON DELETE CASCADE,
    CONSTRAINT v2_blog_comments_author_check CHECK (author IN ('visitor', 'owner')),
    CONSTRAINT v2_blog_comments_body_check
        CHECK (btrim(body) <> '' AND length(body) <= 3000),
    CONSTRAINT v2_blog_comments_depth_check CHECK (
        depth >= 0 AND depth < 20
        AND ((parent_id IS NULL AND depth = 0) OR (parent_id IS NOT NULL AND depth > 0))
    )
);

-- A thread's first comments, newest first — the public order.
CREATE INDEX v2_blog_comments_roots_idx ON v2_blog_comments (post_id, created_at DESC, id DESC)
    WHERE parent_id IS NULL;

-- One comment's replies, oldest first — the public order within a thread.
CREATE INDEX v2_blog_comments_children_idx ON v2_blog_comments (parent_id, created_at, id)
    WHERE parent_id IS NOT NULL;

-- The dashboard's activity list, newest first across every article.
CREATE INDEX v2_blog_comments_recent_idx ON v2_blog_comments (created_at DESC, id DESC);

-- Counts and the duplicate check, per article.
CREATE INDEX v2_blog_comments_post_idx ON v2_blog_comments (post_id, created_at);

-- "How many are new?" without reading the ones that are not.
CREATE INDEX v2_blog_comments_unseen_idx ON v2_blog_comments (post_id) WHERE seen_at IS NULL;
