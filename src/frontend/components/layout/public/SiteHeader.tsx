import { Link, useRouterState } from '@tanstack/react-router'
import { ArrowRight, CalendarDays, Menu } from 'lucide-react'
import { useState } from 'react'
import { Button } from '#/frontend/components/ui/button'
import { Separator } from '#/frontend/components/ui/separator'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/frontend/components/ui/sheet'
import type { ShellCopy } from '#/frontend/content/types'
import { site } from '#/frontend/content/site'
import { getBookingEntryCopy } from '#/frontend/features/booking/booking-entry-copy'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { useNavIndicator, useScrolled } from '#/frontend/motion'
import { cn } from '#/frontend/lib/utils'
import { BrandMark } from './BrandMark'
import { Container } from './Container'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeToggle } from './ThemeToggle'

export function SiteHeader({ copy }: { copy: ShellCopy }) {
  const { language, isRtl } = useLanguage()
  const entry = getBookingEntryCopy(language)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const scrolled = useScrolled()
  const navRef = useNavIndicator<HTMLElement>(pathname)

  return (
    <header className={cn('site-header sticky top-0 z-30', scrolled && 'is-scrolled')}>
      {/* The shell is the part that changes shape: at the top of the page it
          is a full-width bar, once the page moves it becomes a capsule that
          floats over the content. Everything inside keeps its own width. */}
      <div className="site-header-shell">
        <Container className="site-header-inner flex items-center gap-2 sm:gap-3">
          {/* Mobile menu: solid blue pill */}
          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            aria-label={copy.menu.open}
            className="btn-glow-menu flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/60 xl:hidden"
          >
            <Menu className="size-5" />
          </button>

          {/* Brand */}
          <Link
            to="/$lang"
            params={{ lang: language }}
            className="brand-logo inline-flex min-w-0 flex-1 items-center gap-2.5 text-foreground xl:flex-none"
          >
            <BrandMark size={30} />
            <span className="hidden truncate text-[0.8rem] font-bold uppercase tracking-widest sm:inline">
              {site.name}
            </span>
          </Link>

          {/* Desktop nav: one capsule, not five loose pills.
              Loose, the links had no edge of their own and the header read as a
              single long line; grouped, it reads as three blocks — brand, nav,
              controls — and the capsule matches the language and theme ones
              already sitting to its right. */}
          <nav
            ref={navRef}
            aria-label={copy.menu.navigation}
            className="nav-capsule mx-auto hidden shrink-0 items-center gap-0.5 rounded-full border border-border/60 bg-muted/45 p-1 shadow-sm xl:flex"
          >
            <span className="nav-indicator" aria-hidden="true" />
            {copy.nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                params={{ lang: language }}
                className="btn-glow-nav rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap text-foreground/64 hover:bg-card/70 hover:text-primary"
                activeProps={{
                  className: 'btn-glow-nav rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap text-primary',
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
            <LanguageSwitcher label={copy.language.label} names={copy.language.names} />
            <ThemeToggle labels={copy.theme} />
            <Button
              asChild
              className="hidden h-10 rounded-full bg-primary px-5 text-primary-foreground md:inline-flex"
            >
              <Link to="/$lang/booking" params={{ lang: language }}>
                <CalendarDays className="size-4" />
                {copy.cta}
                <ArrowRight className="btn-arrow rtl:-scale-x-100" />
              </Link>
            </Button>
          </div>
        </Container>

        {/* Below `xl` there is no link row: five labels on a second line
            crowd a capsule that has to hold the menu, the brand and the
            controls too. The sheet carries the navigation there. */}

        {/* Replays on every page change: the line under the header is the only
            thing that says "the page changed" once the new page has arrived. */}
        <span key={pathname} className="route-progress" aria-hidden="true" />
      </div>

      <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <SheetContent side={isRtl ? 'left' : 'right'} className="navigation-sheet w-[85vw] max-w-xs border-border/60 px-0">
          <SheetHeader className="pe-14 pb-2">
            <SheetTitle>{site.name}</SheetTitle>
            <SheetDescription>{copy.menu.navigation}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4 pb-4">
            {copy.nav.map((item) => (
              <SheetClose key={item.to} asChild>
                <Link
                  to={item.to}
                  params={{ lang: language }}
                  className="btn-glow-nav rounded-2xl px-4 py-3 text-sm font-semibold text-foreground/80 hover:bg-primary/6 hover:text-primary"
                  activeProps={{
                    className: 'btn-glow-nav rounded-2xl bg-primary/8 px-4 py-3 text-sm font-semibold text-primary',
                  }}
                >
                  {item.label}
                </Link>
              </SheetClose>
            ))}
          </div>
          <Separator />
          <SheetFooter className="gap-3">
            <p className="text-sm leading-6 text-muted-foreground" dir="ltr">
              {site.email}
            </p>
            <SheetClose asChild>
              <Button asChild className="w-full rounded-full">
                <Link to="/$lang/booking" params={{ lang: language }}>
                  <CalendarDays className="size-4" />
                  {entry.cta}
                </Link>
              </Button>
            </SheetClose>
            <SheetClose asChild>
              <Button asChild variant="outline" className="w-full rounded-full">
                <Link to="/$lang/contact" params={{ lang: language }}>
                  {entry.write}
                </Link>
              </Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </header>
  )
}
