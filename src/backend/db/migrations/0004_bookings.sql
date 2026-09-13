-- Booking (B5), and the `leads` table a booking attaches to.
--
-- `leads` itself belongs to B4 and lands here because `data-model.md` is
-- explicit that a booking creates or attaches to a lead: there is one inbox,
-- not two. Only the table arrives now. The status pipeline in the admin, the
-- private notes, and the contact form writing to it are still B4's work.

CREATE TABLE leads (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Where this person came from. A booking and the contact form are two
    -- doors into the same list.
    source text NOT NULL,
    "name" text NOT NULL,
    email text NOT NULL,
    phone text,
    company text,
    -- Free text rather than a foreign key to `services`: that table does not
    -- exist yet, and the booking form asks in words, not in ids.
    service_interest text NOT NULL DEFAULT '',
    budget_band text NOT NULL DEFAULT '',
    timeline text NOT NULL DEFAULT '',
    message text NOT NULL DEFAULT '',
    -- Which language to write back in.
    "language" text NOT NULL DEFAULT 'de',
    status text NOT NULL DEFAULT 'NEW',
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT leads_source_check CHECK (source IN ('CONTACT_FORM', 'BOOKING', 'MANUAL')),
    CONSTRAINT leads_language_check CHECK ("language" IN ('de', 'en', 'ar')),
    CONSTRAINT leads_status_check
        CHECK (status IN ('NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST'))
);

-- The admin list is ordered by arrival and filtered by status.
CREATE INDEX leads_status_created_idx ON leads (status, created_at DESC);
-- A returning visitor is matched on their address, so the same person does not
-- become three rows.
CREATE INDEX leads_email_idx ON leads (lower(email));


-- The kinds of call that can be booked. A row, not an enum in code: adding a
-- ninety-minute workshop later has to be a record, not a migration.
CREATE TABLE booking_types (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Reaches the public URL as /booking/:slug, so its shape is enforced here,
    -- exactly as it is for posts and projects.
    slug text NOT NULL UNIQUE,
    duration_minutes smallint NOT NULL,
    -- Minutes held before and after the meeting that no other booking may
    -- touch. The visitor never sees them.
    buffer_before_minutes smallint NOT NULL DEFAULT 0,
    buffer_after_minutes smallint NOT NULL DEFAULT 0,
    -- How close to now a visitor may still book.
    minimum_notice_minutes integer NOT NULL DEFAULT 720,
    -- How far ahead the calendar opens.
    booking_window_days smallint NOT NULL DEFAULT 60,
    -- The grid slots are offered on: every 15 minutes, not every minute.
    slot_interval_minutes smallint NOT NULL DEFAULT 15,
    -- NULL means no daily cap.
    max_per_day smallint,
    location_kind text NOT NULL DEFAULT 'VIDEO',
    -- A fixed meeting link, a phone number, or an address. NULL until set.
    location_value text,
    -- Money as integer cents beside its own currency, the convention
    -- `data-model.md` fixes for the whole platform. Zero today because the
    -- calls are free; the column exists now so charging for a call later is a
    -- value, not a schema change.
    price_cents integer NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'EUR',
    is_active boolean NOT NULL DEFAULT true,
    sort_order smallint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT booking_types_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT booking_types_duration_check CHECK (duration_minutes BETWEEN 5 AND 480),
    CONSTRAINT booking_types_buffer_check
        CHECK (buffer_before_minutes BETWEEN 0 AND 240 AND buffer_after_minutes BETWEEN 0 AND 240),
    CONSTRAINT booking_types_notice_check CHECK (minimum_notice_minutes BETWEEN 0 AND 43200),
    CONSTRAINT booking_types_window_check CHECK (booking_window_days BETWEEN 1 AND 365),
    CONSTRAINT booking_types_interval_check CHECK (slot_interval_minutes BETWEEN 5 AND 120),
    CONSTRAINT booking_types_max_per_day_check CHECK (max_per_day IS NULL OR max_per_day > 0),
    CONSTRAINT booking_types_location_check
        CHECK (location_kind IN ('VIDEO', 'PHONE', 'IN_PERSON')),
    CONSTRAINT booking_types_price_check CHECK (price_cents >= 0)
);

-- The site is trilingual and the booking page is not an exception. Same shape
-- the tags use.
CREATE TABLE booking_type_translations (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_type_id uuid NOT NULL REFERENCES booking_types ("id") ON DELETE CASCADE,
    "language" text NOT NULL,
    "name" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    CONSTRAINT booking_type_translations_language_check
        CHECK ("language" IN ('de', 'en', 'ar')),
    CONSTRAINT booking_type_translations_unique UNIQUE (booking_type_id, "language")
);


-- The recurring weekly schedule.
--
-- The window is stored as minutes from midnight on the owner's wall clock, NOT
-- as an instant. "Every Monday at 09:00 in Berlin" is a rule about a clock
-- face, not about a point in time: stored as an instant it would silently move
-- by an hour twice a year, when Germany changes its clocks. Minutes plus the
-- IANA zone name is the only representation that survives that.
CREATE TABLE availability_rules (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NULL means the rule applies to every booking type. One default schedule
    -- today; a schedule per type later without touching this table.
    booking_type_id uuid REFERENCES booking_types ("id") ON DELETE CASCADE,
    -- 0 = Sunday, matching what EXTRACT(DOW) and Date#getUTCDay both return.
    weekday smallint NOT NULL,
    starts_at_minute smallint NOT NULL,
    ends_at_minute smallint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT availability_rules_weekday_check CHECK (weekday BETWEEN 0 AND 6),
    CONSTRAINT availability_rules_window_check
        CHECK (starts_at_minute >= 0 AND ends_at_minute <= 1440
               AND ends_at_minute > starts_at_minute)
);

CREATE INDEX availability_rules_weekday_idx ON availability_rules (weekday);


-- Departures from the weekly schedule, on one named date.
--
-- Applied in this order when slots are generated: the weekly rules first, then
-- every OPEN adds its window, then every BLOCK removes its window. A block
-- always wins, so a day off cannot be undone by a forgotten opening.
CREATE TABLE availability_exceptions (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_type_id uuid REFERENCES booking_types ("id") ON DELETE CASCADE,
    -- A calendar day on the owner's wall clock, for the same reason the rules
    -- hold minutes rather than instants.
    on_date date NOT NULL,
    kind text NOT NULL,
    -- NULL on a BLOCK means the whole day: a holiday.
    starts_at_minute smallint,
    ends_at_minute smallint,
    reason text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT availability_exceptions_kind_check CHECK (kind IN ('BLOCK', 'OPEN')),
    CONSTRAINT availability_exceptions_window_check CHECK (
        (kind = 'BLOCK' AND starts_at_minute IS NULL AND ends_at_minute IS NULL)
        OR (starts_at_minute IS NOT NULL AND ends_at_minute IS NOT NULL
            AND starts_at_minute >= 0 AND ends_at_minute <= 1440
            AND ends_at_minute > starts_at_minute)
    )
);

CREATE INDEX availability_exceptions_date_idx ON availability_exceptions (on_date);


CREATE TABLE bookings (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    -- RESTRICT, not CASCADE: removing a call type must never take the record
    -- of the calls that were held with it.
    booking_type_id uuid NOT NULL REFERENCES booking_types ("id") ON DELETE RESTRICT,
    lead_id uuid REFERENCES leads ("id") ON DELETE SET NULL,
    -- The short code the visitor sees and can quote in an email. Not the id.
    reference text NOT NULL UNIQUE,

    -- The meeting itself, buffers excluded. This is what both sides see and
    -- what the .ics carries.
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,

    -- Copied from the booking type at booking time rather than read back from
    -- it. Widening a buffer in the settings tomorrow must not retroactively
    -- change what an existing booking blocked — the same instinct that makes
    -- an issued invoice append-only.
    buffer_before_minutes smallint NOT NULL DEFAULT 0,
    buffer_after_minutes smallint NOT NULL DEFAULT 0,

    -- The meeting plus its buffers: the span nothing else may touch. Written
    -- by the service, because `timestamptz + interval` is only STABLE and so
    -- cannot appear in a generated column, while building a range from two
    -- instants is IMMUTABLE and can.
    blocked_starts_at timestamptz NOT NULL,
    blocked_ends_at timestamptz NOT NULL,
    blocked_slot tstzrange GENERATED ALWAYS AS
        (tstzrange(blocked_starts_at, blocked_ends_at, '[)')) STORED,

    visitor_name text NOT NULL,
    visitor_email text NOT NULL,
    visitor_phone text,
    -- An IANA zone name, never a numeric offset: an offset stops being true
    -- the next time that zone changes its clocks.
    visitor_timezone text NOT NULL,
    visitor_note text NOT NULL DEFAULT '',
    -- Which language this visitor is written to in.
    "language" text NOT NULL DEFAULT 'de',

    status text NOT NULL DEFAULT 'CONFIRMED',

    -- Only the fingerprint. The token itself is shown once, in the link that
    -- goes out by email, and is never stored anywhere.
    cancel_token_hash text NOT NULL,

    -- Rescheduling cancels the old row and writes a new one pointing back at
    -- it, so the history is a chain rather than an overwrite.
    rescheduled_from_id uuid REFERENCES bookings ("id") ON DELETE SET NULL,
    cancelled_at timestamptz,
    cancelled_by text,
    cancellation_reason text NOT NULL DEFAULT '',

    -- Snapshots, for the reason the buffers are snapshots.
    price_cents integer NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'EUR',
    location_kind text NOT NULL,
    location_value text,

    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT bookings_language_check CHECK ("language" IN ('de', 'en', 'ar')),
    CONSTRAINT bookings_status_check
        CHECK (status IN ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW')),
    CONSTRAINT bookings_cancelled_by_check
        CHECK (cancelled_by IS NULL OR cancelled_by IN ('VISITOR', 'ADMIN')),
    CONSTRAINT bookings_location_check
        CHECK (location_kind IN ('VIDEO', 'PHONE', 'IN_PERSON')),
    CONSTRAINT bookings_order_check CHECK (ends_at > starts_at),
    -- If the blocked span does not contain the meeting, the service computed
    -- it wrongly and the row is not allowed in.
    CONSTRAINT bookings_blocked_check
        CHECK (blocked_starts_at <= starts_at AND blocked_ends_at >= ends_at),

    -- The heart of the whole feature. Postgres itself refuses to hold two
    -- confirmed bookings whose blocked spans touch, so two visitors pressing
    -- the button in the same millisecond cannot both win: one insert succeeds
    -- and the other comes back as 23P01, which the service turns into a 409.
    -- No application lock, no SELECT FOR UPDATE, no retry dance.
    --
    -- Deliberately not scoped to a booking type: one person cannot be on two
    -- calls at once, whatever kind they are.
    CONSTRAINT bookings_no_overlap
        EXCLUDE USING gist (blocked_slot WITH &&) WHERE (status = 'CONFIRMED')
);

-- The cancel link looks a booking up by this hash, so it has to be indexed,
-- and no two bookings may share a token.
CREATE UNIQUE INDEX bookings_cancel_token_idx ON bookings (cancel_token_hash);
-- The admin list, and the slot generator reading the day's confirmed bookings.
CREATE INDEX bookings_status_starts_idx ON bookings (status, starts_at);
CREATE INDEX bookings_lead_idx ON bookings (lead_id) WHERE lead_id IS NOT NULL;
