import { getContent, serviceOrder, servicePrices, site } from '#/frontend/content'
import { type Language, languages, localeFor } from '#/frontend/i18n/language'
import { absolute, pageUrl, socialCard } from './url'

/**
 * What the graph needs to know about a project. Passed in by the route that
 * loaded it, because projects live in the database now and the head is built
 * from the same data the page renders.
 */
export type StructuredProject = {
  slug: string
  name: string
  kind: string
  summary: string
  stack: string[]
  website: string | null
  source: string | null
}

/**
 * JSON-LD for the public pages. Every page carries the same three stable
 * nodes — the person, the one-man business, and the website — plus a node
 * for the page itself. Google merges nodes by `@id`, so the identity is
 * stated once and referenced everywhere.
 */

const PERSON = `${site.url}/#person`
const BUSINESS = `${site.url}/#business`
const WEBSITE = `${site.url}/#website`

const postalAddress = {
  '@type': 'PostalAddress',
  addressLocality: site.city,
  addressRegion: 'Thüringen',
  addressCountry: site.country,
}

const spokenLanguages = languages.map((language) => localeFor(language))

/**
 * Germany is where the work is based and most clients are; the remote half of
 * the practice is stated too, so search engines outside Germany do not read
 * this as a Germany-only business.
 */
const AREA_SERVED = [{ '@type': 'Country', name: 'Germany' }, 'Worldwide (remote)']

const priceRange = () => {
  const amounts = serviceOrder.map((slug) => servicePrices[slug])
  return `€${Math.min(...amounts)}–€${Math.max(...amounts)}`
}

/** One `Offer` per published service, priced as a starting price, not a fixed one. */
const offers = (language: Language) => {
  const { items } = getContent(language).services

  return serviceOrder.map((slug) => ({
    '@type': 'Offer',
    name: items[slug].name,
    description: items[slug].short,
    url: pageUrl(language, '/services'),
    availability: 'https://schema.org/InStock',
    priceSpecification: {
      '@type': 'PriceSpecification',
      minPrice: servicePrices[slug],
      priceCurrency: 'EUR',
    },
    itemOffered: {
      '@type': 'Service',
      name: items[slug].name,
      description: items[slug].promise,
      serviceType: items[slug].name,
      provider: { '@id': BUSINESS },
      areaServed: AREA_SERVED,
      availableLanguage: spokenLanguages,
    },
  }))
}

const siteNodes = (language: Language) => {
  const { home, shell } = getContent(language)

  return [
    {
      '@type': 'Person',
      '@id': PERSON,
      name: site.name,
      url: pageUrl(language, '/about'),
      image: absolute(site.heroPortrait),
      email: `mailto:${site.email}`,
      jobTitle: home.hero.eyebrow,
      description: shell.footer.tagline,
      address: postalAddress,
      knowsLanguage: spokenLanguages,
      knowsAbout: site.knowsAbout,
      sameAs: [site.github, site.linkedin],
      worksFor: { '@id': BUSINESS },
    },
    {
      '@type': 'ProfessionalService',
      '@id': BUSINESS,
      name: site.name,
      description: shell.footer.tagline,
      url: pageUrl(language, '/'),
      image: absolute(socialCard(language)),
      email: `mailto:${site.email}`,
      founder: { '@id': PERSON },
      address: postalAddress,
      areaServed: AREA_SERVED,
      availableLanguage: spokenLanguages,
      priceRange: priceRange(),
      makesOffer: offers(language),
    },
    {
      '@type': 'WebSite',
      '@id': WEBSITE,
      url: site.url,
      name: site.name,
      description: shell.footer.tagline,
      inLanguage: localeFor(language),
      publisher: { '@id': PERSON },
    },
  ]
}

/** A project as a work of its own, linked from its detail page. */
const projectNode = (language: Language, project: StructuredProject) => ({
  '@type': 'CreativeWork',
  '@id': `${pageUrl(language, `/work/${project.slug}`)}#project`,
  name: project.name,
  description: project.summary,
  abstract: project.kind,
  inLanguage: localeFor(language),
  keywords: project.stack.join(', '),
  author: { '@id': PERSON },
  creator: { '@id': PERSON },
  ...(project.website ? { url: project.website } : {}),
  ...(project.source ? { codeRepository: project.source } : {}),
})

const pageType = (path: string) => {
  if (path === '/about') return 'AboutPage'
  if (path === '/contact') return 'ContactPage'
  if (path === '/work') return 'CollectionPage'
  if (path === '/faq') return 'FAQPage'
  return 'WebPage'
}

/**
 * Home → section → page. Built from the same nav labels the header shows, so
 * the trail always matches what a visitor reads.
 */
const breadcrumb = (
  language: Language,
  path: string,
  title: string,
  projects: StructuredProject[],
) => {
  if (path === '/') return null

  const { shell } = getContent(language)
  const [section, slug] = path.split('/').filter(Boolean)
  const sectionPath = `/${section}`
  // Pages outside the main nav have no label to borrow; the part of the
  // <title> before the separator is the page's own short name.
  const sectionLabel =
    shell.nav.find((item) => item.to === `/$lang${sectionPath}`)?.label ?? title.split(' · ')[0]
  // The leaf reads as the thing itself, not as the page's full <title>.
  const leaf = projects.find((project) => project.slug === slug)?.name ?? title

  const trail = [
    { name: site.name, item: pageUrl(language, '/') },
    { name: sectionLabel, item: pageUrl(language, sectionPath) },
    ...(slug ? [{ name: leaf, item: pageUrl(language, path) }] : []),
  ]

  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: entry.item,
    })),
  }
}

/** Every published question, flattened out of its group. */
const faqQuestions = (language: Language) =>
  getContent(language).faq.groups.flatMap((group) =>
    group.items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  )

const mainEntity = (language: Language, path: string, projects: StructuredProject[]) => {
  if (path === '/about') return { '@id': PERSON }
  if (path === '/contact') return { '@id': BUSINESS }
  if (path === '/faq') return faqQuestions(language)

  if (path === '/work') {
    return {
      '@type': 'ItemList',
      itemListElement: projects.map((project, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: pageUrl(language, `/work/${project.slug}`),
        name: project.name,
      })),
    }
  }

  const [section, slug] = path.split('/').filter(Boolean)

  if (section === 'work' && slug) {
    const project = projects.find((entry) => entry.slug === slug)

    return project ? projectNode(language, project) : null
  }

  return null
}

type PageInput = {
  language: Language
  /** Path without the language segment, e.g. `/services`. `/` for the home page. */
  path: string
  title: string
  description: string
  canonical: string
  image: string
  /** The projects this page is about; empty for every page that has none. */
  projects?: StructuredProject[]
}

/** The `@graph` for one public page, ready to be serialised into a script tag. */
export function buildStructuredData({
  language,
  path,
  title,
  description,
  canonical,
  image,
  projects = [],
}: PageInput) {
  const entity = mainEntity(language, path, projects)
  const trail = breadcrumb(language, path, title, projects)

  const page = {
    '@type': pageType(path),
    '@id': canonical,
    url: canonical,
    name: title,
    description,
    inLanguage: localeFor(language),
    isPartOf: { '@id': WEBSITE },
    about: { '@id': PERSON },
    primaryImageOfPage: image,
    ...(entity ? { mainEntity: entity } : {}),
    ...(trail ? { breadcrumb: { '@id': `${canonical}#breadcrumb` } } : {}),
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      ...siteNodes(language),
      page,
      ...(trail ? [{ ...trail, '@id': `${canonical}#breadcrumb` }] : []),
    ],
  }
}
