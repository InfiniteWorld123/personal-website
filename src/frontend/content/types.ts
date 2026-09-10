/**
 * Shape of the public site's copy. One object per language in `de.ts`,
 * `en.ts`, `ar.ts`. Structure and section order live in code; the text here
 * is the set of keys that becomes editable from the admin in B6.
 */

export type ServiceSlug = 'websites' | 'shopify' | 'software'

export type ProjectSlug = keyof typeof import('./site').projects

export type Link = { label: string; to: string }

export type ShellCopy = {
  nav: Array<{ label: string; to: string }>
  cta: string
  menu: { open: string; close: string; navigation: string }
  language: { label: string; names: Record<'de' | 'en' | 'ar', string> }
  theme: { light: string; dark: string; system: string; label: string }
  footer: {
    tagline: string
    location: string
    email: string
    links: string
    builtWith: string
    /**
     * Pages the footer carries but the header does not: they answer a
     * question a visitor already has rather than selling anything, so
     * putting them in the main nav would only dilute it.
     */
    more: Array<{ label: string; to: string }>
  }
}

export type PageMeta = { title: string; description: string }

export type HomeCopy = {
  meta: PageMeta
  hero: {
    eyebrow: string
    greeting: string
    /** Small uppercase line above the display words. */
    prefix: string
    /** Words that type in and out before `staticLine`. */
    typed: string[]
    staticLine: string
    /** One bold sentence under the display line. */
    headline: string
    sub: string
    cta: string
    secondary: string
    /** Shown on the portrait. Only ever set while it is actually true. */
    availability: string
  }
  story: {
    eyebrow: string
    title: string
    sub: string
    steps: Array<{ label: string; title: string; body: string }>
    demo: {
      caption: string
      project: string
      notes: string[]
      navigation: string[]
      request: string
      appointment: string
      confirmed: string
      action: string
    }
  }
  services: {
    eyebrow: string
    title: string
    sub: string
    more: string
  }
  work: {
    eyebrow: string
    title: string
    sub: string
    all: string
  }
  process: {
    eyebrow: string
    title: string
    sub: string
    steps: Array<{ title: string; body: string }>
  }
  fit: {
    eyebrow: string
    title: string
    forTitle: string
    forItems: string[]
    notForTitle: string
    notForItems: string[]
    honesty: string
  }
  about: {
    eyebrow: string
    title: string
    body: string
    link: string
  }
  cta: {
    title: string
    body: string
    button: string
    alt: string
  }
}

export type ServiceCopy = {
  name: string
  short: string
  promise: string
  audienceTitle: string
  audience: string[]
  includesTitle: string
  includes: string[]
  priceTitle: string
  price: string
  priceNote: string
  boundaryTitle: string
  boundary: string
}

export type ServicesCopy = {
  meta: PageMeta
  eyebrow: string
  title: string
  intro: string
  from: string
  items: Record<ServiceSlug, ServiceCopy>
  shared: {
    title: string
    items: Array<{ title: string; body: string }>
    /** Sends the reader on to the FAQ, where the rest of the rules are. */
    faqLink: string
  }
  cta: { title: string; body: string; button: string }
}

export type AboutCopy = {
  meta: PageMeta
  eyebrow: string
  title: string
  intro: string
  /**
   * The personal story, in chapters rather than one run of paragraphs.
   * Every chapter carries at least one checkable fact — a year, a place, a
   * tool — because a story without them reads as filler.
   */
  story: { title: string; chapters: Array<{ title: string; paragraphs: string[] }> }
  method: { title: string; items: Array<{ title: string; body: string }> }
  /** What a client gets from working with one person, stated plainly. */
  expect: { title: string; intro: string; items: Array<{ title: string; body: string }> }
  platform: { title: string; body: string; link: string }
  portraitAlt: string
  cta: { title: string; body: string; button: string; alt: string }
}

export type ProjectCopy = {
  name: string
  kind: string
  summary: string
  problem: string
  approach: string
  shows: string
  features: string[]
}

export type WorkCopy = {
  meta: PageMeta
  eyebrow: string
  title: string
  intro: string
  status: { live: string; building: string }
  visit: string
  source: string
  detailLabel: string
  previous: string
  next: string
  loadMore: string
  empty: string
  shown: string
  back: string
  detail: {
    problem: string
    approach: string
    shows: string
    features: string
    stack: string
  }
  items: Record<ProjectSlug, ProjectCopy>
}

export type ContactCopy = {
  meta: PageMeta
  eyebrow: string
  title: string
  intro: string
  form: {
    name: string
    email: string
    company: string
    companyOptional: string
    phone: string
    phoneOptional: string
    preferred: string
    preferredOptions: Array<{ value: string; label: string }>
    projectType: string
    projectTypes: Array<{ value: string; label: string }>
    budget: string
    budgets: Array<{ value: string; label: string }>
    timeline: string
    timelines: Array<{ value: string; label: string }>
    message: string
    messageHint: string
    attachment: string
    attachmentHint: string
    attachmentChoose: string
    attachmentEmpty: string
    attachmentRemove: string
    submit: string
    sending: string
    sent: { title: string; body: string }
    error: string
    errors: { name: string; email: string; message: string; attachment: string }
  }
  aside: {
    title: string
    body: string
    emailLabel: string
    locationLabel: string
    location: string
    languagesLabel: string
    languages: string
  }
}

/**
 * The objections a buyer has at this deal size, answered in the open.
 * Grouped so the page can be scanned rather than read start to finish, and
 * emitted as `FAQPage` structured data.
 */
export type FaqCopy = {
  meta: PageMeta
  eyebrow: string
  title: string
  intro: string
  groups: Array<{
    title: string
    items: Array<{ question: string; answer: string }>
  }>
}

/**
 * The hiring audience, kept apart from every selling page. Architecture and
 * trade-offs here; outcomes and prices there. A buyer reading this leaves,
 * and so does a hiring manager reading service packages.
 */
export type StackCopy = {
  meta: PageMeta
  eyebrow: string
  title: string
  intro: string
  platform: {
    title: string
    body: string
    layers: Array<{ label: string; value: string }>
  }
  decisions: {
    title: string
    intro: string
    /** Each decision names the alternative it beat and the price it charged. */
    items: Array<{ title: string; body: string; costLabel: string; cost: string }>
  }
  built: { title: string; body: string; link: string }
  links: { title: string; email: string }
}

export type SiteContent = {
  shell: ShellCopy
  home: HomeCopy
  services: ServicesCopy
  about: AboutCopy
  work: WorkCopy
  contact: ContactCopy
  faq: FaqCopy
  stack: StackCopy
  notFound: { title: string; body: string; link: string }
}
