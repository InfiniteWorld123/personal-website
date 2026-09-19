-- Reading and liking an article. 19 Sep 2026.
--
-- Two integers on the post, and nothing else. That is the whole design, and it
-- is a deliberate refusal rather than a shortcut.
--
-- The obvious shape — a `post_views` table with one row per reader — would let
-- the owner answer questions he has not asked ("who read this", "what else did
-- they read"), and to answer them it would have to keep something that
-- identifies a person: an address, a fingerprint, a cookie id. Under the GDPR
-- an IP address is personal data, and a salted hash of one is still personal
-- data while the salt exists. So there is no such table here. A counter cannot
-- be joined to a human being, because there is nothing to join it to.
--
-- What that costs: the figures are approximate and mildly gameable. A reader
-- who clears their browser storage is counted twice; somebody determined can
-- push a number up. That is the right trade for a blog. These are a signal for
-- the person writing, not an analytics product, and the platform already
-- refuses to ship numbers it cannot stand behind — so the screen says "reads",
-- never "readers".
--
-- Repeat suppression lives in two places, neither of which stores anything
-- about the visitor:
--   * the reader's own browser, which remembers what it has already counted;
--   * the request rate limiter, which keeps an HMAC of the address and forgets
--     it within two days (see `request_rate_limits`).
--
-- Comments are NOT part of this. They were explicitly excluded — there is no
-- table, no route and no moderation surface for them here.

ALTER TABLE posts
    -- How many times the article has been opened and read. Only ever moves up:
    -- a read is a thing that happened, and nothing undoes it.
    ADD COLUMN view_count integer NOT NULL DEFAULT 0,
    -- How many readers said they liked it. Can move down, because a like is a
    -- statement a reader is allowed to take back.
    ADD COLUMN like_count integer NOT NULL DEFAULT 0,

    -- Neither figure can be negative. A count below zero is not a smaller
    -- number, it is evidence that something is wrong, and the database should
    -- refuse it rather than let it be displayed.
    ADD CONSTRAINT posts_view_count_check CHECK (view_count >= 0),
    ADD CONSTRAINT posts_like_count_check CHECK (like_count >= 0);

COMMENT ON COLUMN posts.view_count IS
    'Times this article has been opened. Approximate by design: no per-reader row exists, so nothing here identifies anyone.';

COMMENT ON COLUMN posts.like_count IS
    'Readers who liked this article, minus those who took it back. Same privacy design as view_count.';
