import 'dotenv/config'

import { closePool, getPool } from '../client'

/**
 * The first call type and a working week to hang it on, so the booking page
 * has something to show the moment the migration lands.
 *
 * A command rather than a migration because these are the owner's settings,
 * not schema: they are meant to be changed from the admin afterwards, and a
 * migration that wrote them would fight every later edit.
 *
 * Idempotent. Anything already present is left exactly as it is.
 */

const SLUG = 'erstgespraech'

/** Monday to Friday, 09:00 to 17:00 Berlin. The owner has a day job. */
const WEEKDAYS = [1, 2, 3, 4, 5]
const STARTS_AT_MINUTE = 9 * 60
const ENDS_AT_MINUTE = 17 * 60

const TRANSLATIONS = {
  de: {
    name: 'Erstgespräch',
    description:
      'Dreißig Minuten, um dein Vorhaben zu verstehen: worum es geht, was du schon hast und ob ich der Richtige dafür bin. Kostenlos und unverbindlich.',
  },
  en: {
    name: 'Intro call',
    description:
      'Thirty minutes to understand what you are building: where it stands, what you already have, and whether I am the right person for it. Free, no strings.',
  },
  ar: {
    name: 'مكالمة تعارف',
    description:
      'ثلاثون دقيقة لفهم مشروعك: أين وصل، وما الذي تملكه الآن، وهل أنا الشخص المناسب له. مجانية وبلا التزام.',
  },
} as const

async function seedBooking() {
  const client = await getPool().connect()

  try {
    await client.query('BEGIN')

    const existing = await client.query<{ id: string }>(
      'SELECT id FROM booking_types WHERE slug = $1;',
      [SLUG],
    )

    if (existing.rows[0]) {
      console.log(`Skipped (already present): ${SLUG}`)
    } else {
      const created = await client.query<{ id: string }>(
        `INSERT INTO booking_types
           (slug, duration_minutes, buffer_after_minutes, minimum_notice_minutes,
            booking_window_days, slot_interval_minutes, max_per_day, location_kind, is_active)
         VALUES ($1, 30, 15, 720, 60, 30, 3, 'VIDEO', true)
         RETURNING id;`,
        [SLUG],
      )

      const id = created.rows[0]?.id
      if (!id) throw new Error('The call type could not be created')

      for (const [language, copy] of Object.entries(TRANSLATIONS)) {
        await client.query(
          `INSERT INTO booking_type_translations (booking_type_id, language, name, description)
           VALUES ($1, $2, $3, $4);`,
          [id, language, copy.name, copy.description],
        )
      }

      console.log(`Created: ${SLUG}`)
    }

    // The default schedule, which every call type inherits.
    const rules = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM availability_rules WHERE booking_type_id IS NULL;',
    )

    if (Number(rules.rows[0]?.count ?? 0) > 0) {
      console.log('Skipped (already present): weekly hours')
    } else {
      for (const weekday of WEEKDAYS) {
        await client.query(
          `INSERT INTO availability_rules (booking_type_id, weekday, starts_at_minute, ends_at_minute)
           VALUES (NULL, $1, $2, $3);`,
          [weekday, STARTS_AT_MINUTE, ENDS_AT_MINUTE],
        )
      }

      console.log('Created: Monday to Friday, 09:00-17:00 Europe/Berlin')
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
    await closePool()
  }
}

seedBooking().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
