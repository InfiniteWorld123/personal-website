-- Invoices V2. See docs/v2/invoices.md.
--
-- The owner's own invoicing: one-time invoices, installment plans on one
-- invoice, monthly/yearly subscriptions, payments, refunds and cancellation
-- documents. Test mode and live mode live side by side in the same tables and
-- never share a number, a report or an export.
--
--   * `v2_invoice_settings` is the seller: one row (id = 1), written by the
--     application the first time Invoices is used.
--   * `v2_invoice_number_counters` hands out gapless numbers per mode and
--     year. A number is taken only at issue, inside the issuing transaction,
--     with the counter row locked — a draft never consumes one.
--   * `v2_invoices` holds drafts, issued invoices and cancellation documents
--     (Storno). An issued row carries `snapshot`: the complete document as it
--     was issued — seller, recipient, lines, totals, language — and is never
--     rewritten. A mistake is answered by a linked cancellation, never by an
--     edit.
--   * Lines and installments belong to the draft; payments, refunds and
--     stored files belong to the issued invoice and are kept with RESTRICT.
--   * Subscriptions own their billing history in `v2_subscription_periods`,
--     whose primary key (subscription, period start) is what makes the
--     billing job idempotent: a period is decided exactly once.
--   * `v2_stripe_events` records each verified Stripe event id once, so a
--     redelivered webhook changes nothing.
--
-- Every invoice belongs to a Client, with ON DELETE RESTRICT — the key
-- `0008_clients.sql` said this migration would add.
--
-- Numbered 0012: 0011 is Leads (0013 is reserved for another module).
--
-- Structure only. The settings row is written by the application.


CREATE TABLE v2_invoice_settings (
    id                   smallint PRIMARY KEY DEFAULT 1,
    seller_name          text NOT NULL DEFAULT '',
    seller_address       text NOT NULL DEFAULT '',
    seller_country_code  text NOT NULL DEFAULT 'DE',
    seller_email         text NOT NULL DEFAULT '',
    seller_phone         text NOT NULL DEFAULT '',
    seller_website       text NOT NULL DEFAULT '',
    tax_number           text NOT NULL DEFAULT '',
    vat_id               text NOT NULL DEFAULT '',
    bank_holder          text NOT NULL DEFAULT '',
    bank_iban            text NOT NULL DEFAULT '',
    bank_bic             text NOT NULL DEFAULT '',
    bank_name            text NOT NULL DEFAULT '',
    -- Kleinunternehmer (§ 19 UStG) by default. Never switched automatically.
    tax_mode             text NOT NULL DEFAULT 'kleinunternehmer',
    default_tax_rate_bp  integer NOT NULL DEFAULT 1900,
    payment_terms_days   integer NOT NULL DEFAULT 14,
    default_language     text NOT NULL DEFAULT 'de',
    -- When set, every test-mode email draft is addressed here instead of to
    -- the client, so a TEST document cannot reach a real customer by habit.
    test_recipient_email text NOT NULL DEFAULT '',
    -- The Media folder generated PDFs go under ("Invoices"). Remembered by id,
    -- so the owner renaming or moving it changes nothing.
    media_folder_id      uuid REFERENCES v2_media_folders (id) ON DELETE SET NULL,
    revision             integer NOT NULL DEFAULT 1,
    updated_at           timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_invoice_settings_singleton CHECK (id = 1),
    CONSTRAINT v2_invoice_settings_tax_mode_check CHECK (tax_mode IN ('kleinunternehmer', 'standard')),
    CONSTRAINT v2_invoice_settings_rate_check CHECK (default_tax_rate_bp IN (0, 700, 1900)),
    CONSTRAINT v2_invoice_settings_terms_check CHECK (payment_terms_days BETWEEN 0 AND 365),
    CONSTRAINT v2_invoice_settings_language_check CHECK (default_language IN ('de', 'en')),
    CONSTRAINT v2_invoice_settings_country_check CHECK (seller_country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT v2_invoice_settings_revision_check CHECK (revision > 0)
);

CREATE TABLE v2_invoice_number_counters (
    mode         text NOT NULL,
    year         integer NOT NULL,
    last_number  integer NOT NULL DEFAULT 0,
    PRIMARY KEY (mode, year),
    CONSTRAINT v2_invoice_number_counters_mode_check CHECK (mode IN ('test', 'live')),
    CONSTRAINT v2_invoice_number_counters_year_check CHECK (year BETWEEN 2000 AND 2999),
    CONSTRAINT v2_invoice_number_counters_last_check CHECK (last_number >= 0)
);

-- Exchange rates used for EUR → USD price proposals, kept as an audit trail.
-- A proposal for customer pricing — not the rate for tax reporting.
CREATE TABLE v2_exchange_rates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency   text NOT NULL,
    quote_currency  text NOT NULL,
    -- `1 base = rate quote`, exactly as published or typed.
    rate            numeric(18, 6) NOT NULL,
    rate_date       date NOT NULL,
    source          text NOT NULL,
    fetched_at      timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_exchange_rates_pair_check CHECK (base_currency = 'EUR' AND quote_currency = 'USD'),
    CONSTRAINT v2_exchange_rates_rate_check CHECK (rate > 0),
    CONSTRAINT v2_exchange_rates_source_check CHECK (source IN ('ecb', 'manual'))
);

CREATE UNIQUE INDEX v2_exchange_rates_ecb_day_idx
    ON v2_exchange_rates (base_currency, quote_currency, rate_date) WHERE source = 'ecb';
CREATE INDEX v2_exchange_rates_recent_idx ON v2_exchange_rates (fetched_at DESC, id);

CREATE TABLE v2_subscriptions (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mode                      text NOT NULL,
    client_id                 uuid NOT NULL REFERENCES v2_clients (id) ON DELETE RESTRICT,
    status                    text NOT NULL DEFAULT 'active',
    collection                text NOT NULL,
    billing_interval          text NOT NULL,
    -- The first collection date. Its day of month is the anchor: 29/30/31
    -- fall back to a shorter month's last day, and return afterwards.
    start_date                date NOT NULL,
    -- The last day of service once ended. Periods starting after it are not
    -- billed.
    ends_on                   date,
    ended_at                  timestamptz,
    -- Set while paused: the first day no longer billed.
    paused_from               date,
    currency                  text NOT NULL,
    language                  text NOT NULL DEFAULT 'de',
    description               text NOT NULL,
    tax_rate_bp               integer,
    -- The Service the terms started from, copied once: {id, name, priceMinor}.
    service                   jsonb,
    fx                        jsonb,
    recipient                 jsonb NOT NULL DEFAULT '{}'::jsonb,
    payment_terms_days        integer NOT NULL DEFAULT 14,
    allow_bank                boolean NOT NULL DEFAULT true,
    allow_stripe              boolean NOT NULL DEFAULT false,
    -- The first period the billing job has not decided yet.
    next_period_index         integer NOT NULL DEFAULT 0,
    stripe_customer_id        text,
    stripe_payment_method_id  text,
    card_status               text NOT NULL DEFAULT 'none',
    card_label                text NOT NULL DEFAULT '',
    card_consent_at           timestamptz,
    revision                  integer NOT NULL DEFAULT 1,
    created_at                timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_subscriptions_mode_check CHECK (mode IN ('test', 'live')),
    CONSTRAINT v2_subscriptions_status_check CHECK (status IN ('active', 'paused', 'ended')),
    CONSTRAINT v2_subscriptions_collection_check CHECK (collection IN ('manual', 'automatic_card')),
    CONSTRAINT v2_subscriptions_interval_check CHECK (billing_interval IN ('monthly', 'yearly')),
    CONSTRAINT v2_subscriptions_currency_check CHECK (currency IN ('EUR', 'USD')),
    CONSTRAINT v2_subscriptions_language_check CHECK (language IN ('de', 'en')),
    CONSTRAINT v2_subscriptions_rate_check CHECK (tax_rate_bp IS NULL OR tax_rate_bp IN (0, 700, 1900)),
    CONSTRAINT v2_subscriptions_card_check CHECK (card_status IN ('none', 'pending', 'valid', 'invalid')),
    CONSTRAINT v2_subscriptions_description_check CHECK (btrim(description) <> ''),
    CONSTRAINT v2_subscriptions_paused_check CHECK ((status = 'paused') = (paused_from IS NOT NULL)),
    CONSTRAINT v2_subscriptions_ended_check CHECK (status <> 'ended' OR ends_on IS NOT NULL),
    CONSTRAINT v2_subscriptions_cursor_check CHECK (next_period_index >= 0),
    CONSTRAINT v2_subscriptions_revision_check CHECK (revision > 0)
);

CREATE INDEX v2_subscriptions_list_idx ON v2_subscriptions (created_at DESC, id);
CREATE INDEX v2_subscriptions_client_idx ON v2_subscriptions (client_id);
CREATE INDEX v2_subscriptions_due_idx ON v2_subscriptions (status) WHERE status <> 'ended';

-- The agreed price, by the period it starts applying to. A change is a new
-- row from the next unbilled period; earlier periods keep theirs.
CREATE TABLE v2_subscription_terms (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id  uuid NOT NULL REFERENCES v2_subscriptions (id) ON DELETE CASCADE,
    effective_from   date NOT NULL,
    amount_minor     bigint NOT NULL,
    fx               jsonb,
    note             text NOT NULL DEFAULT '',
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_subscription_terms_amount_check CHECK (amount_minor > 0),
    CONSTRAINT v2_subscription_terms_unique UNIQUE (subscription_id, effective_from)
);

CREATE TABLE v2_subscription_discounts (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id  uuid NOT NULL REFERENCES v2_subscriptions (id) ON DELETE CASCADE,
    discount_type    text NOT NULL,
    -- Basis points for a percentage, minor units for a fixed amount.
    value            bigint NOT NULL,
    starts_on        date NOT NULL,
    -- How many invoiced periods it applies to; NULL = indefinitely.
    periods          integer,
    applied_count    integer NOT NULL DEFAULT 0,
    ended_at         timestamptz,
    note             text NOT NULL DEFAULT '',
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_subscription_discounts_type_check CHECK (discount_type IN ('percent', 'fixed')),
    CONSTRAINT v2_subscription_discounts_value_check CHECK (
        value > 0 AND (discount_type <> 'percent' OR value <= 10000)
    ),
    CONSTRAINT v2_subscription_discounts_periods_check CHECK (periods IS NULL OR periods > 0),
    CONSTRAINT v2_subscription_discounts_applied_check CHECK (
        applied_count >= 0 AND (periods IS NULL OR applied_count <= periods)
    )
);

CREATE INDEX v2_subscription_discounts_sub_idx ON v2_subscription_discounts (subscription_id, starts_on, id);

CREATE TABLE v2_subscription_free_periods (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id  uuid NOT NULL REFERENCES v2_subscriptions (id) ON DELETE CASCADE,
    starts_on        date NOT NULL,
    -- NULL = free indefinitely.
    ends_on          date,
    note             text NOT NULL DEFAULT '',
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_subscription_free_periods_range_check CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX v2_subscription_free_periods_sub_idx ON v2_subscription_free_periods (subscription_id, starts_on);

CREATE TABLE v2_subscription_pauses (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id  uuid NOT NULL REFERENCES v2_subscriptions (id) ON DELETE CASCADE,
    starts_on        date NOT NULL,
    -- The resume date (billed again from here); NULL while still paused.
    ends_on          date,
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_subscription_pauses_range_check CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE UNIQUE INDEX v2_subscription_pauses_open_idx ON v2_subscription_pauses (subscription_id) WHERE ends_on IS NULL;

CREATE TABLE v2_invoices (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mode                        text NOT NULL,
    kind                        text NOT NULL DEFAULT 'invoice',
    status                      text NOT NULL DEFAULT 'draft',
    client_id                   uuid NOT NULL REFERENCES v2_clients (id) ON DELETE RESTRICT,
    -- `2026-0001`, or `TEST-2026-0001` in test mode. NULL until issued.
    number                      text UNIQUE,
    number_year                 integer,
    number_seq                  integer,
    currency                    text NOT NULL DEFAULT 'EUR',
    language                    text NOT NULL DEFAULT 'de',
    title                       text NOT NULL DEFAULT '',
    recipient_name              text NOT NULL DEFAULT '',
    recipient_company           text NOT NULL DEFAULT '',
    recipient_address           text NOT NULL DEFAULT '',
    recipient_country_code      text NOT NULL DEFAULT '',
    recipient_email             text NOT NULL DEFAULT '',
    recipient_vat_id            text NOT NULL DEFAULT '',
    service_date_from           date,
    service_date_to             date,
    payment_terms_days          integer NOT NULL DEFAULT 14,
    issue_date                  date,
    due_date                    date,
    discount_type               text NOT NULL DEFAULT 'none',
    discount_value              bigint NOT NULL DEFAULT 0,
    tax_mode                    text NOT NULL DEFAULT 'kleinunternehmer',
    reverse_charge              boolean NOT NULL DEFAULT false,
    allow_bank                  boolean NOT NULL DEFAULT true,
    allow_stripe                boolean NOT NULL DEFAULT false,
    notes                       text NOT NULL DEFAULT '',
    internal_note               text NOT NULL DEFAULT '',
    fx                          jsonb,
    -- Recomputed on every draft save; frozen at issue. Negative only on a
    -- cancellation document, which reverses its invoice.
    subtotal_minor              bigint NOT NULL DEFAULT 0,
    discount_minor              bigint NOT NULL DEFAULT 0,
    net_minor                   bigint NOT NULL DEFAULT 0,
    tax_minor                   bigint NOT NULL DEFAULT 0,
    total_minor                 bigint NOT NULL DEFAULT 0,
    -- Kept in step with the payment and refund rows, under the invoice lock.
    paid_minor                  bigint NOT NULL DEFAULT 0,
    refunded_minor              bigint NOT NULL DEFAULT 0,
    -- The issued document. Written once, never updated.
    snapshot                    jsonb,
    cancels_invoice_id          uuid UNIQUE REFERENCES v2_invoices (id) ON DELETE RESTRICT,
    replaces_invoice_id         uuid REFERENCES v2_invoices (id) ON DELETE RESTRICT,
    subscription_id             uuid REFERENCES v2_subscriptions (id) ON DELETE RESTRICT,
    period_start                date,
    period_end                  date,
    stripe_checkout_session_id  text,
    stripe_checkout_url         text,
    stripe_checkout_expires_at  timestamptz,
    -- An automatic card charge failed and has not yet succeeded.
    collection_failed_at        timestamptz,
    inbox_draft_id              uuid,
    sent_at                     timestamptz,
    issued_at                   timestamptz,
    cancelled_at                timestamptz,
    cancel_reason               text NOT NULL DEFAULT '',
    revision                    integer NOT NULL DEFAULT 1,
    created_at                  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_invoices_mode_check CHECK (mode IN ('test', 'live')),
    CONSTRAINT v2_invoices_kind_check CHECK (kind IN ('invoice', 'cancellation')),
    CONSTRAINT v2_invoices_status_check CHECK (status IN ('draft', 'issued', 'cancelled')),
    CONSTRAINT v2_invoices_currency_check CHECK (currency IN ('EUR', 'USD')),
    CONSTRAINT v2_invoices_language_check CHECK (language IN ('de', 'en')),
    CONSTRAINT v2_invoices_discount_check CHECK (
        discount_type IN ('none', 'percent', 'fixed') AND discount_value >= 0
        AND (discount_type <> 'percent' OR discount_value <= 10000)
    ),
    CONSTRAINT v2_invoices_tax_mode_check CHECK (tax_mode IN ('kleinunternehmer', 'standard')),
    CONSTRAINT v2_invoices_terms_check CHECK (payment_terms_days BETWEEN 0 AND 365),
    CONSTRAINT v2_invoices_service_dates_check CHECK (
        service_date_to IS NULL OR service_date_from IS NULL OR service_date_to >= service_date_from
    ),
    -- A draft has no number and no document; anything issued has both.
    CONSTRAINT v2_invoices_issued_check CHECK (
        (status = 'draft' AND number IS NULL AND snapshot IS NULL AND issue_date IS NULL)
        OR (status <> 'draft' AND number IS NOT NULL AND snapshot IS NOT NULL
            AND issue_date IS NOT NULL AND number_year IS NOT NULL AND number_seq IS NOT NULL)
    ),
    CONSTRAINT v2_invoices_cancellation_check CHECK (
        (kind = 'invoice' AND cancels_invoice_id IS NULL AND total_minor >= 0)
        OR (kind = 'cancellation' AND cancels_invoice_id IS NOT NULL AND status = 'issued' AND total_minor <= 0)
    ),
    CONSTRAINT v2_invoices_money_check CHECK (paid_minor >= 0 AND refunded_minor >= 0),
    CONSTRAINT v2_invoices_period_check CHECK (
        (period_start IS NULL) = (period_end IS NULL) AND (period_start IS NULL OR subscription_id IS NOT NULL)
    ),
    CONSTRAINT v2_invoices_revision_check CHECK (revision > 0)
);

-- Gapless per mode and year: two documents can never share a sequence number.
CREATE UNIQUE INDEX v2_invoices_sequence_idx ON v2_invoices (mode, number_year, number_seq)
    WHERE number_seq IS NOT NULL;

-- One authoritative invoice per billed subscription period. A correction
-- (which replaces a cancelled one) is the only other invoice allowed.
CREATE UNIQUE INDEX v2_invoices_subscription_period_idx ON v2_invoices (subscription_id, period_start)
    WHERE kind = 'invoice' AND replaces_invoice_id IS NULL AND subscription_id IS NOT NULL;

CREATE INDEX v2_invoices_list_idx ON v2_invoices (created_at DESC, id);
CREATE INDEX v2_invoices_client_idx ON v2_invoices (client_id);
CREATE INDEX v2_invoices_issue_idx ON v2_invoices (mode, issue_date) WHERE status <> 'draft';

CREATE TABLE v2_invoice_lines (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id            uuid NOT NULL REFERENCES v2_invoices (id) ON DELETE CASCADE,
    position              integer NOT NULL,
    description           text NOT NULL DEFAULT '',
    unit                  text NOT NULL DEFAULT '',
    quantity_milli        bigint NOT NULL DEFAULT 1000,
    unit_price_minor      bigint NOT NULL DEFAULT 0,
    tax_rate_bp           integer,
    -- A Service the line started from, copied once. No key: a later edit
    -- or deletion in Services never reaches an invoice.
    service_id            uuid,
    service_name          text,
    service_price_minor   bigint,
    CONSTRAINT v2_invoice_lines_position_unique UNIQUE (invoice_id, position),
    CONSTRAINT v2_invoice_lines_quantity_check CHECK (quantity_milli >= 0),
    CONSTRAINT v2_invoice_lines_price_check CHECK (unit_price_minor >= 0),
    CONSTRAINT v2_invoice_lines_rate_check CHECK (tax_rate_bp IS NULL OR tax_rate_bp IN (0, 700, 1900))
);

CREATE TABLE v2_invoice_installments (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id    uuid NOT NULL REFERENCES v2_invoices (id) ON DELETE CASCADE,
    position      integer NOT NULL,
    due_date      date NOT NULL,
    amount_minor  bigint NOT NULL,
    label         text NOT NULL DEFAULT '',
    CONSTRAINT v2_invoice_installments_position_unique UNIQUE (invoice_id, position),
    CONSTRAINT v2_invoice_installments_amount_check CHECK (amount_minor >= 0)
);

CREATE TABLE v2_invoice_payments (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id                uuid NOT NULL REFERENCES v2_invoices (id) ON DELETE RESTRICT,
    method                    text NOT NULL,
    amount_minor              bigint NOT NULL,
    currency                  text NOT NULL,
    paid_on                   date NOT NULL,
    reference                 text NOT NULL DEFAULT '',
    note                      text NOT NULL DEFAULT '',
    -- The browser's key for a manual entry: a retried request records once.
    idempotency_key           uuid UNIQUE,
    stripe_event_id           text UNIQUE,
    stripe_payment_intent_id  text UNIQUE,
    voided_at                 timestamptz,
    void_reason               text NOT NULL DEFAULT '',
    created_at                timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_invoice_payments_method_check CHECK (method IN ('bank', 'stripe', 'cash', 'other')),
    CONSTRAINT v2_invoice_payments_amount_check CHECK (amount_minor > 0),
    CONSTRAINT v2_invoice_payments_currency_check CHECK (currency IN ('EUR', 'USD')),
    -- A card payment exists only because Stripe confirmed it.
    CONSTRAINT v2_invoice_payments_stripe_check CHECK (
        (method = 'stripe') = (stripe_payment_intent_id IS NOT NULL)
    ),
    CONSTRAINT v2_invoice_payments_void_check CHECK (voided_at IS NULL OR btrim(void_reason) <> '')
);

CREATE INDEX v2_invoice_payments_invoice_idx ON v2_invoice_payments (invoice_id, paid_on, created_at, id);
CREATE INDEX v2_invoice_payments_date_idx ON v2_invoice_payments (paid_on DESC, created_at DESC, id);

CREATE TABLE v2_invoice_refunds (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id       uuid NOT NULL REFERENCES v2_invoices (id) ON DELETE RESTRICT,
    method           text NOT NULL,
    amount_minor     bigint NOT NULL,
    currency         text NOT NULL,
    refunded_on      date NOT NULL,
    note             text NOT NULL DEFAULT '',
    idempotency_key  uuid UNIQUE,
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_invoice_refunds_method_check CHECK (method IN ('bank', 'stripe', 'cash', 'other')),
    CONSTRAINT v2_invoice_refunds_amount_check CHECK (amount_minor > 0),
    CONSTRAINT v2_invoice_refunds_currency_check CHECK (currency IN ('EUR', 'USD'))
);

CREATE INDEX v2_invoice_refunds_invoice_idx ON v2_invoice_refunds (invoice_id, refunded_on, created_at, id);

-- Generated PDFs, kept privately in Media. RESTRICT on the asset as well as
-- the Media reference row: a retained invoice file cannot be deleted like an
-- ordinary unused asset.
CREATE TABLE v2_invoice_files (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id  uuid NOT NULL REFERENCES v2_invoices (id) ON DELETE RESTRICT,
    kind        text NOT NULL,
    language    text NOT NULL,
    payment_id  uuid REFERENCES v2_invoice_payments (id) ON DELETE RESTRICT,
    asset_id    uuid NOT NULL REFERENCES v2_media_assets (id) ON DELETE RESTRICT,
    created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_invoice_files_kind_check CHECK (kind IN ('document', 'receipt')),
    CONSTRAINT v2_invoice_files_language_check CHECK (language IN ('de', 'en')),
    CONSTRAINT v2_invoice_files_payment_check CHECK ((kind = 'receipt') = (payment_id IS NOT NULL))
);

CREATE UNIQUE INDEX v2_invoice_files_document_idx ON v2_invoice_files (invoice_id, language) WHERE kind = 'document';
CREATE UNIQUE INDEX v2_invoice_files_receipt_idx ON v2_invoice_files (payment_id, language) WHERE kind = 'receipt';
CREATE INDEX v2_invoice_files_asset_idx ON v2_invoice_files (asset_id);

-- The decided periods of every subscription: the billing job's ledger.
CREATE TABLE v2_subscription_periods (
    subscription_id  uuid NOT NULL REFERENCES v2_subscriptions (id) ON DELETE RESTRICT,
    period_index     integer NOT NULL,
    period_start     date NOT NULL,
    period_end       date NOT NULL,
    outcome          text NOT NULL,
    -- NULL when the owner later deleted the prepared draft on purpose.
    invoice_id       uuid REFERENCES v2_invoices (id) ON DELETE SET NULL,
    amount_minor     bigint NOT NULL DEFAULT 0,
    discount_minor   bigint NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (subscription_id, period_start),
    CONSTRAINT v2_subscription_periods_index_unique UNIQUE (subscription_id, period_index),
    CONSTRAINT v2_subscription_periods_outcome_check CHECK (outcome IN ('invoiced', 'free', 'paused', 'after_end'))
);

CREATE TABLE v2_subscription_charges (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id           uuid NOT NULL REFERENCES v2_subscriptions (id) ON DELETE RESTRICT,
    invoice_id                uuid NOT NULL REFERENCES v2_invoices (id) ON DELETE RESTRICT,
    -- 1 = the scheduled charge, 2 and 3 = the two permitted retries.
    attempt                   smallint NOT NULL,
    status                    text NOT NULL DEFAULT 'scheduled',
    scheduled_on              date NOT NULL,
    attempted_at              timestamptz,
    stripe_payment_intent_id  text UNIQUE,
    failure_message           text NOT NULL DEFAULT '',
    created_at                timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_subscription_charges_attempt_check CHECK (attempt BETWEEN 1 AND 3),
    CONSTRAINT v2_subscription_charges_status_check CHECK (
        status IN ('scheduled', 'processing', 'succeeded', 'failed', 'waiting_for_card', 'cancelled')
    ),
    CONSTRAINT v2_subscription_charges_attempt_unique UNIQUE (invoice_id, attempt)
);

CREATE INDEX v2_subscription_charges_due_idx ON v2_subscription_charges (scheduled_on, id)
    WHERE status IN ('scheduled', 'waiting_for_card');

-- Reminders and notices the billing job prepares. `dedupe_key` makes each
-- one happen once, however often the job runs.
CREATE TABLE v2_invoice_notices (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id       uuid REFERENCES v2_invoices (id) ON DELETE CASCADE,
    subscription_id  uuid REFERENCES v2_subscriptions (id) ON DELETE CASCADE,
    kind             text NOT NULL,
    audience         text NOT NULL,
    due_on           date NOT NULL,
    status           text NOT NULL DEFAULT 'pending',
    message          text NOT NULL DEFAULT '',
    inbox_draft_id   uuid,
    prepared_at      timestamptz,
    dedupe_key       text NOT NULL UNIQUE,
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_invoice_notices_audience_check CHECK (audience IN ('owner', 'customer')),
    CONSTRAINT v2_invoice_notices_status_check CHECK (status IN ('pending', 'prepared', 'cancelled'))
);

CREATE INDEX v2_invoice_notices_due_idx ON v2_invoice_notices (due_on, id) WHERE status = 'pending';
CREATE INDEX v2_invoice_notices_list_idx ON v2_invoice_notices (created_at DESC, id);

-- What happened to an invoice or subscription, for the owner's history.
CREATE TABLE v2_invoice_events (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id       uuid REFERENCES v2_invoices (id) ON DELETE CASCADE,
    subscription_id  uuid REFERENCES v2_subscriptions (id) ON DELETE CASCADE,
    kind             text NOT NULL,
    detail           jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX v2_invoice_events_invoice_idx ON v2_invoice_events (invoice_id, created_at, id);
CREATE INDEX v2_invoice_events_subscription_idx ON v2_invoice_events (subscription_id, created_at, id);

-- Each verified Stripe event, once.
CREATE TABLE v2_stripe_events (
    id           text PRIMARY KEY,
    type         text NOT NULL,
    livemode     boolean NOT NULL,
    outcome      text NOT NULL DEFAULT '',
    received_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
