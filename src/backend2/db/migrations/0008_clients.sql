-- Clients V2. See docs/v2/clients.md.
--
-- The owner's private directory of the people and companies they work with.
-- One row is one self-contained Client file: its own contact details and its
-- own notes, useful with no Lead, invoice or project behind it.
--
--   * `v2_clients` is the file. A Company keeps exactly one primary contact in
--     the same columns a Person uses, so changing the type later is an update
--     of one column and can never lose the person's details or notes.
--   * `v2_niches` is the owner's own list of niches — the kind of business a
--     Client or Lead is in: a salon, plumbers, roofers. Shared with Leads, so
--     one niche means the same thing on both sides. Optional on every record.
--   * `v2_client_lead_links` records which Lead became (or was linked to)
--     which Client when the Lead moved to `Won`. The Lead is the primary key:
--     a Lead links to one Client at most, so a retried or repeated `Won` finds
--     the row it already wrote and can neither create a second Client nor
--     append the same notes twice.
--
-- Nothing here points at Inbox, Booking, Services, Projects or Media. The
-- Leads table does not exist yet; the Leads migration adds the key from
-- `lead_id` to it. The Invoices migration will add its own key to
-- `v2_clients` with ON DELETE RESTRICT, which is what stops a Client with an
-- invoice from being deleted permanently.
--
-- Numbered 0008 because 0007 was the highest that existed when it was written.
--
-- Structure only. No rows: the V2 directory starts empty, and legacy clients
-- are not imported.


CREATE TABLE v2_niches (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    -- Lower-cased, so `Salon` and `salon` cannot become two niches.
    name_key    text GENERATED ALWAYS AS (lower(btrim(name))) STORED,
    -- Hidden from new choices. A record that already has it keeps it and
    -- still shows its name.
    hidden      boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_niches_name_check CHECK (btrim(name) <> ''),
    CONSTRAINT v2_niches_name_unique UNIQUE (name_key)
);

CREATE TABLE v2_clients (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind          text NOT NULL,
    -- The person: a Person's own name, or a Company's primary contact.
    name          text NOT NULL,
    email         text NOT NULL,
    -- Lower-cased, for matching and search. The address is shown as typed.
    email_key     text GENERATED ALWAYS AS (lower(email)) STORED,
    -- Optional. Empty rather than NULL, so a form round-trips it unchanged.
    phone         text NOT NULL DEFAULT '',
    -- The digits, with a leading `+` for an international number, so
    -- `+49 170 1234567` and `+491701234567` are the same phone for a warning.
    phone_key     text NOT NULL DEFAULT '',
    -- ISO 3166-1 alpha-2, from the shared list. Never a spelling.
    country_code  text NOT NULL,
    -- A Company's name, or a Person's optional company affiliation. A label
    -- in the directory, not a verified billing identity.
    company_name  text NOT NULL DEFAULT '',
    -- Optional. A niche in use cannot be deleted, only hidden or renamed.
    niche_id      uuid REFERENCES v2_niches (id) ON DELETE RESTRICT,
    -- Private, and the Client's own: after a Lead converts, editing either
    -- side's notes never reaches the other.
    notes         text NOT NULL DEFAULT '',
    status        text NOT NULL DEFAULT 'active',
    -- Set while the Client is in Trash. Restoring clears it. No expiry.
    trashed_at    timestamptz,
    -- Increments on every change to the file's contents. A save carrying an
    -- older number is refused rather than allowed to overwrite.
    revision      integer NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_clients_kind_check CHECK (kind IN ('person', 'company')),
    CONSTRAINT v2_clients_status_check CHECK (status IN ('active', 'inactive')),
    CONSTRAINT v2_clients_name_check CHECK (btrim(name) <> ''),
    CONSTRAINT v2_clients_email_check CHECK (btrim(email) <> ''),
    CONSTRAINT v2_clients_country_check CHECK (country_code ~ '^[A-Z]{2}$'),
    -- A Company is named. A Person may leave the affiliation empty.
    CONSTRAINT v2_clients_company_check CHECK (kind = 'person' OR btrim(company_name) <> ''),
    CONSTRAINT v2_clients_revision_check CHECK (revision > 0)
);

-- The duplicate warnings: same email, or same phone.
CREATE INDEX v2_clients_email_key_idx ON v2_clients (email_key);
CREATE INDEX v2_clients_phone_key_idx ON v2_clients (phone_key) WHERE phone_key <> '';
-- The directory and Trash, each in its own deterministic order.
CREATE INDEX v2_clients_directory_idx ON v2_clients (status, kind) WHERE trashed_at IS NULL;
CREATE INDEX v2_clients_niche_idx ON v2_clients (niche_id) WHERE niche_id IS NOT NULL;
CREATE INDEX v2_clients_trash_idx ON v2_clients (trashed_at DESC, id) WHERE trashed_at IS NOT NULL;

CREATE TABLE v2_client_lead_links (
    -- The Lead. Its key to the Leads table arrives with the Leads migration.
    lead_id          uuid PRIMARY KEY,
    -- Deleting a Client permanently removes the link, never the Lead.
    client_id        uuid NOT NULL REFERENCES v2_clients (id) ON DELETE CASCADE,
    -- `created`: this Lead made the Client. `linked`: the owner chose an
    -- existing Client instead, and the Lead's notes were appended to it once.
    how              text NOT NULL,
    linked_at        timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_client_lead_links_how_check CHECK (how IN ('created', 'linked'))
);

CREATE INDEX v2_client_lead_links_client_idx ON v2_client_lead_links (client_id, linked_at, lead_id);
