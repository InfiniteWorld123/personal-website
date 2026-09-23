-- Leads V2. See docs/v2/leads.md.
--
-- The owner's private list of people who may become clients. A Lead is only
-- ever created by the owner: by hand, or through a CSV import they review.
--
--   * `v2_lead_stages` holds the four permanent stages (`new`, `contacted`,
--     `won`, `lost`) and the owner's custom active stages. Only `contacted` and
--     custom stages have an order the owner sets; `new` is always first and
--     `won` then `lost` always last. Permanent stages cannot be renamed,
--     repurposed or deleted.
--   * `v2_lead_sources` and `v2_lead_loss_reasons` are owner-managed choices.
--     Each has one immutable system row — `Unknown` and `Other` — and a
--     hidden flag, so a choice taken out of new use keeps its meaning on old
--     Leads. A choice in use cannot be deleted (ON DELETE RESTRICT).
--   * `v2_leads` is the Lead file. A Lost Lead keeps its reason after it is
--     reopened, as history. Its niche comes from `v2_niches` (0008).
--   * `v2_lead_follow_ups`: at most one open follow-up per Lead (a partial
--     unique index), plus the closed ones as a short record.
--   * `v2_lead_imports` and `v2_lead_import_rejections`: one reviewed CSV
--     import, keyed by the browser's idempotency key so a retry returns the
--     first result instead of importing twice, and its rejected rows for the
--     downloadable report.
--
-- `v2_client_lead_links.lead_id` (0008) deliberately gets no key to
-- `v2_leads`: deleting a Lead permanently must not erase the Client's record
-- that it came from a Lead.
--
-- Numbered 0011: 0008 is Clients, 0009 Inbox and 0010 Booking.
--
-- Structure only. The default stages, sources and reasons are written by the
-- application the first time Leads is used, so a migration never carries rows.


CREATE TABLE v2_lead_stages (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind        text NOT NULL,
    name        text NOT NULL,
    name_key    text GENERATED ALWAYS AS (lower(btrim(name))) STORED,
    -- The order among active stages (`contacted` and custom). Unused for the
    -- others, whose place is fixed.
    position    integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_lead_stages_kind_check CHECK (kind IN ('new', 'contacted', 'won', 'lost', 'custom')),
    CONSTRAINT v2_lead_stages_name_check CHECK (btrim(name) <> ''),
    CONSTRAINT v2_lead_stages_name_unique UNIQUE (name_key)
);

-- One row per permanent stage, however often the defaults are written.
CREATE UNIQUE INDEX v2_lead_stages_permanent_idx ON v2_lead_stages (kind) WHERE kind <> 'custom';

CREATE TABLE v2_lead_sources (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    name_key    text GENERATED ALWAYS AS (lower(btrim(name))) STORED,
    hidden      boolean NOT NULL DEFAULT false,
    -- The one immutable `Unknown` choice.
    is_unknown  boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_lead_sources_name_check CHECK (btrim(name) <> ''),
    CONSTRAINT v2_lead_sources_name_unique UNIQUE (name_key)
);

CREATE UNIQUE INDEX v2_lead_sources_unknown_idx ON v2_lead_sources (is_unknown) WHERE is_unknown;

CREATE TABLE v2_lead_loss_reasons (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    name_key    text GENERATED ALWAYS AS (lower(btrim(name))) STORED,
    hidden      boolean NOT NULL DEFAULT false,
    -- The one immutable `Other` choice, which asks for a typed reason.
    is_other    boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_lead_loss_reasons_name_check CHECK (btrim(name) <> ''),
    CONSTRAINT v2_lead_loss_reasons_name_unique UNIQUE (name_key)
);

CREATE UNIQUE INDEX v2_lead_loss_reasons_other_idx ON v2_lead_loss_reasons (is_other) WHERE is_other;

-- Which defaults have been written, so a default the owner deleted is not
-- quietly written again.
CREATE TABLE v2_lead_defaults (
    name        text PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE v2_lead_imports (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Sent by the browser once per confirmed import. A retry with the same
    -- key returns this import instead of creating Leads again.
    idempotency_key uuid NOT NULL UNIQUE,
    file_name       text NOT NULL DEFAULT '',
    -- The file's header row, so the rejection report has the same columns.
    header          jsonb NOT NULL DEFAULT '[]'::jsonb,
    total_rows      integer NOT NULL,
    accepted_rows   integer NOT NULL,
    rejected_rows   integer NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_lead_imports_counts_check CHECK (
        total_rows >= 0 AND accepted_rows >= 0 AND rejected_rows >= 0
        AND accepted_rows + rejected_rows = total_rows
    )
);

CREATE TABLE v2_lead_import_rejections (
    import_id   uuid NOT NULL REFERENCES v2_lead_imports (id) ON DELETE CASCADE,
    -- The row's number in the file, counting the header as row 1.
    row_number  integer NOT NULL,
    reason      text NOT NULL,
    -- The row as it was in the file, for the downloadable report.
    cells       jsonb NOT NULL,
    PRIMARY KEY (import_id, row_number)
);

CREATE TABLE v2_leads (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text NOT NULL,
    email             text NOT NULL,
    email_key         text GENERATED ALWAYS AS (lower(email)) STORED,
    phone             text NOT NULL,
    -- Digits with a leading `+` for an international number (see Clients).
    phone_key         text NOT NULL,
    country_code      text NOT NULL,
    company           text NOT NULL DEFAULT '',
    notes             text NOT NULL DEFAULT '',
    source_id         uuid NOT NULL REFERENCES v2_lead_sources (id) ON DELETE RESTRICT,
    niche_id          uuid REFERENCES v2_niches (id) ON DELETE RESTRICT,
    stage_id          uuid NOT NULL REFERENCES v2_lead_stages (id) ON DELETE RESTRICT,
    stage_changed_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- The latest loss. Kept after the Lead is reopened, as history.
    lost_reason_id    uuid REFERENCES v2_lead_loss_reasons (id) ON DELETE RESTRICT,
    lost_reason_text  text NOT NULL DEFAULT '',
    lost_notes        text NOT NULL DEFAULT '',
    lost_at           timestamptz,
    won_at            timestamptz,
    import_id         uuid REFERENCES v2_lead_imports (id) ON DELETE SET NULL,
    trashed_at        timestamptz,
    revision          integer NOT NULL DEFAULT 1,
    created_at        timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_leads_name_check CHECK (btrim(name) <> ''),
    CONSTRAINT v2_leads_email_check CHECK (btrim(email) <> ''),
    CONSTRAINT v2_leads_phone_check CHECK (btrim(phone) <> ''),
    CONSTRAINT v2_leads_country_check CHECK (country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT v2_leads_revision_check CHECK (revision > 0)
);

CREATE INDEX v2_leads_list_idx ON v2_leads (created_at DESC, id) WHERE trashed_at IS NULL;
CREATE INDEX v2_leads_stage_idx ON v2_leads (stage_id, created_at DESC, id) WHERE trashed_at IS NULL;
CREATE INDEX v2_leads_trash_idx ON v2_leads (trashed_at DESC, id) WHERE trashed_at IS NOT NULL;
CREATE INDEX v2_leads_email_key_idx ON v2_leads (email_key);
CREATE INDEX v2_leads_phone_key_idx ON v2_leads (phone_key);
CREATE INDEX v2_leads_source_idx ON v2_leads (source_id);
CREATE INDEX v2_leads_niche_idx ON v2_leads (niche_id) WHERE niche_id IS NOT NULL;
CREATE INDEX v2_leads_lost_reason_idx ON v2_leads (lost_reason_id) WHERE lost_reason_id IS NOT NULL;

CREATE TABLE v2_lead_follow_ups (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id       uuid NOT NULL REFERENCES v2_leads (id) ON DELETE CASCADE,
    -- The moment it is due. Entered as a Europe/Berlin date and time.
    due_at        timestamptz NOT NULL,
    note          text NOT NULL DEFAULT '',
    status        text NOT NULL DEFAULT 'open',
    -- How a closed one ended: done by the owner, cancelled by the owner, or
    -- cancelled because the Lead was Lost or Won. Never shown as done work.
    closed_how    text,
    closed_at     timestamptz,
    created_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_lead_follow_ups_status_check CHECK (status IN ('open', 'done', 'cancelled')),
    CONSTRAINT v2_lead_follow_ups_closed_check CHECK (
        (status = 'open' AND closed_how IS NULL AND closed_at IS NULL)
        OR (status = 'done' AND closed_how = 'completed' AND closed_at IS NOT NULL)
        OR (status = 'cancelled' AND closed_how IN ('cancelled', 'lost', 'won') AND closed_at IS NOT NULL)
    )
);

-- One open follow-up per Lead, enforced where no race can get past it.
CREATE UNIQUE INDEX v2_lead_follow_ups_one_open_idx ON v2_lead_follow_ups (lead_id) WHERE status = 'open';
CREATE INDEX v2_lead_follow_ups_due_idx ON v2_lead_follow_ups (due_at, id) WHERE status = 'open';
CREATE INDEX v2_lead_follow_ups_lead_idx ON v2_lead_follow_ups (lead_id, created_at DESC);
