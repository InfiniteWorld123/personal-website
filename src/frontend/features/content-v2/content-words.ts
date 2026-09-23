import type { ContentFieldDefinition, ContentLanguage, ContentSlot, ContentValue } from '#/backend2/contracts/content.contract'

/**
 * How the Content editor names things, in the owner's words rather than the
 * registry's keys. `home.story.steps.0.title` is "How it works › Step 1 ›
 * Title"; the key itself is still shown, small, for anyone who needs it.
 */

export const PAGE_NAME: Record<string, string> = {
  home: 'Home',
  services: 'Services page',
  work: 'Work page',
  about: 'About',
  blog: 'Blog page',
  faq: 'FAQ',
  contact: 'Contact',
  stack: 'Stack',
  legal: 'Legal',
  shell: 'Header & footer',
  notFound: 'Page not found',
  site: 'Site facts',
}

/** The public address each page is previewed at. */
export const PAGE_PATH: Record<string, string> = {
  home: '',
  services: '/services',
  work: '/work',
  about: '/about',
  blog: '/blog',
  faq: '/faq',
  contact: '/contact',
  stack: '/stack',
  legal: '/impressum',
  shell: '',
  notFound: '/…',
  site: '/contact',
}

export const LANGUAGE_NAME: Record<ContentSlot, string> = {
  de: 'German',
  en: 'English',
  ar: 'Arabic',
  shared: 'all languages',
}

const WORDS: Record<string, string> = {
  meta: 'Search result', header: 'Page top', hero: 'Hero', story: 'How it works', services: 'Services',
  work: 'Work', process: 'Process', fit: 'Who it fits', about: 'About', cta: 'Call to action',
  shared: 'Shared rules', method: 'Method', expect: 'What to expect', platform: 'Platform',
  aside: 'Beside the form', groups: 'Questions', built: 'Built with', links: 'Links',
  impressum: 'Impressum', privacy: 'Privacy policy', footer: 'Footer', facts: 'Your details',
  home: 'Homepage section', title: 'Title', description: 'Description', eyebrow: 'Small line above',
  sub: 'Text under the title', intro: 'Introduction', body: 'Text', typed: 'Rotating words',
  staticLine: 'Word after them', headline: 'Headline', greeting: 'Greeting', prefix: 'Line above',
  secondary: 'Second button', availability: 'Portrait badge', button: 'Button', alt: 'Second link',
  link: 'Link text', label: 'Label', steps: 'Step', items: 'Item', chapters: 'Chapter',
  paragraphs: 'Paragraphs', sections: 'Section', lines: 'Lines', question: 'Question', answer: 'Answer',
  demo: 'Demo', notes: 'Notes', navigation: 'Tabs', caption: 'Caption', project: 'Project',
  request: 'Request', appointment: 'Appointment', confirmed: 'Confirmed', action: 'Action',
  forTitle: 'Fits — title', forItems: 'Fits — points', notForTitle: 'Does not fit — title',
  notForItems: 'Does not fit — points', honesty: 'Honest note', portraitAlt: 'Portrait description',
  layers: 'Layer', value: 'Value', updated: 'Last updated', tagline: 'Tagline', location: 'Location',
  email: 'Email', builtWith: 'Built-with line', faqLink: 'FAQ link', emailLabel: 'Email label',
  locationLabel: 'Location label', languagesLabel: 'Languages label', languages: 'Languages',
  all: 'All-link', phone: 'Phone number', city: 'City', github: 'GitHub link', linkedin: 'LinkedIn link',
}

const word = (part: string) =>
  WORDS[part] ?? part.replace(/([A-Z])/g, ' $1').replace(/^./, (first) => first.toUpperCase())

export const fieldLabel = (field: Pick<ContentFieldDefinition, 'key' | 'section'>): string => {
  const parts = field.key.replace(/\[\]$/u, '').split('.').slice(1)
  const out: string[] = []

  parts.forEach((part, index) => {
    if (/^\d+$/u.test(part) && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]} ${Number(part) + 1}`
      return
    }
    // The section is already the heading above the field.
    if (index === 0 && parts.length > 1 && part === field.section) return
    out.push(word(part))
  })

  return out.join(' › ') || word(field.section)
}

export const sectionLabel = (section: string) => (section === 'header' ? 'Page top' : word(section))

export const slotOf = (field: ContentFieldDefinition, language: ContentLanguage): ContentSlot =>
  field.shared ? 'shared' : language

export const asText = (value: ContentValue): string =>
  Array.isArray(value) ? value.join(' · ') : value === '' ? '(empty)' : value

export const directionOf = (slot: ContentSlot) => (slot === 'ar' ? 'rtl' : 'ltr')

/** "Just now", "12 min ago", "Today 09:15", "21 Sep, 10:12" — Berlin time. */
export const whenText = (iso: string, now = Date.now()): string => {
  const at = new Date(iso).getTime()
  const minutes = Math.round((now - at) / 60_000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`

  const zone = { timeZone: 'Europe/Berlin' } as const
  const time = new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...zone })
  const day = (value: number) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...zone })

  return day(at) === day(now) ? `Today ${time}` : `${day(at)}, ${time}`
}
