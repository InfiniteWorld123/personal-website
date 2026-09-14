import { getDb, type Db } from '#/backend/db/client'
import {
  DEFAULT_LEAD_PREFERENCES,
  readLeadPreferences,
  type LeadPreferences,
} from '#/shared/validation/pipeline.validation'

/**
 * Where the lead section keeps its switches: one `app_settings` row, JSON
 * value, exactly as the inbox keeps its own.
 *
 * It lives in its own file so the booking service can read a preference
 * without importing the pipeline — a call that has just been booked needs to
 * know whether the `booked` rule is automatic, and nothing more than that.
 */

export const LEAD_SETTINGS_KEY = 'leads'

export const getLeadPreferences = async (db: Db = getDb()): Promise<LeadPreferences> => {
  const result = await db.query<{ value: unknown }>(`SELECT value FROM app_settings WHERE "key" = $1;`, [
    LEAD_SETTINGS_KEY,
  ])

  return result.rows[0] ? readLeadPreferences(result.rows[0].value) : DEFAULT_LEAD_PREFERENCES
}

export const writeLeadPreferences = async (preferences: LeadPreferences, db: Db = getDb()): Promise<void> => {
  await db.query(
    `INSERT INTO app_settings ("key", value, updated_at)
     VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT ("key") DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;`,
    [LEAD_SETTINGS_KEY, JSON.stringify(preferences)],
  )
}
