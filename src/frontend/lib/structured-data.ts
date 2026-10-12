import type { PublicServiceCard } from '#/backend2/contracts/service.contract'
import { getContent, getServicePrices, getSite, serviceOrder, site } from '#/frontend/content'
import { PLAN_WORDS } from '#/frontend/features/services/service-display'
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
 * What the graph needs to know about a blog post. Like `StructuredProject`,
 * it is passed in by the route that loaded it rather than fetched again.
 */
export type StructuredArticle = {
  title: string
  /** A plain day, `2026-09-12`; the graph states it as a date, not an instant. */
  publishedOn: string
  /** The day of the last real published update, when there was one (Blog V2). */
  updatedOn?: string
  readingMinutes: number
  tags: string[]
}

/**
 * What the graph needs to know about an industry landing page
 * (`/webdesign-erfurt`, `/webdesign-erfurt/<slug>`).
 */
export type StructuredLanding = {
  /** The section's name in the breadcrumb, e.g. "Webdesign Erfurt". */
  section: string
  /** The page's own name in the breadcrumb; absent on the hub. */
  leaf?: string
  /** The service the page sells. */
  service: { name: string; description: string }
  /** The questions shown on the page; empty on the hub. */
  faq: Array<{ question: string; answer: string }>
}

/**
 * What the graph needs to know about a fixed-price package on `/services`.
 * Built from the published cards by `structuredPackagesOf`, so the graph states
 * the same prices the page shows.
 */
export type StructuredPackage = {
  slug: string
  name: string
  summary: string
  /** What buying costs now, in euro cents: the offer price while an offer is on. */
  buyCents: number
  /** The monthly rent in euro cents, when the package can be rented. */
  rentMonthlyCents: number | null
}

/**
 * The fixed-price packages among the published services, for the graph.
 *
 * Only fixed one-time prices: "starting from" and "on request" services have
 * no single price to state. Instalments are left out on purpose — schema.org
 * has no honest shape for "12 payments of 99 € and then it is yours", and a
 * misleading monthly price is worse than none.
 */
export const structuredPackagesOf = (items: PublicServiceCard[]): StructuredPackage[] =>
  items.flatMap((item) => {
    const price = item.price

    if (!price || price.mode !== 'fixed' || price.period !== 'one_time') return []

    return [
      {
        slug: item.slug,
        name: item.name,
        summary: item.summary,
        buyCents: price.promotion ? price.promotion.amountCents : price.amountCents,
        rentMonthlyCents: price.plans?.rent?.monthlyCents ?? null,
      },
    ]
  })

/**
 * The area a local landing page is about: the city and the state, not the
 * whole country the business node states.
 */
const LOCAL_AREA = [
  { '@type': 'City', name: 'Erfurt' },
  { '@type': 'State', name: 'Thüringen' },
]

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
  addressLocality: getSite().city,
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
  const prices = getServicePrices()
  const amounts = serviceOrder.map((slug) => prices[slug]).filter((amount) => amount !== null)
  return `€${Math.min(...amounts)}–€${Math.max(...amounts)}`
}

/**
 * One `Offer` per published service, priced as a starting price, not a fixed
 * one — and without a price where the price is given on request.
 */
const offers = (language: Language) => {
  const { items } = getContent(language).services
  const prices = getServicePrices()

  return serviceOrder.map((slug) => ({
    '@type': 'Offer',
    name: items[slug].name,
    description: items[slug].short,
    url: pageUrl(language, '/services'),
    availability: 'https://schema.org/InStock',
    ...(prices[slug] === null
      ? {}
      : {
          priceSpecification: {
            '@type': 'PriceSpecification',
            minPrice: prices[slug],
            priceCurrency: 'EUR',
          },
        }),
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

/**
 * One `Offer` per package for buying — the main price — and, when it can be
 * rented, one more `Offer` with a monthly `UnitPriceSpecification`
 * (`unitCode` MON is UN/CEFACT "month"). Both point at the same service, and
 * both at `/services#<slug>`: a payment model is not a page of its own.
 */
const packageOffers = (language: Language, packages: StructuredPackage[]) =>
  packages.flatMap((entry) => {
    const url = `${pageUrl(language, '/services')}#${entry.slug}`
    const itemOffered = {
      '@type': 'Service',
      name: entry.name,
      description: entry.summary,
      serviceType: entry.name,
      provider: { '@id': BUSINESS },
      areaServed: AREA_SERVED,
      availableLanguage: spokenLanguages,
    }

    return [
      {
        '@type': 'Offer',
        name: entry.name,
        url,
        availability: 'https://schema.org/InStock',
        priceCurrency: 'EUR',
        price: entry.buyCents / 100,
        itemOffered,
      },
      ...(entry.rentMonthlyCents === null
        ? []
        : [
            {
              '@type': 'Offer',
              name: `${entry.name} (${PLAN_WORDS[language].tabs.mieten})`,
              url,
              availability: 'https://schema.org/InStock',
              priceSpecification: {
                '@type': 'UnitPriceSpecification',
                price: entry.rentMonthlyCents / 100,
                priceCurrency: 'EUR',
                unitCode: 'MON',
              },
              itemOffered,
            },
          ]),
    ]
  })

const siteNodes = (language: Language, packages: StructuredPackage[]) => {
  const { home, shell } = getContent(language)

  return [
    {
      '@type': 'Person',
      '@id': PERSON,
      name: site.name,
      url: pageUrl(language, '/about'),
      image: absolute(site.heroPortrait),
      email: `mailto:${getSite().email}`,
      jobTitle: home.hero.eyebrow,
      description: shell.footer.tagline,
      address: postalAddress,
      knowsLanguage: spokenLanguages,
      knowsAbout: site.knowsAbout,
      // Profiles only: a WhatsApp or Telegram chat link is a way to write, not a page about the person.
      sameAs: getSite()
        .links.filter((link) => link.platform !== 'whatsapp' && link.platform !== 'telegram')
        .map((link) => link.url),
      worksFor: { '@id': BUSINESS },
    },
    {
      '@type': 'ProfessionalService',
      '@id': BUSINESS,
      name: site.name,
      description: shell.footer.tagline,
      url: pageUrl(language, '/'),
      image: absolute(socialCard(language)),
      email: `mailto:${getSite().email}`,
      founder: { '@id': PERSON },
      address: postalAddress,
      areaServed: AREA_SERVED,
      availableLanguage: spokenLanguages,
      priceRange: priceRange(),
      makesOffer: [...offers(language), ...packageOffers(language, packages)],
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

/** An article as a work of its own, linked from the page that renders it. */
const articleNode = (language: Language, path: string, article: StructuredArticle, image: string) => ({
  '@type': 'BlogPosting',
  '@id': `${pageUrl(language, path)}#article`,
  headline: article.title,
  datePublished: article.publishedOn,
  ...(article.updatedOn ? { dateModified: article.updatedOn } : {}),
  inLanguage: localeFor(language),
  image,
  ...(article.tags.length > 0 ? { keywords: article.tags.join(', ') } : {}),
  // Schema.org counts words; the site shows minutes, and 200 words a minute
  // is the same rate `readingMinutes` divides by.
  wordCount: article.readingMinutes * 200,
  author: { '@id': PERSON },
  publisher: { '@id': PERSON },
  isPartOf: { '@id': WEBSITE },
})

const pageType = (path: string, landing: StructuredLanding | undefined) => {
  if (landing) return landing.faq.length > 0 ? 'FAQPage' : 'CollectionPage'
  if (path === '/about') return 'AboutPage'
  if (path === '/contact') return 'ContactPage'
  if (path === '/work') return 'CollectionPage'
  if (path === '/blog') return 'CollectionPage'
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
  article: StructuredArticle | undefined,
  landing: StructuredLanding | undefined,
) => {
  if (path === '/') return null

  const { shell } = getContent(language)
  const [section, slug] = path.split('/').filter(Boolean)
  const sectionPath = `/${section}`
  // Pages outside the main nav have no label to borrow; the part of the
  // <title> before the separator is the page's own short name.
  const sectionLabel =
    landing?.section ??
    shell.nav.find((item) => item.to === `/$lang${sectionPath}`)?.label ??
    title.split(' · ')[0]
  // The leaf reads as the thing itself, not as the page's full <title>.
  const leaf =
    landing?.leaf ?? article?.title ?? projects.find((project) => project.slug === slug)?.name ?? title

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

const mainEntity = (
  language: Language,
  path: string,
  projects: StructuredProject[],
  article: StructuredArticle | undefined,
  image: string,
  landing: StructuredLanding | undefined,
) => {
  if (article) return articleNode(language, path, article, image)
  if (landing && landing.faq.length > 0) {
    return landing.faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    }))
  }

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
  /** Set on a blog post, which is an article rather than a website page. */
  article?: StructuredArticle
  /** Set on an industry landing page. */
  landing?: StructuredLanding
  /** Set on `/services`: the fixed-price packages and their payment models. */
  packages?: StructuredPackage[]
}

/** The local service an industry landing page sells, provided by the business node. */
const landingService = (canonical: string, landing: StructuredLanding) => ({
  '@type': 'Service',
  '@id': `${canonical}#service`,
  name: landing.service.name,
  description: landing.service.description,
  serviceType: 'Webdesign',
  url: canonical,
  provider: { '@id': BUSINESS },
  areaServed: LOCAL_AREA,
  availableLanguage: spokenLanguages,
})

/** The `@graph` for one public page, ready to be serialised into a script tag. */
export function buildStructuredData({
  language,
  path,
  title,
  description,
  canonical,
  image,
  projects = [],
  article,
  landing,
  packages = [],
}: PageInput) {
  const entity = mainEntity(language, path, projects, article, image, landing)
  const trail = breadcrumb(language, path, title, projects, article, landing)

  const page = {
    '@type': pageType(path, landing),
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
      ...siteNodes(language, packages),
      page,
      ...(trail ? [{ ...trail, '@id': `${canonical}#breadcrumb` }] : []),
      ...(landing ? [landingService(canonical, landing)] : []),
    ],
  }
}
