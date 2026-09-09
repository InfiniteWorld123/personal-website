import { getContent, projectOrder, projects } from '#/frontend/content'
import type { ProjectFacts } from '#/frontend/content/site'
import type { ProjectCopy } from '#/frontend/content/types'
import type { Language } from '#/frontend/i18n/language'

export type ProjectEntry = { facts: ProjectFacts; copy: ProjectCopy }
export const PROJECT_BATCH_SIZE = 6
export function getProjectEntries(language: Language): ProjectEntry[] {
  const { work } = getContent(language)
  return projectOrder.map(slug => ({ facts: projects[slug], copy: work.items[slug] }))
}
export function parseProjectPage(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') return 1
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}
export function getProjectBatch<T>(items: T[], requestedPage?: number) {
  const page = Math.min(parseProjectPage(requestedPage), Math.max(1, Math.ceil(items.length / PROJECT_BATCH_SIZE)))
  const visible = items.slice(0, page * PROJECT_BATCH_SIZE)
  return { page, visible, hasMore: visible.length < items.length }
}
