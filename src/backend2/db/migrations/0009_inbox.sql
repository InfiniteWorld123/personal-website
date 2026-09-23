-- The Inbox. See docs/v2/inbox.md.
--
-- One owner's mailbox for info@yamanwarda.de. It starts empty — no legacy
-- message is imported — and it creates no Lead and no Client: correspondence
-- never depends on those modules.
--
-- Numbered 0009 because 0008_clients.sql was already taken by the Clients
-- module when this file was written.

-- One conversation: a first email, in either direction, and every reply to it.
-- A second, separate email from the same person is a second conversation —
-- the legacy inbox grouped by person, and this one deliberately does not.
CREATE TABLE v2_inbox_conversations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject             text NOT NULL DEFAULT '',
    -- The one other person. The MVP writes to exactly one address.
    counterpart_email   text NOT NULL,
    counterpart_name    text NOT NULL DEFAULT '',
    -- How it began. `contact` and `booking` are written by those modules when
    -- they are connected; the Inbox itself writes `incoming` and `outgoing`.
    origin              text NOT NULL,
    -- The appointment or submission it belongs to, as text so a module that
    -- does not key on uuid can still take part. Never required.
    origin_ref          text,
    -- Answers a public form collected, e.g. Booking's optional subject and
    -- budget. Plain values, rendered as text.
    facts               jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- The secret half of `reply+<token>@`. Outgoing mail carries it as its
    -- Reply-To, and it is how an answer finds this conversation when the
    -- sender's mail client drops the threading headers.
    reply_token         text NOT NULL UNIQUE,
    folder              text NOT NULL DEFAULT 'inbox',
    -- Where Restore returns a conversation to: Trash remembers whether it was
    -- archived first.
    trashed_from        text,
    trashed_at          timestamptz,
    is_read             boolean NOT NULL DEFAULT true,
    is_starred          boolean NOT NULL DEFAULT false,
    message_count       integer NOT NULL DEFAULT 0,
    last_message_at     timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Sent lists conversations by the owner's latest message, not anyone's.
    last_outgoing_at    timestamptz,
    last_direction      text,
    -- A plain-text excerpt for the list, so the list never reads bodies.
    last_preview        text NOT NULL DEFAULT '',
    created_at          timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_inbox_conversations_origin_check
        CHECK (origin IN ('incoming', 'outgoing', 'contact', 'booking')),
    CONSTRAINT v2_inbox_conversations_folder_check
        CHECK (folder IN ('inbox', 'archived', 'trash')),
    CONSTRAINT v2_inbox_conversations_trashed_from_check
        CHECK (trashed_from IS NULL OR trashed_from IN ('inbox', 'archived')),
    -- In Trash exactly when it says when it got there.
    CONSTRAINT v2_inbox_conversations_trash_state_check
        CHECK ((folder = 'trash') = (trashed_at IS NOT NULL)),
    CONSTRAINT v2_inbox_conversations_direction_check
        CHECK (last_direction IS NULL OR last_direction IN ('incoming', 'outgoing')),
    CONSTRAINT v2_inbox_conversations_email_check CHECK (counterpart_email <> '')
);

-- Every folder list, newest first, with `id` breaking ties so a page boundary
-- never repeats or skips a conversation.
CREATE INDEX v2_inbox_conversations_folder_idx
    ON v2_inbox_conversations (folder, last_message_at DESC, id DESC);

CREATE INDEX v2_inbox_conversations_sent_idx
    ON v2_inbox_conversations (last_outgoing_at DESC, id DESC)
    WHERE last_outgoing_at IS NOT NULL;

CREATE INDEX v2_inbox_conversations_unread_idx
    ON v2_inbox_conversations (folder) WHERE is_read = false;

CREATE INDEX v2_inbox_conversations_origin_idx
    ON v2_inbox_conversations (origin, origin_ref) WHERE origin_ref IS NOT NULL;

-- One email. Immutable once written, except for an outgoing message's
-- delivery state.
CREATE TABLE v2_inbox_messages (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     uuid NOT NULL REFERENCES v2_inbox_conversations (id) ON DELETE CASCADE,
    direction           text NOT NULL,
    from_email          text NOT NULL,
    from_name           text NOT NULL DEFAULT '',
    to_email            text NOT NULL,
    to_name             text NOT NULL DEFAULT '',
    subject             text NOT NULL DEFAULT '',
    -- Always present: the plain-text version every mail client can read, and
    -- what search and the list excerpt use.
    body_text           text NOT NULL DEFAULT '',
    -- Outgoing only: the validated rich-text tree the owner wrote. Never HTML.
    body_doc            jsonb,
    -- Incoming only: the sender's HTML, stored as received and only ever
    -- served to the owner inside a sandbox that runs and fetches nothing.
    body_html           text,
    -- RFC 5322 Message-ID, angle brackets included. Outgoing mail gets one we
    -- generate, so a reply's In-Reply-To can find it.
    message_id_header   text,
    in_reply_to         text,
    references_header   text,
    occurred_at         timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Incoming only: what makes a second delivery of the same letter a no-op.
    -- The Message-ID when there is one, otherwise a hash of the letter.
    dedupe_key          text,
    -- Outgoing only. Accepted means the provider took it — not that anyone
    -- read it, or even that it arrived.
    delivery_status     text,
    delivery_provider   text,
    provider_message_id text,
    -- A short, safe reason for the owner. Never the provider's own body,
    -- which can quote the recipient back.
    failure_reason      text,
    send_attempts       integer NOT NULL DEFAULT 0,
    last_attempt_at     timestamptz,
    -- The draft this was sent from. Unique, so a second Send of the same
    -- draft finds this row instead of writing — and sending — a second one.
    source_draft_id     uuid UNIQUE,
    -- Outgoing attachments: a snapshot of the Media files it carried, for
    -- display. The use itself is recorded in v2_media_references.
    attachments         jsonb NOT NULL DEFAULT '[]'::jsonb,
    language            text,
    created_at          timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_inbox_messages_direction_check CHECK (direction IN ('incoming', 'outgoing')),
    CONSTRAINT v2_inbox_messages_status_check
        CHECK (
            (direction = 'incoming' AND delivery_status IS NULL)
            OR (direction = 'outgoing' AND delivery_status IN ('sending', 'accepted', 'failed'))
        ),
    CONSTRAINT v2_inbox_messages_provider_check
        CHECK (delivery_provider IS NULL OR delivery_provider IN ('resend', 'fake')),
    CONSTRAINT v2_inbox_messages_language_check
        CHECK (language IS NULL OR language IN ('de', 'en', 'ar'))
);

CREATE INDEX v2_inbox_messages_conversation_idx
    ON v2_inbox_messages (conversation_id, occurred_at DESC, id DESC);

-- Threading: an answer's In-Reply-To or References names one of these.
CREATE INDEX v2_inbox_messages_header_idx
    ON v2_inbox_messages (message_id_header) WHERE message_id_header IS NOT NULL;

-- The same letter delivered twice is written once.
CREATE UNIQUE INDEX v2_inbox_messages_dedupe_idx
    ON v2_inbox_messages (dedupe_key) WHERE dedupe_key IS NOT NULL;

-- A file that arrived with an email. Private, owned by the Inbox, and not in
-- the Media library unless the owner explicitly saves a copy there.
CREATE TABLE v2_inbox_attachments (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id           uuid NOT NULL REFERENCES v2_inbox_messages (id) ON DELETE CASCADE,
    position             integer NOT NULL DEFAULT 0,
    -- Sanitised for display and download. The sender chose it, so it is text,
    -- never a path.
    file_name            text NOT NULL,
    -- What the sender's mail client claimed, kept for the owner's information.
    declared_type        text NOT NULL DEFAULT '',
    -- What the bytes turned out to be, when the server could tell. NULL means
    -- unrecognised: still downloadable, never Save to Media.
    detected_type        text,
    byte_size            bigint NOT NULL DEFAULT 0,
    checksum             text,
    -- NULL when nothing was stored: a blocked or failed file keeps its row so
    -- the conversation can say what happened to it.
    storage_key          text UNIQUE,
    status               text NOT NULL,
    failure_reason       text,
    -- The owner's copy in Media, if they made one. Not a use of that file:
    -- deleting this conversation leaves the saved copy alone, and deleting the
    -- copy from Media is allowed.
    saved_media_asset_id uuid REFERENCES v2_media_assets (id) ON DELETE SET NULL,
    created_at           timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_inbox_attachments_status_check CHECK (status IN ('stored', 'blocked', 'failed')),
    CONSTRAINT v2_inbox_attachments_storage_check
        CHECK ((status = 'stored') = (storage_key IS NOT NULL))
);

CREATE INDEX v2_inbox_attachments_message_idx ON v2_inbox_attachments (message_id, position);

-- A message being written. Autosaved; never sent by being saved.
CREATE TABLE v2_inbox_drafts (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NULL for a new message; set for a reply.
    conversation_id      uuid REFERENCES v2_inbox_conversations (id) ON DELETE CASCADE,
    to_email             text NOT NULL DEFAULT '',
    subject              text NOT NULL DEFAULT '',
    body_doc             jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
    language             text NOT NULL DEFAULT 'en',
    attachment_asset_ids uuid[] NOT NULL DEFAULT '{}',
    -- Optimistic concurrency: an autosave from a stale tab is refused rather
    -- than silently overwriting newer text.
    revision             integer NOT NULL DEFAULT 1,
    created_at           timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_inbox_drafts_language_check CHECK (language IN ('de', 'en', 'ar'))
);

-- One reply draft per conversation, so reopening a conversation recovers it.
CREATE UNIQUE INDEX v2_inbox_drafts_reply_idx
    ON v2_inbox_drafts (conversation_id) WHERE conversation_id IS NOT NULL;

CREATE INDEX v2_inbox_drafts_updated_idx ON v2_inbox_drafts (updated_at DESC, id DESC);

-- A signature per language. Exactly three rows at most.
CREATE TABLE v2_inbox_signatures (
    language   text PRIMARY KEY,
    body       text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_inbox_signatures_language_check CHECK (language IN ('de', 'en', 'ar'))
);

-- Ready replies. Inserted into a draft visibly and editably; never sent alone.
CREATE TABLE v2_inbox_snippets (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title      text NOT NULL,
    language   text,
    body       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_inbox_snippets_title_check CHECK (btrim(title) <> ''),
    CONSTRAINT v2_inbox_snippets_language_check
        CHECK (language IS NULL OR language IN ('de', 'en', 'ar'))
);

CREATE INDEX v2_inbox_snippets_title_idx ON v2_inbox_snippets (lower(title), id);

-- The Inbox becomes a module that may hold a Media file in use: a draft or a
-- sent message that carries an attachment. The list is restated whole, so a
-- later migration extending it must keep 'inbox'.
ALTER TABLE v2_media_references DROP CONSTRAINT v2_media_references_module_check;
ALTER TABLE v2_media_references ADD CONSTRAINT v2_media_references_module_check
    CHECK (module IN ('projects', 'blog', 'services', 'invoices', 'content', 'inbox'));
