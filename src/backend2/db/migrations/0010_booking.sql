-- Booking and video calls. See docs/v2/booking.md.
--
-- One owner's calendar. Visitors book without an account; a free slot is
-- confirmed at once. Every confirmed appointment has one Inbox conversation,
-- where its emails go and the visitor's answers come back. Nothing here
-- creates a Lead or a Client.
--
-- All instants are timestamptz. The owner's schedule is kept in local
-- Europe/Berlin minutes and converted by the application, which is what keeps
-- "9:00 every Monday" meaning 9:00 on both sides of a clock change.

-- The business settings. At most one row; until the owner first saves, the
-- application reads the agreed defaults below. A migration builds structure
-- only, so no row is inserted here.
CREATE TABLE v2_booking_settings (
    id                     integer PRIMARY KEY DEFAULT 1,
    -- Visitors only; the owner may book one minute ahead.
    min_notice_minutes     integer NOT NULL DEFAULT 1440,
    window_days            integer NOT NULL DEFAULT 60,
    -- Visitors may cancel or reschedule until this many hours before.
    change_limit_hours     integer NOT NULL DEFAULT 12,
    reminder_minutes       integer NOT NULL DEFAULT 1440,
    updated_at             timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_booking_settings_single CHECK (id = 1),
    CONSTRAINT v2_booking_settings_notice CHECK (min_notice_minutes BETWEEN 0 AND 43200),
    CONSTRAINT v2_booking_settings_window CHECK (window_days BETWEEN 1 AND 365),
    CONSTRAINT v2_booking_settings_change CHECK (change_limit_hours BETWEEN 0 AND 168),
    CONSTRAINT v2_booking_settings_reminder CHECK (reminder_minutes BETWEEN 60 AND 20160)
);

-- A kind of appointment the owner offers: "Intro call, 30 minutes".
CREATE TABLE v2_booking_types (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug              text NOT NULL,
    position          integer NOT NULL,
    enabled           boolean NOT NULL DEFAULT false,
    duration_minutes  integer NOT NULL DEFAULT 30,
    buffer_minutes    integer NOT NULL DEFAULT 0,
    -- Offered start times are this many minutes apart, from the start of
    -- each block of hours.
    slot_step_minutes integer NOT NULL DEFAULT 30,
    -- Which of video, in_person and phone this type allows.
    methods           text[] NOT NULL DEFAULT ARRAY['video']::text[],
    -- { "de": { "name": "", "description": "" }, "en": {...}, "ar": {...} }
    texts             jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_booking_types_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80),
    CONSTRAINT v2_booking_types_duration CHECK (duration_minutes BETWEEN 5 AND 480),
    CONSTRAINT v2_booking_types_buffer CHECK (buffer_minutes BETWEEN 0 AND 240),
    CONSTRAINT v2_booking_types_step CHECK (slot_step_minutes BETWEEN 5 AND 240),
    CONSTRAINT v2_booking_types_methods CHECK (
        cardinality(methods) BETWEEN 1 AND 3
        AND methods <@ ARRAY['video', 'in_person', 'phone']::text[]
    )
);

CREATE UNIQUE INDEX v2_booking_types_slug_idx ON v2_booking_types (slug);
CREATE INDEX v2_booking_types_position_idx ON v2_booking_types (position, id);

-- Weekly opening hours in Berlin local minutes after midnight. A day may have
-- several ranges; a day with none is closed.
CREATE TABLE v2_booking_weekly_hours (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- ISO weekday: 1 = Monday … 7 = Sunday.
    weekday      integer NOT NULL,
    start_minute integer NOT NULL,
    end_minute   integer NOT NULL,
    CONSTRAINT v2_booking_weekly_hours_day CHECK (weekday BETWEEN 1 AND 7),
    CONSTRAINT v2_booking_weekly_hours_range CHECK (start_minute >= 0 AND end_minute <= 1440 AND start_minute < end_minute)
);

CREATE INDEX v2_booking_weekly_hours_day_idx ON v2_booking_weekly_hours (weekday, start_minute);

-- A date that differs from the week: closed, or open at other hours.
CREATE TABLE v2_booking_exceptions (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    on_date    date NOT NULL UNIQUE,
    -- Empty means closed all day.
    ranges     jsonb NOT NULL DEFAULT '[]'::jsonb,
    note       text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One appointment.
CREATE TABLE v2_booking_appointments (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Shown to the visitor and in emails. Identifies; never authorises.
    reference              text NOT NULL UNIQUE,
    -- SHA-256 of the private manage credential. The credential itself is
    -- only ever in the visitor's email and on their success page.
    manage_token_hash      text NOT NULL UNIQUE,
    -- The credential is re-derived from this with the server secret whenever
    -- a later email needs the link again. The database alone cannot produce
    -- a working link.
    manage_nonce           text NOT NULL UNIQUE,
    type_id                uuid REFERENCES v2_booking_types (id) ON DELETE SET NULL,
    -- A snapshot of the type as it was booked, so editing or deleting the
    -- type later never rewrites an existing appointment.
    type_name              text NOT NULL,
    duration_minutes       integer NOT NULL,
    buffer_minutes         integer NOT NULL DEFAULT 0,
    method                 text NOT NULL,
    starts_at              timestamptz NOT NULL,
    ends_at                timestamptz NOT NULL,
    -- The time this appointment keeps from anyone else: itself and its buffer.
    blocked                tstzrange NOT NULL,
    status                 text NOT NULL DEFAULT 'confirmed',
    source                 text NOT NULL,
    outside_hours          boolean NOT NULL DEFAULT false,
    visitor_name           text NOT NULL,
    visitor_email          text NOT NULL,
    visitor_phone          text,
    company                text NOT NULL DEFAULT '',
    subject_choice         text,
    budget_choice          text,
    note                   text NOT NULL DEFAULT '',
    language               text NOT NULL,
    -- The visitor's device time zone, so their emails name the time they saw.
    visitor_timezone       text NOT NULL DEFAULT 'Europe/Berlin',
    -- A public form's own id for one submission: pressing Book twice, or a
    -- network retry, finds this appointment instead of making a second.
    submission_id          uuid UNIQUE,
    inbox_conversation_id  uuid REFERENCES v2_inbox_conversations (id) ON DELETE SET NULL,
    invitation_sent_at     timestamptz,
    reminder_due_at        timestamptz,
    reminder_state         text NOT NULL DEFAULT 'pending',
    reminder_sent_at       timestamptz,
    cancelled_at           timestamptz,
    cancelled_by           text,
    cancel_reason_code     text,
    cancel_reason_text     text,
    video_meeting_id       text,
    video_host_participant text,
    video_guest_participant text,
    video_ended_at         timestamptz,
    revision               integer NOT NULL DEFAULT 1,
    created_at             timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_booking_appointments_method CHECK (method IN ('video', 'in_person', 'phone')),
    CONSTRAINT v2_booking_appointments_status CHECK (status IN ('confirmed', 'completed', 'cancelled', 'no_show')),
    CONSTRAINT v2_booking_appointments_source CHECK (source IN ('public', 'manual')),
    CONSTRAINT v2_booking_appointments_language CHECK (language IN ('de', 'en', 'ar')),
    CONSTRAINT v2_booking_appointments_times CHECK (ends_at > starts_at),
    CONSTRAINT v2_booking_appointments_phone CHECK (method <> 'phone' OR (visitor_phone IS NOT NULL AND visitor_phone <> '')),
    CONSTRAINT v2_booking_appointments_reminder CHECK (reminder_state IN ('pending', 'sent', 'skipped', 'failed', 'cancelled')),
    CONSTRAINT v2_booking_appointments_cancelled CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
    CONSTRAINT v2_booking_appointments_cancelled_by CHECK (cancelled_by IS NULL OR cancelled_by IN ('visitor', 'owner')),
    -- The whole double-booking rule, in the database: two confirmed
    -- appointments can never hold overlapping time, however many requests
    -- arrive at once. The service checks first to explain; this is what holds.
    CONSTRAINT v2_booking_appointments_no_overlap
        EXCLUDE USING gist (blocked WITH &&) WHERE (status = 'confirmed')
);

CREATE INDEX v2_booking_appointments_start_idx ON v2_booking_appointments (starts_at, id);
CREATE INDEX v2_booking_appointments_status_idx ON v2_booking_appointments (status, starts_at);
CREATE INDEX v2_booking_appointments_reminder_idx
    ON v2_booking_appointments (reminder_due_at) WHERE reminder_state = 'pending';

-- What happened to an appointment, in order. The owner reads it; nothing
-- here is shown to a visitor.
CREATE TABLE v2_booking_history (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id uuid NOT NULL REFERENCES v2_booking_appointments (id) ON DELETE CASCADE,
    at             timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor          text NOT NULL,
    kind           text NOT NULL,
    details        jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT v2_booking_history_actor CHECK (actor IN ('visitor', 'owner', 'system'))
);

CREATE INDEX v2_booking_history_appointment_idx ON v2_booking_history (appointment_id, at, id);
