import type { ProjectEntry } from '#/frontend/features/work/project-list'
import type { PublicProject } from '#/shared/types/project.types'

/**
 * A project exactly as the public API projects one. Tests build their cases
 * from this instead of the shipped content, so a real project changing its
 * copy can never turn a test red.
 */
export const publicProjectFixture = (overrides: Partial<PublicProject> = {}): PublicProject => ({
  slug: 'fixture-project',
  status: 'live',
  website: 'https://example.com',
  source: 'https://github.com/example/fixture',
  tech: ['React', 'TypeScript', 'PostgreSQL', 'Stripe'],
  images: [{ src: '/images/fixture.jpg', width: 1600, height: 1000, alt: 'A fixture screenshot.' }],
  name: 'Fixture Project',
  kind: 'Online store',
  summary: 'A fixture used by the tests.',
  problem: 'The starting point.',
  approach: 'What was built.',
  shows: 'What it proves.',
  features: ['One', 'Two'],
  ...overrides,
})

/** The fixture in the shape the public pages draw. */
export const toProjectEntry = (project: PublicProject): ProjectEntry => ({
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
    problem: project.problem,
    approach: project.approach,
    shows: project.shows,
    features: project.features,
  },
})
