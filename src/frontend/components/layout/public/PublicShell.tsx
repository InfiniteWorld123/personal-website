import type { ReactNode } from 'react'
import { getContent } from '#/frontend/content'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'

export function PublicShell({ children }: { children: ReactNode }) {
  const { language } = useLanguage()
  const { shell } = getContent(language)

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader copy={shell} />
      <main className="flex-1">{children}</main>
      <SiteFooter copy={shell} />
    </div>
  )
}
