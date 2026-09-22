import { getDb, withTransaction } from '../../db/client'
import { conflict } from '../../http/error'
import { hashOpaqueSecret } from '../../auth/crypto'
import { normalizeRecoveryCode } from '../../auth/recovery'

/**
 * Every statement Auth V2 runs against the owner's own tables.
 *
 * Deliberately the only module that writes them, so the rules that have to
 * hold everywhere — one owner, hashes never compared in JavaScript, a recovery
 * code spent exactly once — live in one readable place instead of being
 * repeated at each call site.
 */

export type OwnerRow = {
  id: string
  email: string
  password_hash: string | null
  password_changed_at: Date | null
  totp_secret: string | null
  totp_confirmed_at: Date | null
  totp_last_step: string | number | null
  recovery_codes_issued_at: Date | null
  created_at: Date
}

const OWNER_COLUMNS = `id, email, password_hash, password_changed_at, totp_secret,
                       totp_confirmed_at, totp_last_step, recovery_codes_issued_at, created_at`

/** The one owner, if bootstrap has run. */
export const findOwner = async (): Promise<OwnerRow | null> => {
  const { rows } = await getDb().query<OwnerRow>(`SELECT ${OWNER_COLUMNS} FROM v2_owner LIMIT 1`)

  return rows[0] ?? null
}

/**
 * Lookup by address, used by the fallback sign-in.
 *
 * A miss and a wrong password produce the same answer at the route, so this
 * returning null is not itself a disclosure.
 */
export const findOwnerByEmail = async (email: string): Promise<OwnerRow | null> => {
  const { rows } = await getDb().query<OwnerRow>(
    `SELECT ${OWNER_COLUMNS} FROM v2_owner WHERE email = $1`,
    [email.trim().toLowerCase()],
  )

  return rows[0] ?? null
}

/**
 * Bootstrap. Refuses to overwrite, as the specification requires, and the
 * unique index on a constant refuses a second row even if this check were
 * somehow skipped.
 */
export const createOwner = async (options: {
  email: string
  passwordHash: string
}): Promise<OwnerRow> => {
  const { rows } = await getDb().query<OwnerRow>(
    `INSERT INTO v2_owner (email, password_hash, password_changed_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT DO NOTHING
     RETURNING ${OWNER_COLUMNS}`,
    [options.email.trim().toLowerCase(), options.passwordHash],
  )

  const row = rows[0]

  if (!row) throw conflict('An owner account already exists in this database')

  return row
}

export const setPasswordHash = async (ownerId: string, hash: string): Promise<void> => {
  await getDb().query(
    `UPDATE v2_owner
        SET password_hash = $2, password_changed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [ownerId, hash],
  )
}

export const setEmail = async (ownerId: string, email: string): Promise<void> => {
  await getDb().query(
    `UPDATE v2_owner SET email = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [ownerId, email.trim().toLowerCase()],
  )
}

/**
 * Stores a secret that is not yet in force.
 *
 * `totp_confirmed_at` stays null until a real code is checked against it, so
 * showing the QR grants nothing on its own.
 */
export const setPendingTotpSecret = async (
  ownerId: string,
  encryptedSecret: string,
): Promise<void> => {
  await getDb().query(
    `UPDATE v2_owner
        SET totp_secret = $2, totp_confirmed_at = NULL, totp_last_step = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [ownerId, encryptedSecret],
  )
}

export const confirmTotp = async (ownerId: string, step: number): Promise<void> => {
  await getDb().query(
    `UPDATE v2_owner
        SET totp_confirmed_at = CURRENT_TIMESTAMP, totp_last_step = $2,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [ownerId, step],
  )
}

/**
 * Remembers the step a code was accepted for.
 *
 * `GREATEST` rather than a plain assignment: a request that arrives out of
 * order must not lower the watermark and re-open a window that already
 * closed.
 */
export const rememberTotpStep = async (ownerId: string, step: number): Promise<void> => {
  await getDb().query(
    `UPDATE v2_owner SET totp_last_step = GREATEST(COALESCE(totp_last_step, 0), $2) WHERE id = $1`,
    [ownerId, step],
  )
}

export const markRecoveryCodesIssued = async (ownerId: string): Promise<void> => {
  await getDb().query(
    `UPDATE v2_owner
        SET recovery_codes_issued_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [ownerId],
  )
}

/* ---------------------------------------------------------------- passkeys */

export type PasskeyRow = {
  id: string
  owner_id: string
  credential_id: string
  public_key: Uint8Array | Buffer
  counter: string | number
  transports: string[]
  device_type: 'singleDevice' | 'multiDevice'
  backed_up: boolean
  name: string
  created_at: Date
  last_used_at: Date | null
}

export const listPasskeys = async (ownerId: string): Promise<PasskeyRow[]> => {
  const { rows } = await getDb().query<PasskeyRow>(
    `SELECT id, owner_id, credential_id, public_key, counter, transports, device_type,
            backed_up, name, created_at, last_used_at
       FROM v2_owner_passkeys
      WHERE owner_id = $1
      ORDER BY created_at ASC`,
    [ownerId],
  )

  return rows
}

export const countPasskeys = async (ownerId: string): Promise<number> => {
  const { rows } = await getDb().query<{ count: string }>(
    'SELECT count(*)::text AS count FROM v2_owner_passkeys WHERE owner_id = $1',
    [ownerId],
  )

  return Number(rows[0]?.count ?? 0)
}

/**
 * Finds the key a signature should be checked against.
 *
 * The credential id is not a secret and is not treated as one: it selects a
 * row, and the assertion still has to verify against that row's public key.
 */
export const findPasskeyByCredentialId = async (
  credentialId: string,
): Promise<PasskeyRow | null> => {
  const { rows } = await getDb().query<PasskeyRow>(
    `SELECT id, owner_id, credential_id, public_key, counter, transports, device_type,
            backed_up, name, created_at, last_used_at
       FROM v2_owner_passkeys
      WHERE credential_id = $1`,
    [credentialId],
  )

  return rows[0] ?? null
}

export const insertPasskey = async (options: {
  ownerId: string
  credentialId: string
  publicKey: Uint8Array
  counter: number
  transports: string[]
  deviceType: 'singleDevice' | 'multiDevice'
  backedUp: boolean
  name: string
}): Promise<string> => {
  const { rows } = await getDb().query<{ id: string }>(
    `INSERT INTO v2_owner_passkeys
       (owner_id, credential_id, public_key, counter, transports, device_type, backed_up, name)
     VALUES ($1, $2, $3, $4, $5::text[], $6, $7, $8)
     RETURNING id`,
    [
      options.ownerId,
      options.credentialId,
      /*
       * `Buffer`, not the `Uint8Array` everything else in the module uses:
       * `pg` checks `Buffer.isBuffer` to encode a `bytea`, and hands a plain
       * typed array to PostgreSQL as the string "1,2,3". It is the only Node
       * global Auth V2 touches, and `nodejs_compat` is already required by
       * `pg` itself.
       */
      Buffer.from(options.publicKey),
      options.counter,
      options.transports,
      options.deviceType,
      options.backedUp,
      options.name,
    ],
  )

  const row = rows[0]

  if (!row) throw new Error('The passkey could not be stored')

  return row.id
}

export const touchPasskey = async (options: {
  id: string
  counter: number
  backedUp: boolean
}): Promise<void> => {
  await getDb().query(
    `UPDATE v2_owner_passkeys
        SET counter = $2, backed_up = $3, last_used_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [options.id, options.counter, options.backedUp],
  )
}

export const deletePasskey = async (ownerId: string, id: string): Promise<boolean> => {
  const { rows } = await getDb().query<{ id: string }>(
    'DELETE FROM v2_owner_passkeys WHERE owner_id = $1 AND id = $2 RETURNING id',
    [ownerId, id],
  )

  return rows.length > 0
}

/* ---------------------------------------------------------- recovery codes */

/**
 * Replaces the whole set in one transaction.
 *
 * Deleting and inserting separately would leave a moment with no usable codes
 * at all — and, if the insert then failed, a permanent one.
 */
export const replaceRecoveryCodes = async (
  ownerId: string,
  codes: string[],
): Promise<string> => {
  const batchId = crypto.randomUUID()

  await withTransaction(async (db) => {
    await db.query('DELETE FROM v2_owner_recovery_codes WHERE owner_id = $1', [ownerId])

    for (const code of codes) {
      await db.query(
        `INSERT INTO v2_owner_recovery_codes (owner_id, code_hash, batch_id)
         VALUES ($1, $2, $3)`,
        [ownerId, hashOpaqueSecret(normalizeRecoveryCode(code)), batchId],
      )
    }
  })

  return batchId
}

export const countUnusedRecoveryCodes = async (ownerId: string): Promise<number> => {
  const { rows } = await getDb().query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM v2_owner_recovery_codes
      WHERE owner_id = $1 AND used_at IS NULL`,
    [ownerId],
  )

  return Number(rows[0]?.count ?? 0)
}

/**
 * Spends a recovery code, atomically.
 *
 * `used_at IS NULL` inside the UPDATE is what makes a code single-use under
 * concurrency: two requests carrying the same code both run the statement, and
 * exactly one of them gets a row back.
 */
export const consumeRecoveryCode = async (
  ownerId: string,
  code: string,
): Promise<boolean> => {
  const { rows } = await getDb().query<{ id: string }>(
    `UPDATE v2_owner_recovery_codes
        SET used_at = CURRENT_TIMESTAMP
      WHERE owner_id = $1 AND code_hash = $2 AND used_at IS NULL
      RETURNING id`,
    [ownerId, hashOpaqueSecret(normalizeRecoveryCode(code))],
  )

  return rows.length > 0
}

/* ----------------------------------------------------------- email tokens */

export type AuthTokenRow = {
  id: string
  owner_id: string
  kind: 'password_reset' | 'email_change'
  new_email: string | null
  expires_at: Date
}

/**
 * Issues a one-use link token, and kills any older one of the same kind.
 *
 * "New request invalidates older outstanding links of the same kind"
 * (`docs/v2/auth.md`), so a forwarded older email cannot be used after the
 * owner asked again.
 */
export const issueAuthToken = async (options: {
  ownerId: string
  kind: 'password_reset' | 'email_change'
  tokenHash: string
  newEmail?: string | null
  ttlSeconds: number
}): Promise<Date> => {
  return withTransaction(async (db) => {
    await db.query(
      `UPDATE v2_auth_tokens
          SET consumed_at = CURRENT_TIMESTAMP
        WHERE owner_id = $1 AND kind = $2 AND consumed_at IS NULL`,
      [options.ownerId, options.kind],
    )

    const { rows } = await db.query<{ expires_at: Date }>(
      `INSERT INTO v2_auth_tokens (owner_id, kind, token_hash, new_email, expires_at)
       VALUES ($1, $2, $3, $4,
               CURRENT_TIMESTAMP + make_interval(secs => $5::double precision))
       RETURNING expires_at`,
      [
        options.ownerId,
        options.kind,
        options.tokenHash,
        options.newEmail ?? null,
        options.ttlSeconds,
      ],
    )

    const row = rows[0]

    if (!row) throw new Error('The token could not be issued')

    return new Date(row.expires_at)
  })
}

export const consumeAuthToken = async (
  tokenHash: string,
  kind: 'password_reset' | 'email_change',
): Promise<AuthTokenRow | null> => {
  const { rows } = await getDb().query<AuthTokenRow>(
    `UPDATE v2_auth_tokens
        SET consumed_at = CURRENT_TIMESTAMP
      WHERE token_hash = $1
        AND kind = $2
        AND consumed_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      RETURNING id, owner_id, kind, new_email, expires_at`,
    [tokenHash, kind],
  )

  return rows[0] ?? null
}

export const findPendingEmailChange = async (
  ownerId: string,
): Promise<{ newEmail: string; expiresAt: Date } | null> => {
  const { rows } = await getDb().query<{ new_email: string; expires_at: Date }>(
    `SELECT new_email, expires_at
       FROM v2_auth_tokens
      WHERE owner_id = $1
        AND kind = 'email_change'
        AND consumed_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC
      LIMIT 1`,
    [ownerId],
  )

  const row = rows[0]

  return row ? { newEmail: row.new_email, expiresAt: new Date(row.expires_at) } : null
}
