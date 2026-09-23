-- Public AI Assistant V2. See docs/v2/ai-assistant.md.
--
-- A visitor asks a question on the public website; the assistant answers from
-- the owner's currently published content. The owner reads the conversations
-- privately in the Dashboard. This migration holds only what that needs:
--
--   * `v2_assistant_settings` — one row at most: whether the assistant is on,
--     and the owner's transcript-retention choice (`manual`, the default, or
--     automatic deletion after N days). Absent until the owner saves; the
--     application reads a missing row as the defaults, so a migration never
--     carries it.
--   * `v2_assistant_conversations` — one visitor conversation. The browser
--     holds a random 256-bit token; only its SHA-256 is stored, so the table
--     cannot be used to resume somebody's conversation. There is no address,
--     no user agent and no name here, on purpose.
--   * `v2_assistant_messages` — the visitor's text and the assistant's reply,
--     in order. Deleting a conversation deletes its messages (CASCADE).
--   * `v2_assistant_usage_days` — anonymous daily counters: questions,
--     outcomes, provider calls. The daily provider cap is enforced against this
--     table, and Analytics reads it. It holds no text, so it survives the
--     owner deleting a transcript.
--
-- Knowledge is not stored here: it is read through the Services, Projects,
-- Blog and Content public readers, so unpublishing removes it at once.
--
-- Numbered 0013: 0012 is Invoices.
--
-- Structure only. No rows.


CREATE TABLE v2_assistant_settings (
    -- A single-row table: the key can only ever be 1.
    id              smallint PRIMARY KEY DEFAULT 1,
    enabled         boolean NOT NULL DEFAULT false,
    retention_mode  text NOT NULL DEFAULT 'manual',
    retention_days  integer,
    updated_at      timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_assistant_settings_single_check CHECK (id = 1),
    CONSTRAINT v2_assistant_settings_mode_check CHECK (retention_mode IN ('manual', 'days')),
    CONSTRAINT v2_assistant_settings_days_check CHECK (
        (retention_mode = 'manual' AND retention_days IS NULL)
        OR (retention_mode = 'days' AND retention_days BETWEEN 1 AND 3650)
    )
);

CREATE TABLE v2_assistant_conversations (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- SHA-256 (hex) of the visitor's opaque token. Never the token itself.
    token_hash       text NOT NULL,
    -- The language of the first question: the owner's list filters on it.
    language         text NOT NULL,
    -- The language of the page the widget was opened on, when it said.
    page_locale      text,
    message_count    integer NOT NULL DEFAULT 0,
    fallback_count   integer NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_message_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_assistant_conversations_token_unique UNIQUE (token_hash),
    CONSTRAINT v2_assistant_conversations_token_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT v2_assistant_conversations_language_check CHECK (language IN ('de', 'en', 'ar')),
    CONSTRAINT v2_assistant_conversations_locale_check
        CHECK (page_locale IS NULL OR page_locale IN ('de', 'en', 'ar')),
    CONSTRAINT v2_assistant_conversations_counts_check
        CHECK (message_count >= 0 AND fallback_count >= 0)
);

-- The owner's list: most recent activity first, the id breaking ties.
CREATE INDEX v2_assistant_conversations_recent_idx
    ON v2_assistant_conversations (last_message_at DESC, id DESC);

CREATE INDEX v2_assistant_conversations_created_idx
    ON v2_assistant_conversations (created_at);

CREATE TABLE v2_assistant_messages (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  uuid NOT NULL REFERENCES v2_assistant_conversations (id) ON DELETE CASCADE,
    -- 1-based order inside the conversation.
    position         integer NOT NULL,
    role             text NOT NULL,
    language         text NOT NULL,
    body             text NOT NULL,
    -- Replies only: how the answer was reached, and by what.
    outcome          text,
    provider         text,
    -- Replies only: the public pages the answer came from, `[{kind,title,url}]`.
    sources          jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Replies only: whether the Contact / Booking links were offered.
    offered_contact  boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_assistant_messages_position_unique UNIQUE (conversation_id, position),
    CONSTRAINT v2_assistant_messages_position_check CHECK (position > 0),
    CONSTRAINT v2_assistant_messages_role_check CHECK (role IN ('visitor', 'assistant')),
    CONSTRAINT v2_assistant_messages_language_check CHECK (language IN ('de', 'en', 'ar')),
    CONSTRAINT v2_assistant_messages_body_check
        CHECK (btrim(body) <> '' AND char_length(body) <= 8000),
    CONSTRAINT v2_assistant_messages_outcome_check CHECK (
        (role = 'visitor' AND outcome IS NULL AND provider IS NULL)
        OR (role = 'assistant'
            AND outcome IN ('answered', 'fallback', 'handoff', 'smalltalk')
            AND provider IN ('none', 'workers-ai'))
    ),
    CONSTRAINT v2_assistant_messages_sources_check CHECK (jsonb_typeof(sources) = 'array')
);

CREATE TABLE v2_assistant_usage_days (
    -- A UTC calendar day: the Workers AI free allocation resets at 00:00 UTC.
    day                 date PRIMARY KEY,
    conversations       integer NOT NULL DEFAULT 0,
    questions           integer NOT NULL DEFAULT 0,
    answered            integer NOT NULL DEFAULT 0,
    fallbacks           integer NOT NULL DEFAULT 0,
    handoffs            integer NOT NULL DEFAULT 0,
    contact_offers      integer NOT NULL DEFAULT 0,
    provider_calls      integer NOT NULL DEFAULT 0,
    -- A provider answer thrown away (failure, invented price, "unknown").
    provider_fallbacks  integer NOT NULL DEFAULT 0,
    rate_limited        integer NOT NULL DEFAULT 0,
    -- Questions refused because the site-wide daily limit was reached.
    capped              integer NOT NULL DEFAULT 0,
    CONSTRAINT v2_assistant_usage_days_counts_check CHECK (
        conversations >= 0 AND questions >= 0 AND answered >= 0 AND fallbacks >= 0
        AND handoffs >= 0 AND contact_offers >= 0 AND provider_calls >= 0
        AND provider_fallbacks >= 0 AND rate_limited >= 0 AND capped >= 0
    )
);
