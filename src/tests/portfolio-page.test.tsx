import { describe, expect, it } from 'vitest'
import { links, navigation, portfolioContent, profile, projects, skills } from '../config/config'

describe('portfolio content config', () => {
  it('keeps the launch content aligned with the portfolio brief', () => {
    expect(profile.name).toBe('Yaman Warda')
    expect(profile.location).toBe('Erfurt, Deutschland')
    expect(links.github).toContain('InfiniteWorld123')
    expect(navigation.map((item) => item.label)).toEqual([
      'Start',
      'Über mich',
      'Projekte',
      'Kontakt',
    ])
    expect(projects).toHaveLength(2)
    expect(projects[0]?.title).toBe('Tech Store')
    expect(projects[0]?.status).toBe('live')
    expect(projects[0]?.websiteHref).toBe('https://tech-store.yamanwarda.dev')
    expect(projects[0]?.githubHref).toBe('https://github.com/InfiniteWorld123/tech-store')
    expect(projects[1]?.title).toBe('SkillForge')
    expect(projects[1]?.status).toBe('coming-soon')
    expect(skills).toContain('TanStack Start')
    expect(portfolioContent.en.profile.location).toBe('Erfurt, Germany')
    expect(portfolioContent.en.navigation.map((item) => item.label)).toEqual([
      'Home',
      'About',
      'Projects',
      'Contact',
    ])
    expect(portfolioContent.ar.profile.location).toBe('إرفورت، ألمانيا')
    expect(portfolioContent.ar.navigation.map((item) => item.label)).toEqual([
      'الرئيسية',
      'من أنا',
      'المشاريع',
      'تواصل',
    ])
  })
})
