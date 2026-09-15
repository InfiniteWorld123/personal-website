import { Link } from '@tanstack/react-router'
import type { ShellCopy } from '#/frontend/content/types'
import { getSite } from '#/frontend/content'
import { getBookingEntryCopy } from '#/frontend/features/booking/booking-entry-copy'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { BrandMark } from './BrandMark'
import { Container } from './Container'

export function SiteFooter({ copy }: { copy: ShellCopy }) {
  const { language } = useLanguage()
  const entry = getBookingEntryCopy(language)
  const facts = getSite()
  const year = new Date().getFullYear()

  return (
    <footer className="border-border border-t">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <p className="inline-flex items-center gap-2.5 text-[0.8rem] font-bold uppercase tracking-widest text-foreground"><BrandMark size={26} />{facts.name}</p>
          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">{copy.footer.tagline}</p>
          <p className="text-muted-foreground text-sm">{copy.footer.location}</p>
        </div>

        {/* The two doors, where a visitor who read to the end expects them.
            A list entry, not a button: the page has already made its ask. */}
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase rtl:tracking-normal">
            {entry.footer.title}
          </p>
          <Link
            to="/$lang/booking"
            params={{ lang: language }}
            className="text-primary w-fit text-sm font-semibold"
          >
            {entry.footer.book}
          </Link>
          <Link
            to="/$lang/contact"
            params={{ lang: language }}
            className="text-foreground/85 hover:text-foreground w-fit text-sm"
          >
            {entry.footer.write}
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase rtl:tracking-normal">
            {copy.footer.links}
          </p>
          {[...copy.nav, ...copy.footer.more].map((item) => (
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
          <a href={`mailto:${facts.email}`} className="text-foreground/85 hover:text-foreground w-fit text-sm" dir="ltr">
            {facts.email}
          </a>
          {facts.phone ? (
            <a href={`tel:${facts.phone.replace(/[^+\d]/g, '')}`} className="text-foreground/85 hover:text-foreground w-fit text-sm" dir="ltr">
              {facts.phone}
            </a>
          ) : null}
          <a href={facts.github} rel="me noreferrer" target="_blank" className="text-foreground/85 hover:text-foreground w-fit text-sm">
            GitHub
          </a>
          <a href={facts.linkedin} rel="me noreferrer" target="_blank" className="text-foreground/85 hover:text-foreground w-fit text-sm">
            LinkedIn
          </a>
        </div>
      </Container>

      <Container className="border-border text-muted-foreground flex flex-col gap-2 border-t py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {year} {facts.name}
        </p>
        <nav className="flex flex-wrap gap-x-5 gap-y-1" aria-label={copy.footer.links}>
          {copy.footer.legal.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              params={{ lang: language }}
              className="hover:text-foreground w-fit"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <p>{copy.footer.builtWith}</p>
      </Container>
    </footer>
  )
}
