import { HeadContent, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import type { ReactNode } from 'react'
import appCss from '#/frontend/config/styles.css?url'
import { ThemeProvider } from '#/frontend/components/theme/theme-provider'
import { THEME_STORAGE_KEY } from '#/frontend/components/theme/theme'
import { site } from '#/frontend/content/site'
import { LanguageProvider } from '#/frontend/i18n/language-provider'
import { defaultLanguage, directionFor, languageFromPathname } from '#/frontend/i18n/language'
import { MOTION_BOOT_SCRIPT, useMotionPreference } from '#/frontend/motion'
import { NotFoundPage } from '#/frontend/pages/public/NotFoundPage'

const personStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: site.name,
  url: site.url,
  image: `${site.url}${site.heroPortrait}`,
  email: `mailto:${site.email}`,
  address: { '@type': 'PostalAddress', addressLocality: site.city, addressCountry: site.country },
  sameAs: [site.github, site.linkedin],
}

/**
 * Applies the stored theme before first paint so there is no flash. Language
 * needs no script: it comes from the URL and is rendered on the server.
 */
const themeBootScript = `(() => {
  try {
    const root = document.documentElement;
    const stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    const preference = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', preference === 'dark' || (preference === 'system' && systemDark));
    root.dataset.themePreference = preference;
  } catch (error) {}
})();`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'author', content: site.name },
      { name: 'theme-color', content: '#f5f6f8', media: '(prefers-color-scheme: light)' },
      { name: 'theme-color', content: '#0c111c', media: '(prefers-color-scheme: dark)' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
    scripts: [{ type: 'application/ld+json', children: JSON.stringify(personStructuredData) }],
  }),
  shellComponent: RootDocument,
  notFoundComponent: () => <NotFoundPage />,
})

function RootDocument({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const language = languageFromPathname(pathname) ?? defaultLanguage

  useMotionPreference()

  return (
    <html lang={language} dir={directionFor(language)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="min-h-screen">
        <ThemeProvider>
          <LanguageProvider>
            {children}
          </LanguageProvider>
        </ThemeProvider>
        {import.meta.env.DEV ? (
          <TanStackDevtools
            config={{ position: 'bottom-right' }}
            plugins={[{ name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> }]}
          />
        ) : null}
        <Scripts />
      </body>
    </html>
  )
}
