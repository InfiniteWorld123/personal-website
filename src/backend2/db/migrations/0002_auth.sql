-- Authentication V2. See docs/v2/auth.md.
--
-- Everything is prefixed `v2_`, like 0001, and nothing here joins to a legacy
-- table. The legacy `/admin` account, its database and its session survive
-- untouched: this is a second, independent identity that happens to belong to
-- the same person.

-- The single owner. There is no registration endpoint and never a second row:
-- the unique index on a constant is what makes "exactly one" a property of the
-- schema rather than a rule somebody has to remember.
CREATE TABLE v2_owner (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Stored already lowercased; the application normalises before writing.
    email                    text NOT NULL,
    -- The fallback password. Never null after bootstrap, but nullable so the
    -- bootstrap transaction can write the row before hashing finishes.
    password_hash            text,
    password_changed_at      timestamptz,
    -- Encrypted at rest with the V2 auth secret, never the raw base32.
    totp_secret              text,
    -- Set only after one real code verified against that secret. Enrollment is
    -- not complete because the QR was shown.
    totp_confirmed_at        timestamptz,
    -- The last 30-second step a code was accepted for. A correct code used
    -- twice inside its own window is one code, not two.
    totp_last_step           bigint,
    -- Set the first time a recovery set is displayed. Until both this and
    -- `totp_confirmed_at` are set the owner holds an enrollment state, not
    -- access.
    recovery_codes_issued_at timestamptz,
    created_at               timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_owner_email_check CHECK (email = lower(email) AND position('@' IN email) > 1)
);

CREATE UNIQUE INDEX v2_owner_singleton ON v2_owner ((true));
CREATE UNIQUE INDEX v2_owner_email_idx ON v2_owner (email);

-- One registered authenticator. Several are expected — laptop and phone — and
-- the service refuses to remove the last usable sign-in path.
CREATE TABLE v2_owner_passkeys (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id      uuid NOT NULL REFERENCES v2_owner (id) ON DELETE CASCADE,
    -- base64url, as WebAuthn hands it over.
    credential_id text NOT NULL UNIQUE,
    public_key    bytea NOT NULL,
    -- The authenticator's signature counter. A value that goes backwards is
    -- the documented cloning signal.
    counter       bigint NOT NULL DEFAULT 0,
    transports    text[] NOT NULL DEFAULT '{}',
    device_type   text NOT NULL DEFAULT 'singleDevice',
    backed_up     boolean NOT NULL DEFAULT false,
    name          text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at  timestamptz,
    CONSTRAINT v2_owner_passkeys_device_check
        CHECK (device_type IN ('singleDevice', 'multiDevice'))
);

CREATE INDEX v2_owner_passkeys_owner_idx ON v2_owner_passkeys (owner_id);

-- An authenticated session, server-side. The cookie carries an opaque token
-- whose hash is the only copy stored here, so a database read cannot be
-- replayed as a sign-in.
CREATE TABLE v2_owner_sessions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id         uuid NOT NULL REFERENCES v2_owner (id) ON DELETE CASCADE,
    token_hash       text NOT NULL UNIQUE,
    -- 'passkey' | 'password_totp' | 'password_recovery'
    method           text NOT NULL,
    -- The moment of full sign-in. Rotating the token never moves it, which is
    -- what keeps the seven days absolute.
    authenticated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at       timestamptz NOT NULL,
    last_seen_at     timestamptz,
    revoked_at       timestamptz,
    revoked_reason   text,
    user_agent       text,
    -- Hashed: a session list should not become a log of the owner's addresses.
    ip_hash          text,
    created_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_owner_sessions_method_check
        CHECK (method IN ('passkey', 'password_totp', 'password_recovery'))
);

CREATE INDEX v2_owner_sessions_owner_idx ON v2_owner_sessions (owner_id, expires_at);

-- Every short-lived ceremony, in one table: the WebAuthn challenges, the
-- pending MFA step that a correct password buys, the setup state during first
-- enrollment, and the action-scoped step-up capability.
--
-- None of these is a session. That distinction is the whole reason the table
-- exists separately from `v2_owner_sessions`.
CREATE TABLE v2_auth_challenges (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind        text NOT NULL,
    -- Null for a ceremony that runs before anyone is identified.
    owner_id    uuid REFERENCES v2_owner (id) ON DELETE CASCADE,
    -- Hash of the opaque id handed to the client.
    secret_hash text NOT NULL UNIQUE,
    -- The WebAuthn challenge, the step-up scope, the sign-in method — never a
    -- password, a TOTP secret or a recovery code.
    data        jsonb NOT NULL DEFAULT '{}',
    attempts    integer NOT NULL DEFAULT 0,
    expires_at  timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_auth_challenges_kind_check
        CHECK (kind IN ('webauthn_auth', 'webauthn_register', 'mfa_pending', 'step_up'))
);

CREATE INDEX v2_auth_challenges_expiry_idx ON v2_auth_challenges (expires_at);

-- The links that arrive by email. One use, then dead for ever; a new request
-- of the same kind invalidates the outstanding ones.
CREATE TABLE v2_auth_tokens (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    uuid NOT NULL REFERENCES v2_owner (id) ON DELETE CASCADE,
    kind        text NOT NULL,
    token_hash  text NOT NULL UNIQUE,
    -- Only for an email change: the address waiting to be confirmed.
    new_email   text,
    expires_at  timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_auth_tokens_kind_check CHECK (kind IN ('password_reset', 'email_change')),
    CONSTRAINT v2_auth_tokens_email_check
        CHECK (kind <> 'email_change' OR new_email IS NOT NULL)
);

CREATE INDEX v2_auth_tokens_owner_idx ON v2_auth_tokens (owner_id, kind);

-- One-time recovery codes. Only the hash is stored, a used code is never
-- valid again, and rotating replaces the whole batch atomically.
CREATE TABLE v2_owner_recovery_codes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   uuid NOT NULL REFERENCES v2_owner (id) ON DELETE CASCADE,
    code_hash  text NOT NULL,
    batch_id   uuid NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_owner_recovery_codes_unique UNIQUE (owner_id, code_hash)
);

CREATE INDEX v2_owner_recovery_codes_batch_idx ON v2_owner_recovery_codes (owner_id, batch_id);

-- Server-side abuse counters, in the database rather than a process-local map
-- so a second Worker instance shares them. This replaces the Turnstile widget
-- on the V2 sign-in; it does not touch the live public forms.
CREATE TABLE v2_auth_rate_limits (
    key               text PRIMARY KEY,
    count             integer NOT NULL DEFAULT 0,
    window_started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX v2_auth_rate_limits_window_idx ON v2_auth_rate_limits (window_started_at);

-- The audit trail. Shape and outcome only: no password, code, token or hash
-- ever reaches a row here.
CREATE TABLE v2_security_events (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   uuid REFERENCES v2_owner (id) ON DELETE CASCADE,
    kind       text NOT NULL,
    detail     jsonb NOT NULL DEFAULT '{}',
    ip_hash    text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX v2_security_events_recent_idx ON v2_security_events (created_at DESC);
