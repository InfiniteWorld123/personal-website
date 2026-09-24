import { describe, expect, it } from 'vitest'
import {
  getProjectBatch,
  parseProjectPage,
  toStructuredProject,
} from '#/frontend/features/work/project-list'
import { publicProjectFixture, toProjectEntry } from './fixtures/project'

describe('local project collection', () => {
  it.each([0, 1, 3, 6, 10])('renders %i records in cumulative batches of six', count => {
    const records = Array.from({ length: count }, (_, i) => ({ slug: 'fixture-' + i }))
    const first = getProjectBatch(records, 1)
    expect(first.visible).toHaveLength(Math.min(count, 6))
    expect(first.hasMore).toBe(count > 6)
    const second = getProjectBatch(records, 2)
    expect(second.visible).toHaveLength(count)
    expect(second.hasMore).toBe(false)
    expect(new Set(second.visible.map(item => item.slug)).size).toBe(count)
  })
  it.each([undefined, null, '', 'bad', 'NaN', 'Infinity', 0, -1, 1.5, true, {}, [], Number.MAX_SAFE_INTEGER + 1])('resets invalid page %s', value => {
    expect(parseProjectPage(value)).toBe(1)
  })
  it('supports a shared URL batch and clamps pages beyond the end', () => {
    expect(parseProjectPage('2')).toBe(2)
    expect(getProjectBatch(Array.from({ length: 10 }), 999).page).toBe(2)
  })
  it('splits a published project into the facts and the copy each view needs', () => {
    const { facts, copy } = toProjectEntry(publicProjectFixture())

    expect(facts).toEqual({
      slug: 'fixture-project',
      status: 'live',
      website: 'https://example.com',
      source: 'https://github.com/example/fixture',
      stack: ['React', 'TypeScript', 'PostgreSQL', 'Stripe'],
      images: [{ src: '/images/fixture.jpg', width: 1600, height: 1000, alt: 'A fixture screenshot.' }],
    })
    expect(copy.name).toBe('Fixture Project')
    expect(copy.features).toEqual(['One', 'Two'])
  })
  it('carries a project with no links into the graph as null, not as a missing key', () => {
    const entry = toProjectEntry(publicProjectFixture({ website: null, source: null }))

    expect(toStructuredProject(entry)).toMatchObject({
      slug: 'fixture-project',
      name: 'Fixture Project',
      website: null,
      source: null,
    })
  })
})
