import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import type { ReactNode } from 'react'
import appCss from '../styles.css?url'
import { defaultLanguage, defaultSeo, links, profile, seoImageUrl } from '../config/config'

const canonicalUrl = links.siteUrl
const defaultKeywords = defaultSeo.keywords.join(', ')
const personStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: profile.name,
  url: canonicalUrl,
  image: seoImageUrl,
  jobTitle: profile.headline,
  email: `mailto:${links.email}`,
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Erfurt',
    addressCountry: 'DE',
  },
  sameAs: ['https://github.com/InfiniteWorld123', 'https://linkedin.com/in/yaman-warda'],
  knowsAbout: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'TanStack Start', 'Hono.js'],
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: defaultSeo.title,
      },
      {
        name: 'description',
        content: defaultSeo.description,
      },
      {
        name: 'keywords',
        content: defaultKeywords,
      },
      {
        name: 'author',
        content: profile.name,
      },
      {
        name: 'creator',
        content: profile.name,
      },
      {
        name: 'robots',
        content: 'index, follow',
      },
      {
        name: 'theme-color',
        content: '#ffffff',
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        property: 'og:url',
        content: canonicalUrl,
      },
      {
        property: 'og:title',
        content: defaultSeo.title,
      },
      {
        property: 'og:description',
        content: defaultSeo.description,
      },
      {
        property: 'og:site_name',
        content: profile.name,
      },
      {
        property: 'og:locale',
        content: 'de_DE',
      },
      {
        property: 'og:image',
        content: seoImageUrl,
      },
      {
        property: 'og:image:alt',
        content: defaultSeo.imageAlt,
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
      {
        name: 'twitter:title',
        content: defaultSeo.title,
      },
      {
        name: 'twitter:description',
        content: defaultSeo.description,
      },
      {
        name: 'twitter:image',
        content: seoImageUrl,
      },
      {
        name: 'twitter:image:alt',
        content: defaultSeo.imageAlt,
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'canonical',
        href: canonicalUrl,
      },
      {
        rel: 'manifest',
        href: '/manifest.json',
      },
      {
        rel: 'icon',
        href: '/favicon.ico',
      },
      {
        rel: 'alternate',
        hrefLang: defaultLanguage,
        href: canonicalUrl,
      },
      {
        rel: 'alternate',
        hrefLang: 'x-default',
        href: canonicalUrl,
      },
    ],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify(personStructuredData),
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
  const key = 'theme-preference';
  const stored = localStorage.getItem(key);
  const preference = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', preference === 'dark' || (preference === 'system' && systemDark));
  document.documentElement.dataset.themePreference = preference;
})();`,
          }}
        />
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased [overflow-wrap:anywhere] selection:bg-primary/20 selection:text-foreground">
        {children}
        {import.meta.env.DEV ? (
          <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        ) : null}
        <Scripts />
      </body>
    </html>
  )
}
