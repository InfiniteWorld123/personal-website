import type { ProjectEntry, ProjectEntryImage } from '#/frontend/features/work/project-list'
import type { ProjectStatus } from '#/shared/validation/project.validation'

/** A published project, one language already chosen, as a test describes it. */
export type ProjectFixture = {
  slug: string
  status: ProjectStatus
  website: string | null
  source: string | null
  tech: string[]
  images: ProjectEntryImage[]
  name: string
  kind: string
  summary: string
}

/**
 * A published project. Tests build their cases from this instead of real
 * projects, so a real project changing its copy can never turn a test red.
 */
export const publicProjectFixture = (overrides: Partial<ProjectFixture> = {}): ProjectFixture => ({
  slug: 'fixture-project',
  status: 'live',
  website: 'https://example.com',
  source: 'https://github.com/example/fixture',
  tech: ['React', 'TypeScript', 'PostgreSQL', 'Stripe'],
  images: [{ src: '/images/fixture.jpg', width: 1600, height: 1000, alt: 'A fixture screenshot.' }],
  name: 'Fixture Project',
  kind: 'Online store',
  summary: 'A fixture used by the tests.',
  ...overrides,
})

/** The fixture in the shape the public pages draw. */
export const toProjectEntry = (project: ProjectFixture): ProjectEntry => ({
  facts: {
    slug: project.slug,
    status: project.status,
    website: project.website,
    source: project.source,
    stack: project.tech,
    images: project.images,
  },
  copy: {
    name: project.name,
    kind: project.kind,
    summary: project.summary,
  },
})
