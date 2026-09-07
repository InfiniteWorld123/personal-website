import { Link } from '@tanstack/react-router'
import { ArrowRight, Menu } from 'lucide-react'
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
import { useLanguage } from '#/frontend/i18n/language-provider'
import { Container } from './Container'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeToggle } from './ThemeToggle'

export function SiteHeader({ copy }: { copy: ShellCopy }) {
  const { language, isRtl } = useLanguage()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <header className="site-header sticky top-0 z-30">
      <Container className="flex h-[4.25rem] items-center gap-2 sm:gap-3">
        {/* Mobile menu: solid blue pill */}
        <button
          type="button"
          onClick={() => setIsMenuOpen(true)}
          aria-label={copy.menu.open}
          className="btn-glow-menu flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/60 lg:hidden"
        >
          <Menu className="size-5" />
        </button>

        {/* Brand */}
        <Link
          to="/$lang"
          params={{ lang: language }}
          className="brand-logo inline-flex min-w-0 flex-1 items-center gap-2.5 text-foreground lg:flex-none"
        >
          <span className="brand-mark text-sm font-black">YW</span>
          <span className="hidden truncate text-[0.8rem] font-bold uppercase tracking-widest sm:inline">
            {site.name}
          </span>
        </Link>

        {/* Desktop nav: pills */}
        <nav aria-label={copy.menu.navigation} className="mx-auto hidden items-center gap-1 lg:flex">
          {copy.nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              params={{ lang: language }}
              className="btn-glow-nav rounded-full px-4 py-2 text-sm font-semibold text-foreground/64 hover:bg-primary/6 hover:text-primary"
              activeProps={{
                className: 'btn-glow-nav rounded-full bg-primary/8 px-4 py-2 text-sm font-semibold text-primary',
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center justify-end gap-1.5 sm:gap-2">
          <LanguageSwitcher label={copy.language.label} names={copy.language.names} />
          <ThemeToggle labels={copy.theme} />
          <Button
            asChild
            className="btn-glow-primary hidden h-10 rounded-full bg-primary px-5 text-primary-foreground shadow-[0_10px_28px_rgba(53,92,255,0.26)] hover:bg-primary/90 md:inline-flex"
          >
            <Link to="/$lang/contact" params={{ lang: language }}>
              {copy.cta}
              <ArrowRight className="rtl:-scale-x-100" />
            </Link>
          </Button>
        </div>
      </Container>

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
              <Button
                asChild
                className="btn-glow-primary w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Link to="/$lang/contact" params={{ lang: language }}>
                  {copy.cta}
                </Link>
              </Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </header>
  )
}
