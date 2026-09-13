-- Booking hardening (B5 follow-up).
--
-- 0004_bookings.sql is already applied in local development, so every
-- correction to its guarantees belongs in this new migration.

-- A management link is useful only until the appointment starts. It authorises
-- reading visitor data, so keeping it valid forever would turn an old email
-- into a permanent bearer credential.
ALTER TABLE bookings
    ADD COLUMN manage_token_expires_at timestamptz;

-- Existing rows keep the same practical rule as new ones. Past bookings become
-- invalid at once; future ones remain manageable until their start time.
UPDATE bookings
   SET manage_token_expires_at = starts_at
 WHERE manage_token_expires_at IS NULL;

ALTER TABLE bookings
    ALTER COLUMN manage_token_expires_at SET NOT NULL;

CREATE INDEX bookings_manage_token_valid_idx
    ON bookings (reference, cancel_token_hash, manage_token_expires_at);

-- A small shared counter makes limits work across browser tabs, server
-- instances, and concurrent requests. Keys are SHA-256 digests, never raw
-- email addresses or IP addresses.
CREATE TABLE booking_rate_limits (
    rate_key text PRIMARY KEY,
    window_started_at timestamptz NOT NULL,
    request_count integer NOT NULL,
    CONSTRAINT booking_rate_limits_count_check CHECK (request_count > 0)
);

CREATE INDEX booking_rate_limits_window_idx
    ON booking_rate_limits (window_started_at);
