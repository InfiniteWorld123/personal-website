import { Link } from '@tanstack/react-router'
import { Phone } from 'lucide-react'
import { linkName } from '#/backend2/contracts/content.contract'
import type { ShellCopy } from '#/frontend/content/types'
import { getSite } from '#/frontend/content'
import { getBookingEntryCopy } from '#/frontend/features/booking/booking-entry-copy'
import { SocialIcon } from '#/frontend/components/SocialIcon'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { BrandMark } from './BrandMark'
import { Container } from './Container'

/* The contact column: every row is an icon and its name. The icon stays quiet
   and takes the brand blue only under the pointer, so "Book a call" keeps
   the page's one blue ask (approved 27 Sep 2026, 1A 2A 3A). */
const contactLink = 'group text-foreground/85 hover:text-foreground inline-flex w-fit items-center gap-2.5 text-sm'
const contactIcon = 'text-muted-foreground group-hover:text-primary size-4 shrink-0 transition-colors'

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
          {/* The icon keeps to the start of the row, so in Arabic the icons line up on
              the right; only the address or name itself is set left-to-right. */}
          <a href={`mailto:${facts.email}`} className={contactLink}>
            <SocialIcon platform="email" className={contactIcon} />
            <span dir="ltr">{facts.email}</span>
          </a>
          {facts.phone ? (
            <a href={`tel:${facts.phone.replace(/[^+\d]/g, '')}`} className={contactLink}>
              <Phone className={contactIcon} aria-hidden="true" />
              <span dir="ltr">{facts.phone}</span>
            </a>
          ) : null}
          {facts.links.map((link) => (
            <a key={link.url} href={link.url} rel="me noreferrer" target="_blank" className={contactLink}>
              <SocialIcon platform={link.platform} className={contactIcon} />
              <span dir="ltr">{linkName(link)}</span>
            </a>
          ))}
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
