import {
  ASSISTANT_LIMITS,
  type AssistantSettings,
  type RetentionMode,
} from '#/backend2/contracts/assistant.contract'

/**
 * The retention form's own rules (approved Design Lab, 24 Sep 2026): keep
 * conversations until the owner deletes them — the default — or delete them
 * automatically after 30, 90 or 180 days. The server enforces the same range
 * again; these only let the form say so before anything is sent.
 */

export const RETENTION_CHOICES = [30, 90, 180] as const

export type RetentionForm = {
  retentionMode: RetentionMode
  /** The select's value: '' until a period is chosen. */
  retentionDays: string
}

export const retentionFormFrom = (settings: Pick<AssistantSettings, 'retentionMode' | 'retentionDays'>): RetentionForm => ({
  retentionMode: settings.retentionMode,
  retentionDays: settings.retentionDays === null ? '' : String(settings.retentionDays),
})

/**
 * The periods the select offers. A period saved some other way (the API
 * accepts any whole number of days) is kept as a choice, so opening the form
 * never silently changes it.
 */
export const retentionOptions = (current: string): number[] => {
  const saved = Number(current)
  const options: number[] = [...RETENTION_CHOICES]

  if (current !== '' && Number.isInteger(saved) && !options.includes(saved)) options.push(saved)

  return options.sort((a, b) => a - b)
}

export const retentionFormErrors = (value: RetentionForm): Partial<Record<keyof RetentionForm, string>> => {
  if (value.retentionMode !== 'days') return {}

  if (value.retentionDays === '') return { retentionDays: 'Choose after how many days conversations are deleted' }

  const days = Number(value.retentionDays)

  if (!Number.isInteger(days)) return { retentionDays: 'Use a whole number of days' }
  if (days < ASSISTANT_LIMITS.retentionDaysMin) return { retentionDays: 'At least one day' }
  if (days > ASSISTANT_LIMITS.retentionDaysMax) return { retentionDays: `At most ${ASSISTANT_LIMITS.retentionDaysMax} days` }

  return {}
}

export const retentionPatch = (value: RetentionForm): { retentionMode: RetentionMode; retentionDays: number | null } =>
  value.retentionMode === 'days'
    ? { retentionMode: 'days', retentionDays: Number(value.retentionDays) }
    : { retentionMode: 'manual', retentionDays: null }

/** Whether the saved settings already say what the form says. */
export const retentionUnchanged = (value: RetentionForm, saved: RetentionForm): boolean =>
  value.retentionMode === saved.retentionMode &&
  (value.retentionMode === 'manual' || value.retentionDays === saved.retentionDays)
