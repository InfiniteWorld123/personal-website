import 'dotenv/config'

import { randomUUID } from 'node:crypto'

import * as v from 'valibot'
import { EmailSchema, PasswordSchema } from '#/shared/validation/auth.validation'
import { auth } from '../../shared/auth'
import { pool } from '../pool'

/**
 * Provisions the single administrator. Sign-up is disabled on the public API,
 * so this controlled command is the only way an admin account is created.
 *
 * Re-running it updates the existing administrator's password rather than
 * creating a second one — the database enforces that only one may exist.
 */
async function seedAdmin() {
  const name = process.env.ADMIN_NAME?.trim() || 'Yaman Warda'
  const email = v.parse(EmailSchema, process.env.ADMIN_EMAIL)
  const password = v.parse(PasswordSchema, process.env.ADMIN_PASSWORD)

  const context = await auth.$context
  const passwordHash = await context.password.hash(password)

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const existing = await client.query<{ id: string }>(
      `SELECT id FROM "user" WHERE role = 'ADMIN' LIMIT 1;`,
    )

    if (existing.rows[0]) {
      const userId = existing.rows[0].id

      await client.query(
        `UPDATE "user"
            SET name = $2, email = $3, "emailVerified" = true, "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = $1;`,
        [userId, name, email],
      )

      await client.query(
        `UPDATE "account"
            SET password = $2, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "userId" = $1 AND "providerId" = 'credential';`,
        [userId, passwordHash],
      )

      await client.query('COMMIT')
      console.log(`Administrator updated: ${email}`)
      return
    }

    const userId = randomUUID()

    await client.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", role)
       VALUES ($1, $2, $3, true, 'ADMIN');`,
      [userId, name, email],
    )

    await client.query(
      `INSERT INTO "account" (id, "accountId", "providerId", "userId", password)
       VALUES ($1, $2, 'credential', $2, $3);`,
      [randomUUID(), userId, passwordHash],
    )

    await client.query('COMMIT')
    console.log(`Administrator created: ${email}`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

try {
  await seedAdmin()
} finally {
  await pool.end()
}
