import { describe, expect, it } from 'vitest'
import { links, navigation, profile, projects, skills } from '../config/config'

describe('portfolio content config', () => {
  it('keeps the launch content aligned with the portfolio brief', () => {
    expect(profile.name).toBe('Yaman Warda')
    expect(profile.location).toBe('Erfurt, Germany')
    expect(links.github).toContain('InfiniteWorld123')
    expect(navigation.map((item) => item.label)).toEqual(['Home', 'About', 'Projects', 'Contact'])
    expect(projects).toHaveLength(3)
    expect(projects[0]?.title).toBe('StoryNest')
    expect(skills).toContain('TanStack Start')
  })
})
