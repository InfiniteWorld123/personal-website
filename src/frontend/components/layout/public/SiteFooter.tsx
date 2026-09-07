import { Link } from '@tanstack/react-router'
import type { ShellCopy } from '#/frontend/content/types'
import { site } from '#/frontend/content/site'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { Container } from './Container'

export function SiteFooter({ copy }: { copy: ShellCopy }) {
  const { language } = useLanguage()
  const year = new Date().getFullYear()

  return (
    <footer className="border-border border-t">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <p className="font-heading text-xl">{site.name}</p>
          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">{copy.footer.tagline}</p>
          <p className="text-muted-foreground text-sm">{copy.footer.location}</p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase rtl:tracking-normal">
            {copy.footer.links}
          </p>
          {copy.nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              params={{ lang: language }}
              className="text-foreground/85 hover:text-foreground w-fit text-sm"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase rtl:tracking-normal">
            {copy.footer.email}
          </p>
          <a href={`mailto:${site.email}`} className="text-foreground/85 hover:text-foreground w-fit text-sm" dir="ltr">
            {site.email}
          </a>
          <a href={site.github} rel="me noreferrer" target="_blank" className="text-foreground/85 hover:text-foreground w-fit text-sm">
            GitHub
          </a>
          <a href={site.linkedin} rel="me noreferrer" target="_blank" className="text-foreground/85 hover:text-foreground w-fit text-sm">
            LinkedIn
          </a>
        </div>
      </Container>

      <Container className="border-border text-muted-foreground flex flex-col gap-2 border-t py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {year} {site.name}
        </p>
        <p>{copy.footer.builtWith}</p>
      </Container>
    </footer>
  )
}
