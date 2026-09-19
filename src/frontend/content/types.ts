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
    /** Impressum and Datenschutz, in the bottom bar as German sites put them. */
    legal: Array<{ label: string; to: string }>
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
    /**
     * The home page's own card descriptions. Shorter and warmer than the
     * summaries on `/services`, which keep using `ServiceCopy.short`.
     */
    cards: Record<ServiceSlug, string>
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
  /** Professional thinking in chapters rather than a private biography. */
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

/**
 * The blog's own furniture — everything around an article that is written
 * once per language rather than once per post. The articles themselves live
 * in the database, three translations each (D23).
 */
export type BlogCopy = {
  meta: PageMeta
  eyebrow: string
  title: string
  intro: string
  empty: string
  /** Clears the tag filter on the archive. */
  allTags: string
  /** Carries `{minutes}`. */
  readingTime: string
  readArticle: string
  loadMore: string
  back: string
  /** Carries `{project}`; shown when an article is about a case study. */
  aboutProject: string
  seeProject: string
  /** Carries `{visible}` and `{total}`. */
  shown: string
  feed: string
  /**
   * Reads and likes.
   *
   * "Reads", never "readers": no row records who opened the article, so the
   * figure counts openings and the word has to be honest about that.
   *
   * Two forms each, because "1 Aufrufe" is not German and "1 reads" is not
   * English. `Intl.PluralRules` picks between them, so a language whose rule
   * is not one-versus-many still lands on a form somebody wrote rather than on
   * a number glued to a plural noun. All four carry `{count}`.
   */
  reads: string
  readsOne: string
  likes: string
  likesOne: string
  /** The button, before and after this browser has pressed it. */
  like: string
  liked: string
  /** The latest-articles section on the home page. */
  home: { eyebrow: string; title: string; sub: string; all: string }
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
    projectType: string
    projectTypes: Array<{ value: string; label: string }>
    budget: string
    budgets: Array<{ value: string; label: string }>
    timeline: string
    timelineHint: string
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
  built: { title: string; body: string; link: string }
  links: { title: string; email: string }
}

/**
 * One legal document. Sections carry either a paragraph or a list of lines
 * (an address, a set of rights), never both.
 */
export type LegalCopy = {
  meta: PageMeta
  eyebrow: string
  title: string
  intro: string
  sections: Array<{ title: string; body?: string; lines?: string[] }>
  updated: string
}

export type SiteContent = {
  shell: ShellCopy
  home: HomeCopy
  services: ServicesCopy
  about: AboutCopy
  work: WorkCopy
  blog: BlogCopy
  contact: ContactCopy
  faq: FaqCopy
  stack: StackCopy
  legal: { impressum: LegalCopy; privacy: LegalCopy }
  notFound: { title: string; body: string; link: string }
}
