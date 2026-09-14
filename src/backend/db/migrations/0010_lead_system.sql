-- B4, third round — the lead system.
--
-- `leads` has carried a `status` column since the bookings migration and
-- nothing ever worked it: the inbox answers "who wrote me", and nothing
-- answered "who am I forgetting". This migration adds the four things that
-- second question needs — a stage worth moving through, a date to be chased
-- on, a number to be worth, and a reason when it dies — plus the one table
-- that makes the inbox, the pipeline and the calls talk about the same thing.


-- ─────────────────────────────────────────────────────────────────────────
-- Services — the shared vocabulary
-- ─────────────────────────────────────────────────────────────────────────
--
-- Three rows, from `docs/services/`. Before this table there were three
-- separate vocabularies for the same idea: the contact form wrote free text
-- into `leads.service_interest`, a call type carried only its own name, and
-- the offer lived in Markdown. "How many shops did I sell?" had no answer
-- because nothing agreed on what a shop was.
--
-- A row, not an enum: a fourth service later must be a record, not a deploy.

CREATE TABLE services (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Reaches a public URL eventually, so its shape is enforced here exactly
    -- as it is for posts, projects and booking types.
    slug text NOT NULL UNIQUE,
    -- What a lead is provisionally worth when it names this service. The
    -- owner edits the figure per lead; this is only the opening suggestion,
    -- and it is the start price from the services documentation.
    start_price_cents integer NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'EUR',
    -- Carried onto the board and the filters, so a service reads as itself at
    -- a glance rather than as a legend entry.
    accent text NOT NULL DEFAULT '#355cff',
    is_active boolean NOT NULL DEFAULT true,
    sort_order smallint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT services_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT services_currency_check CHECK (currency ~ '^[A-Z]{3}$')
);

-- The same three-language rule posts and projects follow.
CREATE TABLE service_translations (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id uuid NOT NULL REFERENCES services ("id") ON DELETE CASCADE,
    "language" text NOT NULL,
    "name" text NOT NULL,
    promise text NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '',
    deliverables jsonb NOT NULL DEFAULT '[]'::jsonb,
    CONSTRAINT service_translations_language_check CHECK ("language" IN ('de', 'en', 'ar')),
    CONSTRAINT service_translations_name_check CHECK (btrim("name") <> ''),
    UNIQUE (service_id, "language")
);

INSERT INTO services (slug, start_price_cents, accent, sort_order) VALUES
    ('website',         99000, '#355cff', 1),
    ('online-shop',    249000, '#0ea5a5', 2),
    ('custom-software',299000, '#7c6cf0', 3);

INSERT INTO service_translations (service_id, "language", "name", promise)
SELECT s.id, t."language", t."name", t.promise
FROM services s
JOIN (VALUES
    ('website',         'de', 'Website',               'Ein klarer Auftritt, der auf dem Handy funktioniert.'),
    ('website',         'en', 'Website',               'A clear presence that works on a phone.'),
    ('website',         'ar', 'موقع إلكتروني',          'حضور واضح يعمل على الهاتف.'),
    ('online-shop',     'de', 'Online-Shop',           'Verkaufen, ohne die Technik zu tragen.'),
    ('online-shop',     'en', 'Online shop',           'Selling, without carrying the technology.'),
    ('online-shop',     'ar', 'متجر إلكتروني',          'بيع دون أن تحمل عبء التقنية.'),
    ('custom-software', 'de', 'Individuelle Software', 'Ein System, das dem Ablauf folgt, nicht umgekehrt.'),
    ('custom-software', 'en', 'Custom software',       'A system that follows the process, not the other way round.'),
    ('custom-software', 'ar', 'برمجيات مخصصة',          'نظام يتبع سير عملك، لا العكس.')
) AS t (slug, "language", "name", promise) ON t.slug = s.slug;


-- A call type may name the service it is about. NULL means "any" — a short
-- introductory call belongs to no single service, and forcing one would be a
-- lie the board then reports as fact.
ALTER TABLE booking_types
    ADD COLUMN service_id uuid REFERENCES services ("id") ON DELETE SET NULL;


-- ─────────────────────────────────────────────────────────────────────────
-- The pipeline
-- ─────────────────────────────────────────────────────────────────────────
--
-- Two stages join the five that shipped:
--
--   PROPOSAL  the moment a number is on the table. Deals do not die in
--             "qualified", they die here, silently, while nobody chases.
--   HOLD      "call me in January". Without it, every dormant lead pollutes
--             the follow-up list and the list stops being read.

ALTER TABLE leads DROP CONSTRAINT leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
    CHECK (status IN ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'HOLD', 'WON', 'LOST'));

ALTER TABLE leads
    -- The shared vocabulary, beside the free text the form still collects.
    -- `service_interest` is kept: it is what the visitor actually typed, and
    -- overwriting a person's words with an id loses evidence.
    ADD COLUMN service_id uuid REFERENCES services ("id") ON DELETE SET NULL,
    -- Money as integer cents beside its own currency, the convention
    -- `data-model.md` fixes for the whole platform. NULL means "not valued
    -- yet", which is a different fact from "worth nothing".
    ADD COLUMN value_cents integer,
    ADD COLUMN currency text NOT NULL DEFAULT 'EUR',
    -- The single field that stops enquiries going quiet. A date, not a flag:
    -- "later" is not an instruction, "the 19th" is.
    ADD COLUMN follow_up_at timestamptz,
    -- One sentence of what happens next, so the board is actionable rather
    -- than a list of names.
    ADD COLUMN next_step text NOT NULL DEFAULT '',
    ADD COLUMN lost_reason text,
    ADD COLUMN closed_at timestamptz,
    -- When the lead last changed stage. Derivable from `lead_events`, stored
    -- because "11 days in this stage" is read on every card of every render
    -- and a per-card subquery is the wrong price for it.
    ADD COLUMN stage_changed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Where a hand-added lead actually came from. The `source` column already
    -- says MANUAL; this says which door — and it is the only way the source
    -- numbers ever learn about what happens off the site.
    ADD COLUMN channel text,
    -- First outbound answer, for the response-time figure. A separate column
    -- rather than a query over `lead_messages` because the median is read on
    -- the overview and the messages table grows without bound.
    ADD COLUMN first_replied_at timestamptz,
    -- Set when a rule closed this lead rather than the owner. The Today strip
    -- reads it for one day and offers the undo, so an automatic close is
    -- announced instead of silent.
    ADD COLUMN auto_closed_at timestamptz,
    ADD CONSTRAINT leads_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT leads_value_check CHECK (value_cents IS NULL OR value_cents >= 0),
    ADD CONSTRAINT leads_lost_reason_check CHECK (
        lost_reason IS NULL OR lost_reason IN
            ('PRICE', 'SILENCE', 'TIMING', 'ELSEWHERE', 'NOT_A_FIT', 'DECLINED')
    ),
    ADD CONSTRAINT leads_channel_check CHECK (
        channel IS NULL OR channel IN
            ('REFERRAL', 'INSTAGRAM', 'WHATSAPP', 'IN_PERSON', 'PHONE', 'OTHER')
    );

-- The follow-up list: everything open with a date, soonest first. Partial,
-- because closed and filed leads are never in it.
CREATE INDEX leads_follow_up_idx ON leads (follow_up_at)
    WHERE follow_up_at IS NOT NULL
      AND status NOT IN ('WON', 'LOST')
      AND archived_at IS NULL
      AND is_junk = false;

-- The board reads one column per stage, newest first inside each.
CREATE INDEX leads_pipeline_idx ON leads (status, stage_changed_at DESC)
    WHERE archived_at IS NULL AND is_junk = false;


-- ─────────────────────────────────────────────────────────────────────────
-- What the history may record
-- ─────────────────────────────────────────────────────────────────────────
--
-- The fault this whole round exists to fix: `bookings.lead_id` has always
-- pointed at the person, but the booking service wrote nothing into their
-- history. Someone who wrote, booked a call, and cancelled it showed a single
-- line — "a message arrived" — and the middle of their story was simply gone.
-- These kinds let the calls write themselves down where the person is read.

ALTER TABLE lead_events DROP CONSTRAINT lead_events_kind_check;
ALTER TABLE lead_events ADD CONSTRAINT lead_events_kind_check CHECK (
    kind IN (
        -- the inbox, as before
        'ARRIVED', 'NOTIFIED', 'OPENED', 'STATUS', 'REPLIED', 'INBOUND',
        'NOTE', 'ARCHIVED', 'UNARCHIVED', 'JUNK', 'NOT_JUNK',
        -- the calls
        'BOOKED', 'CALL_HELD', 'NO_SHOW', 'CANCELLED', 'RESCHEDULED',
        -- the pipeline
        'CREATED', 'PROPOSAL', 'FOLLOW_UP', 'SNOOZED', 'VALUE', 'SERVICE',
        'WON', 'LOST', 'AUTO_CLOSED', 'REOPENED'
    )
);

-- Written by a rule rather than by the owner. Kept apart from `detail` so the
-- history can say plainly which lines were nobody's decision.
ALTER TABLE lead_events
    ADD COLUMN is_automatic boolean NOT NULL DEFAULT false;


-- ─────────────────────────────────────────────────────────────────────────
-- Backfill
-- ─────────────────────────────────────────────────────────────────────────
--
-- Existing leads get the service the form's free text already named, and the
-- value that service suggests. Anything unrecognised stays NULL rather than
-- being guessed into a number that would then be counted as pipeline.

UPDATE leads l SET service_id = s.id
FROM services s
WHERE l.service_id IS NULL AND s.slug = CASE
    WHEN l.service_interest ILIKE '%shop%'   THEN 'online-shop'
    WHEN l.service_interest ILIKE '%system%' THEN 'custom-software'
    WHEN l.service_interest ILIKE '%software%' THEN 'custom-software'
    WHEN l.service_interest ILIKE '%web%'    THEN 'website'
    WHEN l.service_interest ILIKE '%site%'   THEN 'website'
    ELSE NULL
END;

UPDATE leads l SET value_cents = s.start_price_cents, currency = s.currency
FROM services s
WHERE l.value_cents IS NULL AND l.service_id = s.id;

-- The clock on "how long has this sat here" starts from the last thing that
-- actually happened to the row, not from the moment this migration ran.
UPDATE leads SET stage_changed_at = updated_at;

-- A lead already marked lost predates the reason column; it is recorded as
-- unexplained rather than invented. This runs before the pair constraint is
-- added, because a CHECK is validated against existing rows the moment it
-- exists — the order here is load-bearing, not stylistic.
UPDATE leads SET lost_reason = 'SILENCE' WHERE status = 'LOST' AND lost_reason IS NULL;

-- A lead is closed with a reason or is not closed. Enforced here rather than
-- in the service, because the numbers on the overview are only worth reading
-- if every LOST row carries its reason.
ALTER TABLE leads ADD CONSTRAINT leads_lost_pair_check
    CHECK ((status = 'LOST') = (lost_reason IS NOT NULL));

-- The first answer already sent, so the response-time figure does not start
-- empty on a mailbox that has been worked for weeks.
UPDATE leads l SET first_replied_at = m.first_out
FROM (
    SELECT lead_id, MIN(sent_at) AS first_out
    FROM lead_messages WHERE direction = 'OUT' GROUP BY lead_id
) m
WHERE m.lead_id = l.id AND l.first_replied_at IS NULL;
