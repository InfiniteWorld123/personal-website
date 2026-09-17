-- The inbox, and nothing else.
--
-- On 17 Sep 2026 the owner stopped the rebuild and narrowed it to one thing:
-- *"a simple inbox, so fucking simple. Someone sends me a message, I open the
-- message, and that's it."* Stages, deals, a board and a follow-up list are
-- gone — not because they were wrong, but because he could not hold them in
-- his head, and a panel its owner does not understand is a panel he stops
-- opening.
--
-- **What is deliberately NOT dropped, and why.** `bookings.lead_id` is a
-- foreign key into `leads`, and the booking system is finished and must not be
-- touched. More to the point, `leads` *is* the inbox: he chose one row per
-- person rather than one per message, and that row is exactly this table. So
-- the pipeline goes and the person stays.


-- ─────────────────────────────────────────────────────────────────────────
-- The pipeline goes
-- ─────────────────────────────────────────────────────────────────────────

-- A separate history table earns its place when several kinds of thing happen
-- to a record. In an inbox only one kind does — a letter — and the letters are
-- their own history. Nothing has written to this since the lead system was
-- deleted.
--
-- Dropped **before** `deals`: `lead_events.deal_id` points at it, and the other
-- order fails with "cannot drop table deals because other objects depend on
-- it". Caught by running the whole chain against a throwaway Postgres first.
DROP TABLE IF EXISTS lead_events;

DROP TABLE IF EXISTS deals;

-- He asked for this, then took it back the same day: notes belong to the
-- person, not to each letter. *"We will not make for each email a note… if I
-- would like to edit something then I go to the lead itself."*
ALTER TABLE lead_messages DROP COLUMN IF EXISTS note;


-- ─────────────────────────────────────────────────────────────────────────
-- What the inbox adds
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE leads
    -- One of the four things he settled before the lab: inbox, archive, star.
    -- On the person rather than the message, because the list is one row per
    -- person — starring a letter would light a row he cannot see.
    ADD COLUMN IF NOT EXISTS starred boolean NOT NULL DEFAULT false,
    -- Read and archived already exist from 0007 and mean exactly what the
    -- inbox needs, so they are reused rather than duplicated.
    ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

-- The list is ordered by the last letter in either direction, and that is read
-- on every render. Derivable from `lead_messages`, stored because a subquery
-- per row is the wrong price for the one column the whole screen sorts on.
UPDATE leads l SET last_message_at = GREATEST(
    l.created_at,
    COALESCE((SELECT MAX(m.sent_at) FROM lead_messages m WHERE m.lead_id = l.id), l.created_at)
);

ALTER TABLE leads ALTER COLUMN last_message_at SET DEFAULT CURRENT_TIMESTAMP;

-- The inbox list: everything unfiled, newest conversation first.
CREATE INDEX IF NOT EXISTS leads_inbox_idx ON leads (last_message_at DESC)
    WHERE archived_at IS NULL AND is_junk = false;

-- The starred lens.
CREATE INDEX IF NOT EXISTS leads_starred_idx ON leads (last_message_at DESC)
    WHERE starred = true AND archived_at IS NULL;

COMMENT ON TABLE leads IS
    'A person who has written or been written to. One row per human, holding the whole correspondence — the unit the inbox list shows.';
