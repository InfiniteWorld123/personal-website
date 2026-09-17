-- B4, rebuilt — a person, with deals underneath.
--
-- The system deleted in `53c86ba` put the stage, the value and the follow-up
-- date on the person. That answers "where is Tobias?" and cannot answer "how
-- much have I sold him?", because a second project for the same client is
-- either a duplicate row or a lost one. The owner's decision, 16 Sep 2026:
-- **a person stays one row, and every piece of work under them is a deal.**
--
-- So this migration *moves* those columns rather than adding beside them. The
-- backfill runs before the drops, inside the one transaction the migration
-- runner opens, so no figure that was set by hand is lost. Nothing but
-- `booking.service.ts` reads these tables, and it touches none of the columns
-- that move — checked before this was written.
--
-- Three more things the rebuilt system needs and the old one had nowhere to
-- put: a note on a single message, a file that actually arrived, and a letter
-- that is not from a client at all.


-- ─────────────────────────────────────────────────────────────────────────
-- Deals
-- ─────────────────────────────────────────────────────────────────────────
--
-- The seven stages the owner chose, on the deal now instead of the person.
-- A person with no deal is not a lead — that is how the invoice from a
-- hosting provider sits in the same inbox without polluting the board. No
-- `is_lead` flag: a flag has to be maintained, and "has a deal" maintains
-- itself.

CREATE TABLE deals (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES leads ("id") ON DELETE CASCADE,
    -- NULL while the work has no name yet. The shared vocabulary from 0010;
    -- a service is a row, so a sixth one later is a record, not a deploy.
    service_id uuid REFERENCES services ("id") ON DELETE SET NULL,
    title text NOT NULL DEFAULT '',
    stage text NOT NULL DEFAULT 'NEW',
    -- Integer cents beside its own currency, the platform convention. NULL is
    -- "not valued yet", which is a different fact from "worth nothing".
    value_cents integer,
    currency text NOT NULL DEFAULT 'EUR',
    -- The €39/month hosting is the owner's floor income, and a one-off column
    -- cannot hold it. A recurring deal is counted per month, never summed into
    -- the one-off pipeline figure.
    is_recurring boolean NOT NULL DEFAULT false,
    -- A date, not a flag: "later" is not an instruction, "the 19th" is.
    follow_up_at timestamptz,
    next_step text NOT NULL DEFAULT '',
    lost_reason text,
    closed_at timestamptz,
    -- Stored rather than derived from `lead_events`: "11 days in this stage"
    -- is read on every card of every render.
    stage_changed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT deals_stage_check
        CHECK (stage IN ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'HOLD', 'WON', 'LOST')),
    CONSTRAINT deals_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT deals_value_check CHECK (value_cents IS NULL OR value_cents >= 0),
    CONSTRAINT deals_lost_reason_check CHECK (
        lost_reason IS NULL OR lost_reason IN
            ('PRICE', 'SILENCE', 'TIMING', 'ELSEWHERE', 'NOT_A_FIT', 'DECLINED')
    ),
    -- A deal is closed with a reason or is not closed. Enforced here, not in
    -- the service, because the board's numbers are only worth reading if every
    -- LOST row carries its reason. The owner kept this switch on.
    CONSTRAINT deals_lost_pair_check CHECK ((stage = 'LOST') = (lost_reason IS NOT NULL))
);

-- The board reads one column per stage, newest first inside each.
CREATE INDEX deals_stage_idx ON deals (stage, stage_changed_at DESC);
-- Every deal of one person, for the detail page.
CREATE INDEX deals_lead_idx ON deals (lead_id, created_at);
-- The follow-up list: open deals with a date, soonest first.
CREATE INDEX deals_follow_up_idx ON deals (follow_up_at)
    WHERE follow_up_at IS NOT NULL AND stage NOT IN ('WON', 'LOST');


-- ─────────────────────────────────────────────────────────────────────────
-- Move the pipeline off the person, onto their first deal
-- ─────────────────────────────────────────────────────────────────────────
--
-- Every lead that was ever worked on — anything past NEW, or carrying a
-- value, a service, a date or a next step — becomes one deal holding exactly
-- what the person held. A lead that is only an unanswered message gets no
-- deal, and correctly reads as "not a lead yet" until the owner starts one.

INSERT INTO deals
    (lead_id, service_id, title, stage, value_cents, currency,
     follow_up_at, next_step, lost_reason, closed_at, stage_changed_at, created_at)
SELECT
    l.id, l.service_id,
    COALESCE(NULLIF(btrim(l.service_interest), ''), ''),
    l.status, l.value_cents, l.currency,
    l.follow_up_at, l.next_step, l.lost_reason, l.closed_at,
    l.stage_changed_at, l.created_at
FROM leads l
WHERE l.status <> 'NEW'
   OR l.value_cents IS NOT NULL
   OR l.service_id IS NOT NULL
   OR l.follow_up_at IS NOT NULL
   OR btrim(l.next_step) <> '';

-- The history can now say which deal a line belongs to. NULL stays valid:
-- a message arriving is about the person, not about any one piece of work.
ALTER TABLE lead_events
    ADD COLUMN deal_id uuid REFERENCES deals ("id") ON DELETE CASCADE;

ALTER TABLE lead_events DROP CONSTRAINT lead_events_kind_check;
ALTER TABLE lead_events ADD CONSTRAINT lead_events_kind_check CHECK (
    kind IN (
        -- the inbox
        'ARRIVED', 'NOTIFIED', 'OPENED', 'STATUS', 'REPLIED', 'INBOUND',
        'NOTE', 'ARCHIVED', 'UNARCHIVED', 'JUNK', 'NOT_JUNK',
        -- the calls
        'BOOKED', 'CALL_HELD', 'NO_SHOW', 'CANCELLED', 'RESCHEDULED',
        -- the deals
        'CREATED', 'DEAL_OPENED', 'PROPOSAL', 'FOLLOW_UP', 'SNOOZED',
        'VALUE', 'SERVICE', 'WON', 'LOST', 'AUTO_CLOSED', 'REOPENED'
    )
);

-- Now the columns are empty of meaning, so they go. Postgres removes the
-- indexes and check constraints that depended on them in the same step:
-- `leads_status_check`, `leads_lost_pair_check`, `leads_lost_reason_check`,
-- `leads_value_check`, `leads_currency_check`, `leads_status_created_idx`,
-- `leads_follow_up_idx` and `leads_pipeline_idx`. Leaving them in place would
-- be exactly the thing that made the owner stop trusting the old panel: a
-- column that looks like an answer and is never written.
ALTER TABLE leads
    DROP COLUMN status,
    DROP COLUMN service_id,
    DROP COLUMN value_cents,
    DROP COLUMN currency,
    DROP COLUMN follow_up_at,
    DROP COLUMN next_step,
    DROP COLUMN lost_reason,
    DROP COLUMN closed_at,
    DROP COLUMN stage_changed_at,
    DROP COLUMN auto_closed_at;

-- `first_replied_at` deliberately stays on the person: how long someone waited
-- for a first answer is a fact about the conversation, not about a deal. The
-- 15 Sep audit found nothing ever wrote it; the rebuilt reply path does.


-- ─────────────────────────────────────────────────────────────────────────
-- A real mailbox
-- ─────────────────────────────────────────────────────────────────────────
--
-- The owner asked for his actual address in the admin, not a leads-only
-- inbox: "receiving emails, sending emails… and when someone sends me a
-- document, I can open it." A letter from a hosting provider is a person with
-- no deal — one conversation model, one thread, no second table.

ALTER TABLE leads DROP CONSTRAINT leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check
    CHECK (source IN ('CONTACT_FORM', 'BOOKING', 'MANUAL', 'MAIL'));

ALTER TABLE lead_messages
    -- The owner's own note on one letter. Never sent. `lead_notes` holds notes
    -- about the person; this is about the letter in front of him.
    ADD COLUMN note text NOT NULL DEFAULT '',
    -- Per message, so a thread with one new reply is not marked read whole.
    ADD COLUMN read_at timestamptz,
    ADD COLUMN archived_at timestamptz,
    -- Who it was actually between. A mailbox that receives everything cannot
    -- assume the address on the lead is the address on the letter.
    ADD COLUMN from_email text,
    ADD COLUMN to_email text,
    -- RFC 5322 threading. `external_id` stays what it is — the provider's id,
    -- used only to refuse a webhook that fires twice.
    ADD COLUMN in_reply_to text;

-- The inbox list: everything unfiled, newest first.
CREATE INDEX lead_messages_open_idx ON lead_messages (sent_at DESC)
    WHERE archived_at IS NULL;


-- ─────────────────────────────────────────────────────────────────────────
-- Files that actually arrived
-- ─────────────────────────────────────────────────────────────────────────
--
-- 0007 kept only `attachment_name` and `attachment_bytes` on the lead, because
-- the bytes travelled on in the notification mail and there was nowhere to put
-- them. There is now: the R2 store in `shared/image-storage` already signs and
-- uploads, and this table points at the same bucket.

CREATE TABLE lead_attachments (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES leads ("id") ON DELETE CASCADE,
    -- NULL for a file that came with the contact form rather than with a
    -- letter, so the form's attachment finally has a home too.
    message_id uuid REFERENCES lead_messages ("id") ON DELETE CASCADE,
    filename text NOT NULL,
    content_type text NOT NULL DEFAULT 'application/octet-stream',
    bytes integer NOT NULL,
    -- Key in the bucket, never a URL: the public host is configuration and
    -- storing it would freeze today's domain into every old row.
    storage_key text NOT NULL,
    direction text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT lead_attachments_direction_check CHECK (direction IN ('IN', 'OUT')),
    CONSTRAINT lead_attachments_filename_check CHECK (btrim(filename) <> ''),
    CONSTRAINT lead_attachments_bytes_check CHECK (bytes >= 0)
);

CREATE INDEX lead_attachments_lead_idx ON lead_attachments (lead_id, created_at);
CREATE INDEX lead_attachments_message_idx ON lead_attachments (message_id);
