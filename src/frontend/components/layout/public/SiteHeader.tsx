import { Link } from '@tanstack/react-router'
import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '#/frontend/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '#/frontend/components/ui/sheet'
import type { ShellCopy } from '#/frontend/content/types'
import { site } from '#/frontend/content/site'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { cn } from '#/frontend/lib/utils'
import { Container } from './Container'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeToggle } from './ThemeToggle'

export function SiteHeader({ copy }: { copy: ShellCopy }) {
  const { language, isRtl } = useLanguage()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const navLinkClass = cn(
    'text-muted-foreground hover:text-foreground rounded-md px-3 py-2 text-sm transition-colors',
  )

  return (
    <header className="bg-background/85 border-border sticky top-0 z-30 border-b backdrop-blur-md">
      <Container className="flex h-16 items-center gap-3">
        <Link
          to="/$lang"
          params={{ lang: language }}
          className="font-heading text-foreground me-auto text-xl"
        >
          {site.name}
        </Link>

        <nav aria-label={copy.menu.navigation} className="hidden items-center md:flex">
          {copy.nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              params={{ lang: language }}
              className={navLinkClass}
              activeProps={{ className: cn(navLinkClass, 'text-foreground') }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <LanguageSwitcher label={copy.language.label} names={copy.language.names} className="hidden sm:flex" />
          <ThemeToggle light={copy.theme.light} dark={copy.theme.dark} />
          <Button asChild className="hidden rounded-full px-4 sm:inline-flex">
            <Link to="/$lang/contact" params={{ lang: language }}>
              {copy.cta}
            </Link>
          </Button>
          <Button
            aria-label={copy.menu.open}
            className="rounded-full md:hidden"
            onClick={() => setIsMenuOpen(true)}
            size="icon"
            variant="ghost"
          >
            <Menu className="size-5" />
          </Button>
        </div>
      </Container>

      <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <SheetContent side={isRtl ? 'left' : 'right'} className="flex w-[min(20rem,90vw)] flex-col gap-6 p-6">
          <div className="flex items-center justify-between">
            <SheetTitle className="font-heading text-lg font-medium">{site.name}</SheetTitle>
            <Button
              aria-label={copy.menu.close}
              onClick={() => setIsMenuOpen(false)}
              size="icon"
              variant="ghost"
              className="rounded-full"
            >
              <X className="size-5" />
            </Button>
          </div>

          <nav aria-label={copy.menu.navigation} className="flex flex-col">
            {copy.nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                params={{ lang: language }}
                onClick={() => setIsMenuOpen(false)}
                className="border-border text-foreground border-b py-3 text-lg"
                activeProps={{ className: 'border-border text-primary border-b py-3 text-lg' }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Button asChild className="rounded-full">
            <Link to="/$lang/contact" params={{ lang: language }} onClick={() => setIsMenuOpen(false)}>
              {copy.cta}
            </Link>
          </Button>

          <div className="mt-auto flex items-center justify-between">
            <LanguageSwitcher label={copy.language.label} names={copy.language.names} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
