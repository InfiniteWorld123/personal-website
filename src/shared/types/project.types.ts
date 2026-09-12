import type {
  ProjectImageInput,
  ProjectLanguage,
  ProjectStatus,
  ProjectTranslationInput,
} from '#/shared/validation/project.validation'

/** One row of the admin list. Deliberately small: the table shows no copy. */
export type AdminProjectListItem = {
  id: string
  slug: string
  status: ProjectStatus
  isPublished: boolean
  sortOrder: number
  /** Best available title, so a draft written in one language is still findable. */
  displayName: string
  languages: ProjectLanguage[]
  tech: string[]
  imageCount: number
  updatedAt: string
}

export type AdminProjectList = {
  items: AdminProjectListItem[]
  total: number
  page: number
  pageCount: number
}

/** The full record the edit form loads and saves back. */
export type AdminProjectDetail = {
  id: string
  slug: string
  status: ProjectStatus
  websiteUrl: string | null
  sourceUrl: string | null
  isPublished: boolean
  sortOrder: number
  tech: string[]
  images: ProjectImageInput[]
  translations: Partial<Record<ProjectLanguage, ProjectTranslationInput>>
  createdAt: string
  updatedAt: string
}

/**
 * What the public site receives: one language already chosen, no ids, no
 * draft rows, no timestamps. An explicit projection, never a raw table row.
 */
export type PublicProjectImage = {
  src: string
  width: number
  height: number
  alt: string
}

export type PublicProject = {
  slug: string
  status: ProjectStatus
  website: string | null
  source: string | null
  tech: string[]
  images: PublicProjectImage[]
  name: string
  kind: string
  summary: string
  problem: string
  approach: string
  shows: string
  features: string[]
}
