-- The lead system, third attempt — 18 Sep 2026.
--
-- Twice before, a pipeline was built and deleted. The reasons the owner gave
-- are the design brief for this one, so they are written down here rather than
-- in a document nobody opens:
--
--   1. *"I don't have any problem with complexity… I would like to have
--      everything functioning and not stupid buttons that don't work."*
--      Complexity is allowed. A number that is not computed from something
--      real, or a button that promises what nothing does, is not.
--   2. *"I hate complexity… I will be fucked and not understand my website
--      personally."* Every column below answers a question he asked for by
--      name in the lab. Nothing is here "for later".
--
-- **The person is not the deal.** `leads` stays exactly what the inbox made
-- it: one row per human, holding identity and mailbox state. Everything that
-- moves — a stage, a price, a date — lives on a deal, because he asked for
-- several deals per person: the same baker can order a website this year and a
-- booking system next year, and each has its own life.
--
-- **The two kinds of money never meet.** `build_cents` is paid once and ends;
-- `monthly_cents` is the subscription and does not. `docs/services/*.pdf`
-- calls merging them «الخطأ الذي يُفلس», and a screen that added a project fee
-- to a monthly fee is what made him delete the last system. Two columns, so no
-- query can accidentally sum them into one lie.


-- ─────────────────────────────────────────────────────────────────────────
-- The deal
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE deals (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Cascade: a deal is meaningless without the person it belongs to, and the
    -- person is only ever deleted deliberately.
    lead_id uuid NOT NULL REFERENCES leads ("id") ON DELETE CASCADE,

    -- What it is, in his words. Free text, not a foreign key into `services`:
    -- he refused that coupling on 17 Sep and again in the lab — services and
    -- prices keep changing, and a deal signed at last year's price must not be
    -- rewritten when this year's price is.
    title text NOT NULL,

    -- Four stages plus lost, which is what he chose: «أربع مراحل تنتهي بفوز أو
    -- خسارة». PROPOSAL earns its place because it is the stage where deals die
    -- silently — a sent offer nobody answered looks the same as a conversation
    -- that never got that far, and they need different next moves.
    stage text NOT NULL DEFAULT 'NEW',

    -- Paid once, then over.
    build_cents integer NOT NULL DEFAULT 0,
    -- Paid every month, for as long as the site runs.
    monthly_cents integer NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'EUR',

    -- One line: what *he* must do next. Not a task list — he asked for a
    -- sentence, and a sentence is what the list shows.
    next_step text NOT NULL DEFAULT '',

    -- A day, not an instant: "follow up on Thursday" is a date in his life,
    -- and storing it as a timestamp would invent a time he never chose.
    -- Nothing sets this by itself — he chose «تاريخ تضعه أنت» over a system
    -- that guesses from silence.
    follow_up_on date,

    -- Why it was lost, from the six the validation allows. Six codes rather
    -- than free text so that "most common reason" is a real count, and a
    -- sentence beside it for what a code cannot hold.
    lost_reason text,
    lost_note text NOT NULL DEFAULT '',

    -- How long it has sat where it sits. Free stage-age, without a query over
    -- the history.
    stage_changed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT deals_title_check CHECK (btrim(title) <> ''),
    CONSTRAINT deals_stage_check
        CHECK (stage IN ('NEW', 'TALKING', 'PROPOSAL', 'WON', 'LOST')),
    CONSTRAINT deals_reason_check
        CHECK (lost_reason IS NULL OR lost_reason IN
            ('TOO_EXPENSIVE', 'CHOSE_OTHER', 'POSTPONED', 'NO_ANSWER', 'NOT_A_FIT', 'OTHER')),
    -- Losing and saying why are **one act**. A screen that let them be two is
    -- what produced the 500 that opened the 15 Sep audit, so the database
    -- refuses the half-state and the service moves both together.
    CONSTRAINT deals_lost_pair_check
        CHECK ((stage = 'LOST') = (lost_reason IS NOT NULL)),
    -- A closed deal has a closing date, an open one does not. Without this,
    -- "won this month" quietly counts deals that were won long ago.
    CONSTRAINT deals_closed_pair_check
        CHECK ((stage IN ('WON', 'LOST')) = (closed_at IS NOT NULL)),
    -- A closed deal is not waiting for anything, so it cannot sit in Today.
    CONSTRAINT deals_follow_up_check
        CHECK (stage NOT IN ('WON', 'LOST') OR follow_up_on IS NULL),
    CONSTRAINT deals_money_check CHECK (build_cents >= 0 AND monthly_cents >= 0)
);

-- The person's file reads every deal they have.
CREATE INDEX deals_lead_idx ON deals (lead_id, created_at DESC);

-- The board reads one column at a time.
CREATE INDEX deals_stage_idx ON deals (stage, stage_changed_at DESC);

-- Overdue, today, later — the grouping the list opens on, and the number on
-- the sidebar. Partial, because a closed deal can never appear in it.
CREATE INDEX deals_follow_up_idx ON deals (follow_up_on)
    WHERE stage NOT IN ('WON', 'LOST') AND follow_up_on IS NOT NULL;

COMMENT ON TABLE deals IS
    'One thing this person might buy, or did. The stage, the money and the follow-up live here — never on the person, who is only ever a person.';


-- ─────────────────────────────────────────────────────────────────────────
-- What happened, and when
-- ─────────────────────────────────────────────────────────────────────────

-- He asked for both halves: *«تلقائي + سطر تكتبه»*. The automatic half is what
-- makes the file trustworthy — it cannot be true that a deal is Won with
-- nothing saying when it changed. The written half is what makes it his: "I
-- called him, he wants photos first" is the fact that decides the next move,
-- and no column can hold it.
--
-- On the **person**, not on the deal, with `deal_id` optional: a phone call
-- happens with a human being, sometimes before there is any deal to hang it
-- on. The person's file shows one history, so that is how it is stored.
--
-- This is deliberately not the old `lead_events`. That table recorded typed
-- events with structured payloads nothing ever read back. Here the service
-- writes the sentence at the moment it knows it, and the screen prints it.
CREATE TABLE lead_events (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES leads ("id") ON DELETE CASCADE,
    -- SET NULL, not CASCADE: deleting a deal must not erase the record that it
    -- existed and was lost.
    deal_id uuid REFERENCES deals ("id") ON DELETE SET NULL,

    kind text NOT NULL,
    body text NOT NULL,
    -- Drawn differently, and it is the honest half of the answer to "who says
    -- so": the system, or him.
    is_automatic boolean NOT NULL DEFAULT true,

    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT lead_events_kind_check
        CHECK (kind IN ('DEAL_OPENED', 'STAGE', 'MONEY', 'FOLLOW_UP', 'DEAL_REMOVED', 'NOTE')),
    CONSTRAINT lead_events_body_check CHECK (btrim(body) <> ''),
    -- A line he typed is never labelled as something the system observed.
    CONSTRAINT lead_events_note_check CHECK (kind <> 'NOTE' OR is_automatic = false)
);

CREATE INDEX lead_events_lead_idx ON lead_events (lead_id, created_at DESC);

COMMENT ON TABLE lead_events IS
    'One line per thing that happened to a person: what the system did, and what he wrote himself.';
