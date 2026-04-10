type ProjectStatus = 'live' | 'coming-soon'

interface Project {
  title: string
  description: string
  href: string
  status: ProjectStatus
  ctaLabel: string
}

export const profile = {
  name: 'Yaman Warda',
  headline: 'Self-Taught Full-Stack Developer',
  bio: 'I build clean, fast web applications — from intuitive UIs to robust backends. Passionate about learning in public and shipping products that matter.',
  location: 'Erfurt, Germany',
}

export const links = {
  github: 'https://github.com/yamanwarda',
  email: 'yamanwarda06@gmail.com',
}

export const projects: Project[] = [
  {
    title: 'StoryNest',
    description:
      'A platform for discovering and sharing stories. Built with a focus on reading experience and community engagement.',
    href: '#',
    status: 'live',
    ctaLabel: 'View Project',
  },
  {
    title: 'Tech Store',
    description:
      'A full-stack e-commerce application for tech products, featuring a product catalog, cart, and checkout flow.',
    href: '#',
    status: 'coming-soon',
    ctaLabel: 'Coming Soon',
  },
]

export const skills = [
  'React',
  'TanStack Start',
  'Next.js',
  'TypeScript',
  'Full-Stack Development',
  'UI Development',
]
