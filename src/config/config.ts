export type ProjectStatus = 'live' | 'coming-soon' | 'placeholder'

export interface Project {
  title: string
  eyebrow: string
  description: string
  href?: string
  status: ProjectStatus
  ctaLabel: string
  tags: string[]
}

interface AboutHighlight {
  title: string
  description: string
}

interface NavigationItem {
  label: string
  href: `#${string}`
}

export const navigation: NavigationItem[] = [
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'Projects', href: '#projects' },
  { label: 'Contact', href: '#contact' },
]

export const profile = {
  initials: 'YW',
  name: 'Yaman Warda',
  greeting: "Hi, I'm Yaman Warda.",
  headline: 'Self-taught Full-Stack Developer',
  heroLines: ['FULL-STACK', 'DEVELOPER'],
  heroPrefix: 'Self-taught',
  location: 'Erfurt, Germany',
  lead:
    'I build simple, thoughtful digital products with a strong foundation first. Right now I care more about understanding how things work than locking myself into one stack forever.',
  about: [
    "I'm a self-taught developer who learned by trying a lot of things, shipping what I could, and staying curious long enough to get better. Tools have changed over time, but the mindset stayed the same: learn deeply, then build.",
    "Today I'm strongest in React and TanStack Start, but I want the site to reflect something bigger than a framework list. I'm building my own direction, and I'm open to meaningful collaborations with people who connect with the way I think and create.",
  ],
  closing:
    'Outside of programming, sport keeps me balanced. That mix of discipline, curiosity, and consistency is part of how I work.',
}

export const aboutHighlights: AboutHighlight[] = [
  {
    title: 'Foundation First',
    description:
      'I care about understanding principles so I can move between tools without losing momentum.',
  },
  {
    title: 'Learning by Building',
    description:
      'My best progress has always come from shipping real projects and refining them in public.',
  },
  {
    title: 'Balanced Energy',
    description:
      'Programming and sport are both part of my rhythm, which keeps the work sharp and grounded.',
  },
]

export const links = {
  github: 'https://github.com/InfiniteWorld123',
  email: 'yamanwarda06@gmail.com',
  formEndpoint: '',
}

export const projects: Project[] = [
  {
    title: 'StoryNest',
    eyebrow: 'Featured build',
    description:
      'A storytelling project centered on atmosphere, reading flow, and a more intentional product experience.',
    href: 'https://github.com/InfiniteWorld123/storynest',
    status: 'live',
    ctaLabel: 'Open GitHub',
    tags: ['React', 'Product UI', 'Storytelling'],
  },
  {
    title: 'Tech Store',
    eyebrow: 'Work in progress',
    description:
      'A clean e-commerce concept exploring storefront UX, product structure, and full-stack thinking.',
    href: 'https://github.com/InfiniteWorld123/tech-store',
    status: 'coming-soon',
    ctaLabel: 'Coming soon',
    tags: ['E-commerce', 'Full-Stack', 'In progress'],
  },
  {
    title: 'Next Project',
    eyebrow: 'Reserved slot',
    description:
      'A placeholder for the next project you want to feature once it is ready to be shown publicly.',
    status: 'placeholder',
    ctaLabel: 'Reserved',
    tags: ['Soon', 'New build', 'Placeholder'],
  },
]

export const skills = ['React', 'TanStack Start', 'Next.js', 'TypeScript', 'UI Development']
