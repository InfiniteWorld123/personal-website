import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import type { ReactNode } from 'react'
import appCss from '../styles.css?url'
import { profile } from '../config/config'

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
        title: `${profile.name} | ${profile.headline}`,
      },
      {
        name: 'description',
        content:
          'A simple portfolio for Yaman Warda, a self-taught full-stack developer based in Erfurt, Germany.',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
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
