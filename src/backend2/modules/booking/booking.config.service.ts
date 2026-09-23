import {
  BOOKING_LANGUAGES,
  type Availability,
  type BookingSettings,
  type BookingType,
  OWNER_TIME_ZONE,
  type PublicBookingType,
  type TypeTexts,
} from '../../contracts/booking.contract'
import { type Page, toPage } from '../../contracts/pagination.contract'
import { withTransaction } from '../../db/client'
import { conflict, notFound, typeInUse, validationFailed } from '../../http/error'
import * as repo from './booking.repo'
import { localParts } from './booking.time'

/**
 * The owner's business settings: appointment types, weekly hours and
 * exceptions, and the visitor limits. Security and provider settings are
 * deliberately not here — they are configuration, not a Dashboard switch.
 */

/* ---------------------------------------------------------------- settings */

export const getSettings = async (): Promise<BookingSettings> => {
  const row = await repo.readSettings()

  return {
    minNoticeMinutes: row.min_notice_minutes,
    windowDays: row.window_days,
    changeLimitHours: row.change_limit_hours,
    reminderMinutes: row.reminder_minutes,
    timeZone: OWNER_TIME_ZONE,
  }
}

/**
 * Saving settings changes what visitors may book from now on. Appointments
 * already confirmed keep their time; only reminders not yet sent follow a new
 * reminder timing — and one whose new moment has already passed is skipped,
 * exactly as for a booking made late.
 */
export const putSettings = async (input: {
  minNoticeMinutes: number
  windowDays: number
  changeLimitHours: number
  reminderMinutes: number
}): Promise<BookingSettings> => {
  await withTransaction(async () => {
    const before = await repo.readSettings()

    await repo.writeSettings({
      min_notice_minutes: input.minNoticeMinutes,
      window_days: input.windowDays,
      change_limit_hours: input.changeLimitHours,
      reminder_minutes: input.reminderMinutes,
    })

    if (before.reminder_minutes !== input.reminderMinutes) {
      await repo.recomputePendingReminders(input.reminderMinutes, new Date())
    }
  })

  return getSettings()
}

/* ------------------------------------------------------------ availability */

export const getAvailability = async (now: Date = new Date()): Promise<Availability> => {
  const today = localParts(now, OWNER_TIME_ZONE).date
  const weekly = await repo.readWeekly()
  const exceptions = await repo.readExceptions(today, '9999-12-31')

  return {
    weekly: weekly.map((row) => ({ weekday: row.weekday, startMinute: row.start_minute, endMinute: row.end_minute })),
    exceptions: exceptions.map((row) => ({ date: row.on_date, ranges: row.ranges, note: row.note })),
  }
}

/** Weekly hours replaced whole; exceptions from today on replaced whole. */
export const putAvailability = async (input: Availability, now: Date = new Date()): Promise<Availability> => {
  const today = localParts(now, OWNER_TIME_ZONE).date

  await withTransaction(async () => {
    await repo.replaceWeekly(input.weekly)
    await repo.replaceFutureExceptions(today, input.exceptions)
  })

  return getAvailability(now)
}

/* ------------------------------------------------------------------- types */

const emptyTexts = (): TypeTexts => ({
  de: { name: '', description: '' },
  en: { name: '', description: '' },
  ar: { name: '', description: '' },
})

const textsOf = (row: repo.TypeRow): TypeTexts => ({ ...emptyTexts(), ...row.texts })

/** Why a type cannot go public yet. A visitor must be able to read it in their language. */
export const enableBlockers = (texts: TypeTexts, methods: string[]): string[] => {
  const blockers: string[] = []

  for (const language of BOOKING_LANGUAGES) {
    if (texts[language].name.trim() === '') blockers.push(`Add the ${language.toUpperCase()} name`)
  }

  if (methods.length === 0) blockers.push('Allow at least one way to meet')

  return blockers
}

const toType = async (row: repo.TypeRow, now: Date): Promise<BookingType> => {
  const texts = textsOf(row)

  return {
    id: row.id,
    slug: row.slug,
    position: row.position,
    enabled: row.enabled,
    durationMinutes: row.duration_minutes,
    bufferMinutes: row.buffer_minutes,
    slotStepMinutes: row.slot_step_minutes,
    methods: row.methods,
    texts,
    enableBlockers: enableBlockers(texts, row.methods),
    upcomingCount: await repo.countUpcomingForType(row.id, now),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export const listTypes = async (input: { page: number; pageSize: number }): Promise<Page<BookingType>> => {
  const now = new Date()
  const { rows, total } = await repo.listTypes({ limit: input.pageSize, offset: (input.page - 1) * input.pageSize })
  const items: BookingType[] = []

  for (const row of rows) items.push(await toType(row, now))

  return toPage({ items, page: input.page, pageSize: input.pageSize, total })
}

export const getType = async (id: string): Promise<BookingType> => {
  const row = await repo.findType(id)

  if (!row) throw notFound('That appointment type does not exist')

  return toType(row, new Date())
}

const refuseIfBlocked = (enabled: boolean | undefined, texts: TypeTexts, methods: string[]) => {
  if (!enabled) return

  const blockers = enableBlockers(texts, methods)

  if (blockers.length > 0) {
    throw validationFailed('This type cannot be offered yet', {
      issues: blockers.map((message) => ({ field: 'enabled', message })),
    })
  }
}

const refuseTakenSlug = async (slug: string, id?: string) => {
  const other = await repo.findTypeBySlug(slug)

  if (other && other.id !== id) throw conflict('Another appointment type already uses that web address')
}

export const createType = async (input: {
  slug: string
  enabled: boolean
  durationMinutes: number
  bufferMinutes: number
  slotStepMinutes: number
  methods: Array<'video' | 'in_person' | 'phone'>
  texts: TypeTexts
}): Promise<BookingType> => {
  refuseIfBlocked(input.enabled, input.texts, input.methods)

  const id = await withTransaction(async () => {
    await refuseTakenSlug(input.slug)

    return repo.insertType(input)
  })

  return getType(id)
}

/**
 * Editing a type never changes an appointment already booked: each one holds
 * its own snapshot of name, duration and buffer.
 */
export const patchType = async (
  id: string,
  input: Partial<Parameters<typeof createType>[0]>,
): Promise<BookingType> => {
  await withTransaction(async () => {
    const row = await repo.findType(id)

    if (!row) throw notFound('That appointment type does not exist')

    const texts = input.texts ?? textsOf(row)
    const methods = input.methods ?? row.methods

    refuseIfBlocked(input.enabled ?? row.enabled, texts, methods)

    if (input.slug !== undefined) await refuseTakenSlug(input.slug, id)

    await repo.updateType({ id, ...input })
  })

  return getType(id)
}

/**
 * Deleting a type with upcoming appointments is refused — they would lose
 * the type a visitor reschedules within. Past appointments keep their
 * snapshot and simply stop pointing at it.
 */
export const deleteType = async (id: string): Promise<{ deleted: true }> => {
  await withTransaction(async () => {
    const row = await repo.findType(id)

    if (!row) throw notFound('That appointment type does not exist')

    const upcoming = await repo.countUpcomingForType(id, new Date())

    if (upcoming > 0) {
      throw typeInUse(
        `This type has ${upcoming} upcoming appointment${upcoming === 1 ? '' : 's'}. Switch it off instead, or move them first.`,
        { upcoming },
      )
    }

    await repo.deleteType(id)
  })

  return { deleted: true }
}

/* ------------------------------------------------------------------ public */

export const publicTypes = async (language: 'de' | 'en' | 'ar'): Promise<PublicBookingType[]> =>
  (await repo.enabledTypes()).map((row) => {
    const texts = textsOf(row)

    return {
      slug: row.slug,
      name: texts[language].name,
      description: texts[language].description,
      durationMinutes: row.duration_minutes,
      methods: row.methods,
      defaultMethod: row.methods.includes('video') ? 'video' : row.methods[0]!,
    }
  })

export const typeNameIn = (row: repo.TypeRow, language: 'de' | 'en' | 'ar'): string => {
  const texts = textsOf(row)

  return texts[language].name || texts.en.name || texts.de.name || row.slug
}
