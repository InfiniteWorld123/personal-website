import {
  getContent,
  isProjectSlug,
  projectOrder,
  projects,
  serviceOrder,
  servicePrices,
  site,
} from '#/frontend/content'
import type { ProjectFacts } from '#/frontend/content/site'
import { type Language, languages, localeFor } from '#/frontend/i18n/language'
import { absolute, pageUrl, socialCard } from './url'

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
const projectNode = (language: Language, slug: string) => {
  if (!isProjectSlug(slug)) return null

  const { work } = getContent(language)
  const copy = work.items[slug]
  const facts: ProjectFacts = projects[slug]

  return {
    '@type': 'CreativeWork',
    '@id': `${pageUrl(language, `/work/${slug}`)}#project`,
    name: copy.name,
    description: copy.summary,
    abstract: copy.kind,
    inLanguage: localeFor(language),
    keywords: facts.stack.join(', '),
    author: { '@id': PERSON },
    creator: { '@id': PERSON },
    ...(facts.website ? { url: facts.website } : {}),
    ...(facts.source ? { codeRepository: facts.source } : {}),
  }
}

const pageType = (path: string) => {
  if (path === '/about') return 'AboutPage'
  if (path === '/contact') return 'ContactPage'
  if (path === '/work') return 'CollectionPage'
  return 'WebPage'
}

/**
 * Home → section → page. Built from the same nav labels the header shows, so
 * the trail always matches what a visitor reads.
 */
const breadcrumb = (language: Language, path: string, title: string) => {
  if (path === '/') return null

  const { shell, work } = getContent(language)
  const [section, slug] = path.split('/').filter(Boolean)
  const sectionPath = `/${section}`
  const sectionLabel = shell.nav.find((item) => item.to === `/$lang${sectionPath}`)?.label ?? title
  // The leaf reads as the thing itself, not as the page's full <title>.
  const leaf = slug && isProjectSlug(slug) ? work.items[slug].name : title

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

const mainEntity = (language: Language, path: string) => {
  if (path === '/about') return { '@id': PERSON }
  if (path === '/contact') return { '@id': BUSINESS }

  if (path === '/work') {
    return {
      '@type': 'ItemList',
      itemListElement: projectOrder.map((slug, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: pageUrl(language, `/work/${slug}`),
        name: getContent(language).work.items[slug].name,
      })),
    }
  }

  const [section, slug] = path.split('/').filter(Boolean)
  if (section === 'work' && slug) return projectNode(language, slug)

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
}

/** The `@graph` for one public page, ready to be serialised into a script tag. */
export function buildStructuredData({
  language,
  path,
  title,
  description,
  canonical,
  image,
}: PageInput) {
  const entity = mainEntity(language, path)
  const trail = breadcrumb(language, path, title)

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
