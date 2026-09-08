import { useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { getContent } from '#/frontend/content'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { useMagneticButtons } from '#/frontend/motion'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'

export function PublicShell({ children }: { children: ReactNode }) {
  const { language } = useLanguage()
  const { shell } = getContent(language)
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  useMagneticButtons()

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader copy={shell} />
      {/* Keyed on the path, not the search: paging through Arbeiten should
          not replay the page entrance. */}
      <main key={pathname} className="route-fade flex-1">
        {children}
      </main>
      <SiteFooter copy={shell} />
    </div>
  )
}
