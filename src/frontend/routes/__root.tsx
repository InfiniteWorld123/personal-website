import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import type { ReactNode } from 'react'
import appCss from '#/frontend/config/styles.css?url'
import { defaultSeo, links, profile, seoImageUrl } from '#/frontend/config/content'
import { ThemeProvider } from '#/frontend/components/theme/theme-provider'
import { LanguageProvider } from '#/frontend/i18n/language-provider'
import { defaultLanguage, directionFor } from '#/frontend/i18n/language'
import { MotionProvider } from '#/frontend/motion'

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
  knowsAbout: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'TanStack Start', 'Elysia.js'],
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
    <html lang={defaultLanguage} dir={directionFor(defaultLanguage)} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
  try {
    const root = document.documentElement;

    const themeStored = localStorage.getItem('theme-preference');
    const preference = themeStored === 'light' || themeStored === 'dark' || themeStored === 'system' ? themeStored : 'system';
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', preference === 'dark' || (preference === 'system' && systemDark));
    root.dataset.themePreference = preference;

    const languageStored = localStorage.getItem('portfolio-language');
    const language = languageStored === 'de' || languageStored === 'en' || languageStored === 'ar' ? languageStored : 'de';
    root.lang = language;
    root.dir = language === 'ar' ? 'rtl' : 'ltr';
  } catch (error) {
    // Blocked storage — the server-rendered defaults stay in place.
  }
})();`,
          }}
        />
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased [overflow-wrap:anywhere] selection:bg-primary/20 selection:text-foreground">
        <ThemeProvider>
          <LanguageProvider>
            <MotionProvider>{children}</MotionProvider>
          </LanguageProvider>
        </ThemeProvider>
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
