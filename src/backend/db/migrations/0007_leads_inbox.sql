-- B4 — the inbox.
--
-- `leads` itself arrived early, with the bookings migration, because a booking
-- attaches to a lead. This migration adds everything that *reading*, answering,
-- and filing a message needs, plus the one place the admin keeps its own
-- preferences.

ALTER TABLE leads
    -- Unread is the inbox's first signal, and it is a moment rather than a
    -- flag: the history panel wants to say when the message was opened, which
    -- a boolean cannot answer.
    ADD COLUMN read_at timestamptz,
    -- Filed away. Deliberately not folded into `status`: "won" and "dealt with"
    -- are different questions, and merging them loses the only number worth
    -- having later — how many enquiries turned into work.
    ADD COLUMN archived_at timestamptz,
    ADD COLUMN is_junk boolean NOT NULL DEFAULT false,
    -- The form accepts one file. The bytes travel on in the notification mail
    -- rather than into the database or the bucket — uploads belong to B6 — so
    -- only the name and the size are kept, enough for the admin to say what
    -- arrived and where it went.
    ADD COLUMN attachment_name text,
    ADD COLUMN attachment_bytes integer,
    -- When the owner's notification mail was accepted. A lead that was stored
    -- but never announced is a real failure mode, and this is how it is seen.
    ADD COLUMN notified_at timestamptz,
    -- Threads an inbound reply back onto this lead: outbound mail carries
    -- `reply+<token>@` as its Reply-To, and the webhook reads the token back.
    -- Random and per-lead, so a guessed address reaches nothing.
    ADD COLUMN reply_token text;

-- The inbox's own list: everything not filed and not junk, newest first.
CREATE INDEX leads_open_idx ON leads (created_at DESC)
    WHERE archived_at IS NULL AND is_junk = false;

CREATE UNIQUE INDEX leads_reply_token_idx ON leads (reply_token)
    WHERE reply_token IS NOT NULL;


-- The owner's own notes. Never sent, never shown to anyone else.
CREATE TABLE lead_notes (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES leads ("id") ON DELETE CASCADE,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT lead_notes_body_check CHECK (btrim(body) <> '')
);

CREATE INDEX lead_notes_lead_idx ON lead_notes (lead_id, created_at DESC);


-- The conversation. One row per letter in either direction; the message the
-- visitor typed into the form stays on `leads.message` and is the first thing
-- the thread shows, so it is not duplicated here.
CREATE TABLE lead_messages (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES leads ("id") ON DELETE CASCADE,
    direction text NOT NULL,
    subject text NOT NULL DEFAULT '',
    body text NOT NULL,
    sent_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- The provider's id for this letter. A webhook that fires twice — which
    -- every mail provider does eventually — must not write the reply twice.
    external_id text,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT lead_messages_direction_check CHECK (direction IN ('IN', 'OUT')),
    CONSTRAINT lead_messages_body_check CHECK (btrim(body) <> '')
);

CREATE INDEX lead_messages_lead_idx ON lead_messages (lead_id, sent_at);

CREATE UNIQUE INDEX lead_messages_external_idx ON lead_messages (external_id)
    WHERE external_id IS NOT NULL;


-- What happened to this lead, in order. Written by the service, never edited.
CREATE TABLE lead_events (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES leads ("id") ON DELETE CASCADE,
    kind text NOT NULL,
    detail text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT lead_events_kind_check CHECK (
        kind IN ('ARRIVED', 'NOTIFIED', 'OPENED', 'STATUS', 'REPLIED', 'INBOUND',
                 'NOTE', 'ARCHIVED', 'UNARCHIVED', 'JUNK', 'NOT_JUNK')
    )
);

CREATE INDEX lead_events_lead_idx ON lead_events (lead_id, created_at);


-- One row per named setting, value as JSON.
--
-- The inbox ships with every feature on and each one switchable from its
-- settings page, which is the owner's stated way of working: turn it all on,
-- then turn off what gets in the way. A column per switch would mean a
-- migration per switch, which is the wrong trade for a preference.
CREATE TABLE app_settings (
    "key" text NOT NULL PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
