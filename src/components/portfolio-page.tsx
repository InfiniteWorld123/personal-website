import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  defaultLanguage,
  links,
  portfolioContent,
  seoContent,
  socials,
  type Language,
  type PortfolioContent,
  type Project,
  type ProjectStatus,
} from '../config/config'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Separator } from '#/components/ui/separator'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '#/components/ui/sheet'
import { Textarea } from '#/components/ui/textarea'
import { cn } from '#/lib/utils'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Github,
  Languages,
  Mail,
  MapPin,
  Menu,
  Monitor,
  Moon,
  Send,
  Sun,
} from 'lucide-react'

type FormStatus = 'idle' | 'sending' | 'sent' | 'redirected' | 'error' | 'invalid'
type ThemePreference = 'light' | 'dark' | 'system'
type ContactFormErrors = {
  name?: string
  email?: string
  message?: string
}

const skillIconMap: Record<string, ReactNode> = {
  react: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="2.1" fill="#61DAFB"/>
      <ellipse cx="12" cy="12" rx="10" ry="3.8" stroke="#61DAFB" strokeWidth="1.1" fill="none"/>
      <ellipse cx="12" cy="12" rx="10" ry="3.8" stroke="#61DAFB" strokeWidth="1.1" fill="none" transform="rotate(60 12 12)"/>
      <ellipse cx="12" cy="12" rx="10" ry="3.8" stroke="#61DAFB" strokeWidth="1.1" fill="none" transform="rotate(120 12 12)"/>
    </svg>
  ),
  typescript: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
      <rect width="24" height="24" rx="3" fill="#3178C6"/>
      <path d="M13.5 14.5v1.7c.3.15.65.27 1.05.35.4.08.82.12 1.27.12.44 0 .85-.05 1.24-.14.39-.1.73-.25 1.02-.46.29-.21.52-.48.68-.81.17-.33.25-.73.25-1.19 0-.34-.05-.64-.14-.89a2.1 2.1 0 0 0-.42-.68 3.2 3.2 0 0 0-.68-.54 8.3 8.3 0 0 0-.92-.47 6.4 6.4 0 0 1-.6-.3 1.8 1.8 0 0 1-.38-.28.97.97 0 0 1-.2-.3.9.9 0 0 1-.06-.34c0-.11.02-.22.07-.31.05-.1.12-.18.21-.25.09-.07.21-.12.34-.16.14-.04.29-.06.47-.06.12 0 .25.01.38.03.13.02.26.05.38.1.13.04.25.1.36.17.11.07.21.15.29.25v-1.6a3.9 3.9 0 0 0-.86-.22 6.5 6.5 0 0 0-1.07-.08c-.43 0-.84.05-1.22.15-.38.1-.71.25-.99.46a2.1 2.1 0 0 0-.66.78c-.16.31-.24.68-.24 1.1 0 .55.16 1.02.47 1.4.31.38.78.7 1.42.97.24.1.46.2.65.3.19.1.35.2.48.31.13.1.23.22.3.34.07.12.1.26.1.41 0 .12-.02.23-.07.33a.72.72 0 0 1-.21.26c-.09.07-.21.13-.36.17-.15.04-.32.06-.52.06-.35 0-.69-.07-1.02-.2a3 3 0 0 1-.89-.58zM10 10.56H12.5V9H6v1.56h2.48V17H10v-6.44z" fill="white"/>
    </svg>
  ),
  nodejs: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" fill="#339933"/>
      <path d="M12 2L3 7l9 5 9-5-9-5z" fill="#3c873a"/>
      <path d="M9.5 13.5c0 .55.45 1 1 1h.5v1.5h-.5c-1.38 0-2.5-1.12-2.5-2.5V11h1.5v2.5zm5 0c0 .55-.45 1-1 1h-.5v1.5h.5c1.38 0 2.5-1.12 2.5-2.5V11H15v2.5z" fill="white"/>
      <path d="M11 10h2v5h-2v-5z" fill="white"/>
    </svg>
  ),
  postgresql: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
      <ellipse cx="12" cy="8" rx="7" ry="4" fill="#336791"/>
      <path d="M5 8v8c0 2.21 3.13 4 7 4s7-1.79 7-4V8" stroke="#336791" strokeWidth="0" fill="#336791" opacity="0.85"/>
      <ellipse cx="12" cy="8" rx="7" ry="4" fill="#4479A1"/>
      <path d="M5 8v4c0 2.21 3.13 4 7 4s7-1.79 7-4V8c0 2.21-3.13 4-7 4S5 10.21 5 8z" fill="#336791"/>
      <path d="M5 12v4c0 2.21 3.13 4 7 4s7-1.79 7-4v-4c0 2.21-3.13 4-7 4s-7-1.79-7-4z" fill="#2d5f8a"/>
    </svg>
  ),
  tanstack: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#FF4154"/>
      <path d="M7 12l3 3 7-7" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  hono: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
      <path d="M12 2c0 0-7 5-7 11a7 7 0 0 0 14 0c0-6-7-11-7-11z" fill="#FF7043"/>
      <path d="M12 7c0 0-4 3-4 6a4 4 0 0 0 8 0c0-3-4-6-4-6z" fill="#FF8A65"/>
      <circle cx="12" cy="15" r="2" fill="#FFD54F"/>
    </svg>
  ),
  tailwind: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
      <path d="M12 6C9.6 6 8.1 7.2 7.5 9.6c.9-1.2 1.95-1.65 3.15-1.35.685.171 1.174.668 1.715 1.221C13.272 10.464 14.353 11.6 16.5 11.6c2.4 0 3.9-1.2 4.5-3.6-.9 1.2-1.95 1.65-3.15 1.35-.685-.171-1.174-.668-1.715-1.221C15.228 7.136 14.147 6 12 6zm-4.5 6C5.1 12 3.6 13.2 3 15.6c.9-1.2 1.95-1.65 3.15-1.35.685.171 1.174.668 1.715 1.221C8.772 16.464 9.853 17.6 12 17.6c2.4 0 3.9-1.2 4.5-3.6-.9 1.2-1.95 1.65-3.15 1.35-.685-.171-1.174-.668-1.715-1.221C10.728 13.136 9.647 12 7.5 12z" fill="#06B6D4"/>
    </svg>
  ),
}

const socialIconMap: Record<string, ReactNode> = {
  github: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
    </svg>
  ),
  email: <Mail className="w-4 h-4" />,
  linkedin: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#0A66C2">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  ),
}

const statusClasses: Record<ProjectStatus, string> = {
  live: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700',
  'coming-soon': 'border-foreground/10 bg-foreground/[0.04] text-foreground/60',
  placeholder: 'border-foreground/10 bg-background/90 text-foreground/50',
}

const languageStorageKey = 'portfolio-language'
const languageOptions: Language[] = ['de', 'en', 'ar']
const themeStorageKey = 'theme-preference'
const themeOptions: Array<{
  value: ThemePreference
  label: string
  icon: ReactNode
}> = [
  { value: 'light', label: 'Light mode', icon: <Sun /> },
  { value: 'dark', label: 'Dark mode', icon: <Moon /> },
  { value: 'system', label: 'Use system theme', icon: <Monitor /> },
]
const portraitImageSrc = '/images/hero-portrait.png'

function upsertMetaTag(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)

  if (!element) {
    element = document.createElement('meta')
    document.head.appendChild(element)
  }

  Object.entries(attributes).forEach(([name, value]) => {
    element.setAttribute(name, value)
  })
}

function updateSeoMetadata(language: Language) {
  const seo = seoContent[language]
  const canonicalUrl = links.siteUrl

  document.title = seo.title
  upsertMetaTag('meta[name="description"]', {
    name: 'description',
    content: seo.description,
  })
  upsertMetaTag('meta[name="keywords"]', {
    name: 'keywords',
    content: seo.keywords.join(', '),
  })
  upsertMetaTag('meta[property="og:title"]', {
    property: 'og:title',
    content: seo.title,
  })
  upsertMetaTag('meta[property="og:description"]', {
    property: 'og:description',
    content: seo.description,
  })
  upsertMetaTag('meta[property="og:url"]', {
    property: 'og:url',
    content: canonicalUrl,
  })
  upsertMetaTag('meta[property="og:image:alt"]', {
    property: 'og:image:alt',
    content: seo.imageAlt,
  })
  upsertMetaTag('meta[name="twitter:title"]', {
    name: 'twitter:title',
    content: seo.title,
  })
  upsertMetaTag('meta[name="twitter:description"]', {
    name: 'twitter:description',
    content: seo.description,
  })
  upsertMetaTag('meta[name="twitter:image:alt"]', {
    name: 'twitter:image:alt',
    content: seo.imageAlt,
  })
}

function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return defaultLanguage
  const stored = window.localStorage.getItem(languageStorageKey)
  return languageOptions.includes(stored as Language) ? (stored as Language) : defaultLanguage
}

function getStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  const currentPreference = document.documentElement.dataset.themePreference
  if (
    currentPreference === 'light' ||
    currentPreference === 'dark' ||
    currentPreference === 'system'
  ) {
    return currentPreference
  }

  const stored = window.localStorage.getItem(themeStorageKey)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

function applyThemePreference(preference: ThemePreference) {
  if (typeof window === 'undefined') return
  const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const shouldUseDark = preference === 'dark' || (preference === 'system' && isSystemDark)

  document.documentElement.classList.toggle('dark', shouldUseDark)
  document.documentElement.dataset.themePreference = preference
  window.localStorage.setItem(themeStorageKey, preference)
}

export function PortfolioPage() {
  const [language, setLanguage] = useState<Language>(getStoredLanguage)
  const content = portfolioContent[language]

  useEffect(() => {
    window.localStorage.setItem(languageStorageKey, language)
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
    updateSeoMetadata(language)
  }, [language])

  return (
    <>
      {/* Full-width seamless layout — no outer card, no background contrast */}
      <div className="main-shell">
        <PortfolioHeader content={content} language={language} onLanguageChange={setLanguage} />

        {/* All sections share an inner-wrap to keep content readable on wide screens */}
        <div className="inner-wrap">
          <HeroSection content={content} language={language} />
          <SectionSeparator />
          <AboutSection content={content} />
          <SectionSeparator />
          <ProjectsSection content={content} />
          <SectionSeparator />
          <GallerySection content={content} />
        </div>

        {/* Contact spans full width so its tinted bg goes edge-to-edge */}
        <ContactSection content={content} />
      </div>

      <footer className="inner-wrap px-6 pb-8 pt-5 text-center text-sm text-foreground/38 sm:px-10 sm:text-left lg:px-14">
        <p className="m-0">
          {content.profile.name} · {content.profile.location}
        </p>
      </footer>
    </>
  )
}

// ─── Header ──────────────────────────────────────────────────────────────────

function PortfolioHeader({
  content,
  language,
  onLanguageChange,
}: {
  content: PortfolioContent
  language: Language
  onLanguageChange: (language: Language) => void
}) {
  const { navigation, profile, ui } = content

  return (
    <header className="site-header sticky top-0 z-30">
      <div className="inner-wrap relative flex items-center justify-between gap-2 px-3 py-3 min-[360px]:gap-3 sm:px-10 sm:py-4 lg:px-14">
        {/* Mobile menu - moved to left */}
        <Sheet>
          <SheetTrigger asChild>
            <button
              className="btn-glow-menu shrink-0 rounded-full lg:hidden h-12 w-12 flex items-center justify-center outline-none select-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
              aria-label={ui.openNavigationMenu}
              type="button"
            >
              <Menu className="size-5" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-[85vw] max-w-xs border-l border-border/30 bg-card px-0"
          >
            <SheetHeader className="pb-2">
              <SheetTitle>{profile.name}</SheetTitle>
              <SheetDescription>{ui.portfolioNavigation}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-1 px-4 pb-4">
              {navigation.map((item) => (
                <SheetClose key={item.href} asChild>
                  <Button
                    asChild
                    variant="ghost"
                    className="btn-glow-nav justify-start rounded-2xl px-4 py-5 text-left text-sm font-semibold"
                  >
                    <a href={item.href}>{item.label}</a>
                  </Button>
                </SheetClose>
              ))}
            </div>
            <Separator />
            <SheetFooter className="gap-3">
              <p className="text-sm leading-6 text-muted-foreground">{links.email}</p>
              <SheetClose asChild>
                <Button
                  asChild
                  className="btn-glow-primary w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <a href={links.github} target="_blank" rel="noreferrer">
                    GitHub
                  </a>
                </Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* Brand */}
        <a
          href="#home"
          className="brand-logo inline-flex items-center gap-2 min-[360px]:gap-3 text-xs min-[360px]:text-sm font-semibold tracking-[0.18em] text-foreground no-underline flex-1 min-w-0 lg:flex-none"
        >
          <span className="brand-mark h-9 w-9 min-[360px]:h-[2.25rem] min-[360px]:w-[2.25rem] text-[0.7rem] min-[360px]:text-base">{profile.initials}</span>
          <span className="hidden text-[0.65rem] min-[360px]:text-[0.8rem] font-bold uppercase tracking-widest sm:inline truncate">
            Yaman Warda
          </span>
        </a>

        {/* Desktop nav — absolutely centered in header */}
        <nav className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 lg:flex">
          {navigation.map((item) => (
            <Button
              key={item.href}
              asChild
              variant="ghost"
              size="sm"
              className="btn-glow-nav rounded-full px-4 text-[0.82rem] font-semibold text-foreground/52 hover:bg-primary/7 hover:text-foreground"
            >
              <a href={item.href}>{item.label}</a>
            </Button>
          ))}
        </nav>

        {/* CTA + settings */}
        <div className="flex items-center gap-1 min-[360px]:gap-2 flex-wrap justify-end">
          <LanguageSwitcher
            content={content}
            language={language}
            onLanguageChange={onLanguageChange}
          />
          <ThemeToggle />

          <Button
            asChild
            size="lg"
            className="btn-glow-primary hidden rounded-full bg-primary px-5 text-primary-foreground shadow-[0_6px_24px_rgba(53,92,255,0.28)] hover:bg-primary/90 lg:inline-flex"
          >
            <a href="#contact">{ui.connectCta}</a>
          </Button>
        </div>
      </div>
    </header>
  )
}

function LanguageSwitcher({
  content,
  language,
  onLanguageChange,
}: {
  content: PortfolioContent
  language: Language
  onLanguageChange: (language: Language) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={content.ui.languageLabel}
          className="btn-glow-outline h-11 rounded-full border-border/60 bg-card px-4 text-foreground/72 shadow-sm hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
        >
          <Languages className="size-4" />
          <span className="hidden min-[360px]:inline min-[360px]:min-w-16 text-sm font-bold">{content.ui.languageOptions[language]}</span>
          <ChevronDown
            className="size-4 transition-transform group-aria-expanded/button:rotate-180"
            aria-hidden="true"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={9}
        className="language-menu min-w-48 overflow-hidden rounded-2xl border border-border/70 p-1.5 text-foreground shadow-[0_18px_50px_rgba(8,17,38,0.18)]"
      >
        <DropdownMenuRadioGroup
          value={language}
          onValueChange={(value) => onLanguageChange(value as Language)}
        >
          {languageOptions.map((option) => {
            const isSelected = language === option

            return (
              <DropdownMenuRadioItem
                key={option}
                value={option}
                className={cn(
                  'flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl px-3.5 py-3 text-left text-sm font-semibold text-foreground/64 transition-colors focus:bg-primary/8 focus:text-primary rtl:text-right',
                  isSelected &&
                    'bg-primary text-primary-foreground focus:bg-primary focus:text-primary-foreground',
                )}
              >
                <span>{content.ui.languageOptions[option]}</span>
                <Check className={cn('size-4 opacity-0', isSelected && 'opacity-100')} />
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>('system')
  const [isThemeReady, setIsThemeReady] = useState(false)

  useEffect(() => {
    const storedTheme = getStoredThemePreference()
    setTheme(storedTheme)
    setIsThemeReady(true)
    applyThemePreference(storedTheme)
  }, [])

  useEffect(() => {
    if (!isThemeReady) return

    applyThemePreference(theme)

    if (theme !== 'system') return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => applyThemePreference('system')
    mediaQuery.addEventListener('change', handleChange)

    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [isThemeReady, theme])

  return (
    <div
      className="theme-toggle grid grid-cols-3 rounded-full border border-border/60 bg-muted/45 p-1 shadow-sm"
      aria-label="Theme preference"
      role="tablist"
    >
      {themeOptions.map((option) => {
        const isActive = theme === option.value

        return (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              'btn-glow-theme rounded-full text-foreground/58 shadow-none hover:bg-card/70 hover:text-foreground',
              '[&_svg]:size-4',
              isActive && 'theme-tab-active',
            )}
            aria-label={option.label}
            aria-selected={isActive}
            role="tab"
            suppressHydrationWarning
            title={option.label}
            onClick={() => setTheme(option.value)}
          >
            {option.icon}
          </Button>
        )
      })}
    </div>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

const heroWordsByLanguage: Record<Language, string[]> = {
  de: ['FULL-STACK', 'FRONTEND', 'BACKEND'],
  en: ['FULL-STACK', 'FRONTEND', 'BACKEND'],
  ar: ['شامل', 'واجهات أمامية', 'واجهات خلفية'],
}

function TypingHeroText({ language }: { language: Language }) {
  const words = heroWordsByLanguage[language]
  const longestWordLength = Math.max(...words.map((word) => word.length))
  const [wordIndex, setWordIndex] = useState(0)
  const [displayed, setDisplayed] = useState('')
  const [phase, setPhase] = useState<'typing' | 'pausing' | 'deleting'>('typing')

  useEffect(() => {
    const target = words[wordIndex]

    if (phase === 'typing') {
      if (displayed.length < target.length) {
        const t = setTimeout(() => setDisplayed(target.slice(0, displayed.length + 1)), 80)
        return () => clearTimeout(t)
      } else {
        const t = setTimeout(() => setPhase('pausing'), 1600)
        return () => clearTimeout(t)
      }
    }

    if (phase === 'pausing') {
      const t = setTimeout(() => setPhase('deleting'), 300)
      return () => clearTimeout(t)
    }

    if (phase === 'deleting') {
      if (displayed.length > 0) {
        const t = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 45)
        return () => clearTimeout(t)
      } else {
        setWordIndex((i) => (i + 1) % words.length)
        setPhase('typing')
      }
    }
  }, [phase, displayed, wordIndex, words])

  return (
    <span
      className="hero-accent hero-typed-word"
      style={{ '--hero-word-ch': `${longestWordLength}ch` } as CSSProperties}
    >
      {displayed}
      <span className="hero-cursor" aria-hidden="true">|</span>
    </span>
  )
}

function HeroSection({ content, language }: { content: PortfolioContent; language: Language }) {
  const { profile, skills, ui } = content

  return (
    <section
      id="home"
      className="scroll-mt-20 px-6 pb-16 pt-12 sm:px-10 sm:pb-20 sm:pt-14 lg:px-14 lg:pt-16"
    >
      <div className="grid gap-12 md:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.85fr)] md:items-center lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)]">
        {/* Left: text */}
        <div className="fade-up max-w-2xl">
          <Badge className="hero-chip rounded-full px-3 py-1 text-[0.76rem]">
            <MapPin className="size-3.5" />
            {profile.location}
          </Badge>

          <p className="mt-7 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {profile.greeting}
          </p>

          <p className="mt-4 text-[0.72rem] font-bold uppercase tracking-[0.36em] text-primary/70">
            {profile.heroPrefix}
          </p>

          <h1
            className={cn(
              'hero-display mt-3 text-[clamp(2.75rem,8vw,5.45rem)] font-black uppercase leading-[0.96] tracking-normal text-foreground sm:leading-[0.92]',
              language === 'ar' && 'hero-display-ar text-[clamp(2.45rem,7vw,4.95rem)]',
            )}
          >
            {language === 'ar' ? (
              <span className="hero-title-arabic">
                <span className="hero-arabic-static">{profile.heroLines[1]}</span>
                <span className="hero-arabic-role">
                  <TypingHeroText key={language} language={language} />
                </span>
              </span>
            ) : (
              <>
                <TypingHeroText key={language} language={language} />
                <span className="hero-static-line block">{profile.heroLines[1]}</span>
              </>
            )}
          </h1>

          <p className="hero-copy mt-6 max-w-xl text-base leading-8 sm:text-[1.05rem]">
            {profile.lead}
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="btn-glow-primary rounded-full bg-primary px-7 text-primary-foreground shadow-[0_12px_32px_rgba(53,92,255,0.28)] hover:bg-primary/90"
            >
              <a href="#contact">
                {ui.connectCta}
                <ArrowRight />
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="btn-glow-outline rounded-full border-border/60 bg-card px-7 text-foreground hover:bg-primary/5 hover:border-primary/30"
            >
              <a href="#projects">
                {ui.projectsCta}
                <ArrowUpRight />
              </a>
            </Button>
          </div>

          {/* Social row */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="btn-glow-icon rounded-full border border-border/60 bg-card text-foreground/70 hover:bg-primary/6 hover:text-primary"
            >
              <a href={links.github} target="_blank" rel="noreferrer" aria-label="Open GitHub">
                <Github />
              </a>
            </Button>
            <a
              href={`mailto:${links.email}`}
              className="link-underline-slide text-sm font-medium text-foreground/48 hover:text-primary"
            >
              {links.email}
            </a>
          </div>

          {/* Skill badges */}
          <div className="mt-7 flex flex-wrap gap-2">
            {skills.map((skill) =>
              skill.url ? (
                <a
                  key={skill.name}
                  href={skill.url}
                  target="_blank"
                  rel="noreferrer"
                  className="skill-pill inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-[0.72rem] font-semibold text-foreground/60 hover:text-primary hover:border-primary/30"
                >
                  <span className="skill-icon opacity-60">{skillIconMap[skill.icon]}</span>
                  {skill.name}
                </a>
              ) : (
                <Badge
                  key={skill.name}
                  variant="outline"
                  className="rounded-full border-border/60 bg-card px-3 py-1.5 text-[0.72rem] font-semibold text-foreground/60 flex items-center gap-1.5"
                >
                  <span className="opacity-60">{skillIconMap[skill.icon]}</span>
                  {skill.name}
                </Badge>
              )
            )}
          </div>
        </div>

        {/* Right: portrait blob */}
        <PortraitPlaceholder content={content} />
      </div>
    </section>
  )
}

function PortraitPlaceholder({ content }: { content: PortfolioContent }) {
  const { profile } = content

  return (
    <div className="fade-up delay-2 flex items-center justify-center py-4">
      <div className="portrait-outer">
        {/* Blob behind photo (z-index:1) */}
        <div className="portrait-blob-clip" aria-hidden="true">
          <div className="portrait-blob-anim" />
          <div className="portrait-blob-glow" />
        </div>
        {/* Photo in front. The wrapper clips only the bottom of the oversized image. */}
        <div className="portrait-photo-frame">
          <img
            src={portraitImageSrc}
            alt={`${profile.name}, ${profile.headline}`}
            className="portrait-cutout"
          />
        </div>
      </div>
    </div>
  )
}

// ─── About ────────────────────────────────────────────────────────────────────

function AboutSection({ content }: { content: PortfolioContent }) {
  const { aboutHighlights, profile, ui } = content

  return (
    <section
      id="about"
      className="scroll-mt-20 grid gap-8 px-6 py-14 sm:px-10 md:grid-cols-[0.9fr_1.1fr] lg:px-14"
    >
      <div className="fade-up">
        <Badge variant="outline" className="section-chip rounded-full px-3 py-1">
          {ui.aboutBadge}
        </Badge>
        <h2 className="section-title mt-5 max-w-sm text-4xl text-foreground sm:text-5xl">
          {ui.aboutTitle}
        </h2>
      </div>

      <div className="fade-up delay-1">
        <div className="space-y-5 text-base leading-8 text-foreground/62">
          {profile.about.map((paragraph) => (
            <p key={paragraph} className="m-0">
              {paragraph}
            </p>
          ))}
          <p className="m-0">{profile.closing}</p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {aboutHighlights.map((item) => (
            <Card
              key={item.title}
              size="sm"
              className="rounded-[1.4rem] border-border/50 bg-card py-0 shadow-[0_4px_20px_rgba(16,23,47,0.06)]"
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-foreground">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="pb-4 text-sm leading-6 text-foreground/58">
                {item.description}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Projects ─────────────────────────────────────────────────────────────────

function ProjectsSection({ content }: { content: PortfolioContent }) {
  const { projects, ui } = content

  return (
    <section id="projects" className="scroll-mt-20 px-6 py-14 sm:px-10 lg:px-14">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="fade-up">
          <Badge variant="outline" className="section-chip rounded-full px-3 py-1">
            {ui.projectsBadge}
          </Badge>
          <h2 className="section-title mt-5 text-4xl text-foreground sm:text-5xl">
            {ui.projectsTitle}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-foreground/58">
            {ui.projectsDescription}
          </p>
        </div>

        <Button
          asChild
          variant="outline"
          className="btn-glow-outline fade-up shrink-0 rounded-full border-border/60 bg-card px-5 text-foreground/64 hover:bg-primary/5 hover:border-primary/30 hover:text-primary"
        >
          <a href={links.github} target="_blank" rel="noreferrer">
            {ui.seeAllGitHub}
            <ArrowUpRight />
          </a>
        </Button>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project, index) => (
          <ProjectCard key={project.title} project={project} index={index} content={content} />
        ))}
      </div>
    </section>
  )
}

function ProjectCard({
  project,
  index,
  content,
}: {
  project: Project
  index: number
  content: PortfolioContent
}) {
  const isLive = project.status === 'live'
  const websiteHref = project.websiteHref
  const githubHref = project.githubHref

  return (
    <Card
      className="project-card fade-up flex min-w-0 flex-col rounded-[1.75rem] border-border/50 bg-card py-0 shadow-[0_4px_24px_rgba(16,23,47,0.07)]"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      {/* ── Header: eyebrow + title + status ── */}
      <CardHeader className="gap-2 px-7 pb-3 pt-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardDescription className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-primary/65">
              {project.eyebrow}
            </CardDescription>
            <CardTitle className="mt-2.5 text-[1.35rem] leading-snug text-foreground">
              {project.title}
            </CardTitle>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'mt-1 shrink-0 rounded-full border px-3 py-1 text-[0.72rem] font-semibold',
              statusClasses[project.status],
            )}
          >
            {project.status === 'live' && <span className="live-status-dot" aria-hidden="true" />}
            {content.ui.statusLabels[project.status]}
          </Badge>
        </div>
      </CardHeader>

      {/* ── Body: description + tags ── */}
      <CardContent className="flex flex-1 flex-col gap-5 px-7 pb-7">
        <p className="m-0 text-sm leading-7 text-foreground/58">{project.description}</p>
        <div className="flex flex-wrap gap-2">
          {project.tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="rounded-full bg-secondary px-3 py-1 text-[0.72rem] font-semibold text-foreground/62"
            >
              {tag}
            </Badge>
          ))}
        </div>
      </CardContent>

      {/* ── Footer: number + CTA ── */}
      <CardFooter className="justify-between gap-3 rounded-b-[1.75rem] border-t border-border/30 bg-muted/25 px-7 py-5">
        <span className="shrink-0 whitespace-nowrap text-sm font-medium text-foreground/36">0{index + 1}</span>
        {isLive && (websiteHref || githubHref) ? (
          <div className="flex flex-wrap justify-end gap-2">
            {websiteHref && (
              <Button
                asChild
                className="btn-glow-primary rounded-full bg-primary px-4 text-primary-foreground shadow-[0_6px_20px_rgba(53,92,255,0.22)] hover:bg-primary/90"
              >
                <Link to={websiteHref} target="_blank" rel="noreferrer">
                  {content.ui.visitWebsite}
                  <ArrowUpRight />
                </Link>
              </Button>
            )}
            {githubHref && (
              <Button
                asChild
                variant="outline"
                className="btn-glow-outline rounded-full border-border/50 bg-card px-4 text-foreground/68 hover:bg-primary/5 hover:border-primary/30 hover:text-primary"
              >
                <Link to={githubHref} target="_blank" rel="noreferrer">
                  {content.ui.viewOnGitHub}
                  <Github />
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled
            className="rounded-full border-border/50 bg-card px-5 text-foreground/38"
          >
            {project.ctaLabel}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

// ─── Contact ──────────────────────────────────────────────────────────────────

function ContactSection({ content }: { content: PortfolioContent }) {
  const [status, setStatus] = useState<FormStatus>('idle')
  const [errors, setErrors] = useState<ContactFormErrors>({})
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)
  const { profile, ui } = content

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const name = nameRef.current?.value.trim() ?? ''
    const email = emailRef.current?.value.trim() ?? ''
    const message = messageRef.current?.value.trim() ?? ''
    const nextErrors: ContactFormErrors = {}

    if (name.length < 2) {
      nextErrors.name = ui.nameError(name.length)
    }

    if (!email) {
      nextErrors.email = ui.emailRequiredError
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = ui.emailInvalidError
    }

    if (message.length < 10) {
      nextErrors.message = ui.messageError(message.length)
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      setStatus('invalid')
      if (nextErrors.name) {
        nameRef.current?.focus()
      } else if (nextErrors.email) {
        emailRef.current?.focus()
      } else {
        messageRef.current?.focus()
      }
      return
    }

    setErrors({})

    const formData = new FormData()
    formData.set('name', name)
    formData.set('email', email)
    formData.set('message', message)

    if (!links.formEndpoint) {
      const subject = encodeURIComponent(ui.mailSubject(name))
      const body = encodeURIComponent(ui.mailBody(name, email, message))
      window.location.href = `mailto:${links.email}?subject=${subject}&body=${body}`
      setStatus('redirected')
      form.reset()
      return
    }

    setStatus('sending')
    try {
      const response = await fetch(links.formEndpoint, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
      })
      if (!response.ok) throw new Error('Request failed')
      setStatus('sent')
      form.reset()
      setErrors({})
    } catch {
      setStatus('error')
    }
  }

  return (
    /* Full-width section so the subtle tint goes edge-to-edge */
    <section id="contact" className="contact-light scroll-mt-20 py-14">
      <div className="inner-wrap px-6 sm:px-10 lg:px-14">
        <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:gap-12">
          {/* ── Left: heading + contact info ── */}
          <div className="fade-up">
            <Badge variant="outline" className="section-chip rounded-full px-3 py-1">
              {ui.contactBadge}
            </Badge>
            <h2 className="section-title mt-5 text-4xl text-foreground sm:text-5xl">
              {ui.contactTitle}
            </h2>
            <p className="mt-4 max-w-md text-base leading-8 text-foreground/58">
              {ui.contactDescription}
            </p>

            <div className="mt-8 flex flex-col gap-3">
              <ContactInfoCard
                icon={<Mail className="size-4 text-primary" />}
                title={ui.contactEmailTitle}
                value={links.email}
                href={`mailto:${links.email}`}
              />
              <ContactInfoCard
                icon={<MapPin className="size-4 text-primary" />}
                title={ui.contactLocationTitle}
                value={profile.location}
              />
            </div>

            {/* Social links */}
            <div className="mt-8 flex flex-wrap gap-2">
              {socials.map((social) => (
                <Button
                  key={social.platform}
                  asChild
                  variant="outline"
                  size="icon"
                  className="btn-glow-icon rounded-full border-border/60 bg-card hover:bg-primary/5 hover:border-primary/30"
                >
                  <a href={social.url} target="_blank" rel="noreferrer" aria-label={social.label} title={social.label}>
                    {socialIconMap[social.icon]}
                  </a>
                </Button>
              ))}
            </div>
          </div>

          {/* ── Right: form card ── */}
          <div className="fade-up delay-1">
            <Card className="contact-form-card h-full rounded-[1.6rem] p-8 ring-0 sm:p-10">
              <CardContent className="p-0">
                <h3 className="text-xl font-semibold text-foreground">{ui.formTitle}</h3>
                <p className="mt-1 text-sm leading-6 text-foreground/50">{ui.formDescription}</p>

                <form onSubmit={handleSubmit} className="mt-7 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-foreground/72">
                        {ui.nameLabel}
                      </Label>
                      <Input
                        ref={nameRef}
                        id="name"
                        name="name"
                        placeholder={ui.namePlaceholder}
                        required
                        aria-invalid={Boolean(errors.name)}
                        aria-describedby={errors.name ? 'name-error' : undefined}
                        onChange={() =>
                          setErrors((current) => ({
                            ...current,
                            name: undefined,
                          }))
                        }
                        className={cn(
                          'h-12 rounded-xl border-border/60 bg-background px-4 focus:border-primary/40',
                          errors.name && 'border-destructive focus:border-destructive',
                        )}
                      />
                      {errors.name && (
                        <p id="name-error" className="text-sm font-medium text-destructive">
                          {errors.name}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-foreground/72">
                        {ui.emailLabel}
                      </Label>
                      <Input
                        ref={emailRef}
                        id="email"
                        name="email"
                        type="email"
                        placeholder={ui.emailPlaceholder}
                        required
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? 'email-error' : undefined}
                        onChange={() =>
                          setErrors((current) => ({
                            ...current,
                            email: undefined,
                          }))
                        }
                        className={cn(
                          'h-12 rounded-xl border-border/60 bg-background px-4 focus:border-primary/40',
                          errors.email && 'border-destructive focus:border-destructive',
                        )}
                      />
                      {errors.email && (
                        <p id="email-error" className="text-sm font-medium text-destructive">
                          {errors.email}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message" className="text-foreground/72">
                      {ui.messageLabel}
                    </Label>
                    <Textarea
                      ref={messageRef}
                      id="message"
                      name="message"
                      rows={5}
                      placeholder={ui.messagePlaceholder}
                      required
                      aria-invalid={Boolean(errors.message)}
                      aria-describedby={errors.message ? 'message-error' : undefined}
                      onChange={() =>
                        setErrors((current) => ({
                          ...current,
                          message: undefined,
                        }))
                      }
                      className={cn(
                        'min-h-[140px] resize-none rounded-xl border-border/60 bg-background px-4 py-3 focus:border-primary/40',
                        errors.message && 'border-destructive focus:border-destructive',
                      )}
                    />
                    {errors.message && (
                      <p id="message-error" className="text-sm font-medium text-destructive">
                        {errors.message}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                    <ContactStatusMessage status={status} content={content} />
                    <Button
                      type="submit"
                      size="lg"
                      disabled={status === 'sending'}
                      className="btn-glow-primary rounded-full bg-primary px-7 text-primary-foreground shadow-[0_8px_24px_rgba(53,92,255,0.26)] hover:bg-primary/90"
                    >
                      {status === 'sending' ? ui.sending : ui.sendMessage}
                      <Send />
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}

function ContactStatusMessage({
  status,
  content,
}: {
  status: FormStatus
  content: PortfolioContent
}) {
  const { ui } = content

  if (status === 'idle') {
    return <p className="text-sm text-foreground/44">{ui.directEmailHint}</p>
  }

  const message =
    status === 'sent'
      ? ui.sentMessage
      : status === 'redirected'
        ? ui.redirectedMessage
        : status === 'error'
          ? ui.errorMessage
          : status === 'invalid'
            ? ui.invalidMessage
            : ui.sendingMessage

  return (
    <Badge
      variant="outline"
      className={cn(
        'h-auto rounded-full px-3 py-2 text-left text-[0.74rem] font-semibold',
        status === 'error' || status === 'invalid'
          ? 'border-destructive/20 bg-destructive/10 text-destructive'
          : 'border-primary/15 bg-primary/10 text-primary',
      )}
    >
      {message}
    </Badge>
  )
}

function ContactInfoCard({
  icon,
  title,
  value,
  href,
}: {
  icon: ReactNode
  title: string
  value: string
  href?: string
}) {
  const content = (
    <Card className="contact-info-card flex-row items-center gap-5 rounded-[1.2rem] px-6 py-5 ring-0">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/14 bg-primary/8">
        {icon}
      </div>
      <CardContent className="p-0">
        <p className="m-0 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-foreground/40">
          {title}
        </p>
        <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  )

  if (!href) return content

  return (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
      {content}
    </a>
  )
}

// ─── Gallery ──────────────────────────────────────────────────────────────────

const galleryPhotos = [
  { src: '/images/gallery/photo-1.jpg', pos: '50% 18%' },
  { src: '/images/gallery/photo-2.jpg', pos: '50% 40%' },
  { src: '/images/gallery/photo-3.jpg', pos: '50% 20%' },
  { src: '/images/gallery/photo-4.jpg', pos: '50% 32%' },
  { src: '/images/gallery/photo-5.jpg', pos: '50% 28%' },
]

function Lightbox({
  content,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  content: PortfolioContent
  index: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  const photo = galleryPhotos[index]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Prev */}
      <button
        onClick={e => { e.stopPropagation(); onPrev() }}
        className="lightbox-nav-btn absolute left-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur"
        aria-label="Previous photo"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>

      {/* Image */}
      <div
        className="relative mx-16 max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <img
          src={photo.src}
          alt={`${content.profile.name} personal portfolio photo ${index + 1}`}
          className="max-h-[90vh] max-w-[90vw] object-contain"
        />
        {/* Counter */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur-sm">
          {index + 1} / {galleryPhotos.length}
        </div>
      </div>

      {/* Next */}
      <button
        onClick={e => { e.stopPropagation(); onNext() }}
        className="lightbox-nav-btn absolute right-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur"
        aria-label="Next photo"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>

      {/* Close */}
      <button
        onClick={onClose}
        className="lightbox-nav-btn absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur"
        aria-label="Close"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  )
}

function GallerySection({ content }: { content: PortfolioContent }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const openAt = (i: number) => setLightboxIndex(i)
  const close = () => setLightboxIndex(null)
  const prev = () => setLightboxIndex(i => (i! - 1 + galleryPhotos.length) % galleryPhotos.length)
  const next = () => setLightboxIndex(i => (i! + 1) % galleryPhotos.length)

  return (
    <section className="scroll-mt-20 px-6 py-14 sm:px-10 lg:px-14">
      <div className="fade-up flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline" className="section-chip rounded-full px-3 py-1">
            Life
          </Badge>
          <h2 className="section-title mt-5 max-w-sm text-4xl text-foreground sm:text-5xl">
            Beyond the Code
          </h2>
        </div>
        <p className="fade-up delay-1 max-w-xs text-[0.95rem] leading-7 text-foreground/52">
          Between commits — guitar, streetwear & exploring the city.
        </p>
      </div>

      {/* Row 1: two large editorial shots */}
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {galleryPhotos.slice(0, 2).map((photo, i) => (
          <div
            key={photo.src}
            onClick={() => openAt(i)}
            className={cn(
              'gallery-item group fade-up h-[300px] cursor-pointer rounded-[1.6rem] sm:h-[380px]',
              i === 1 && 'delay-1',
            )}
          >
            <img
              src={photo.src}
              alt={`${content.profile.name} personal portfolio photo ${i + 1}`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              style={{ objectPosition: photo.pos }}
            />
            <div className="gallery-tint" aria-hidden="true" />
          </div>
        ))}
      </div>

      {/* Row 2: three smaller shots */}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {galleryPhotos.slice(2).map((photo, i) => (
          <div
            key={photo.src}
            onClick={() => openAt(i + 2)}
            className={cn(
              'gallery-item group fade-up h-[200px] cursor-pointer rounded-[1.6rem] sm:h-[240px]',
              i === 0 && 'delay-1',
              i === 1 && 'delay-2',
              i === 2 && 'col-span-2 sm:col-span-1 delay-3',
            )}
          >
            <img
              src={photo.src}
              alt={`${content.profile.name} personal portfolio photo ${i + 3}`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              style={{ objectPosition: photo.pos }}
            />
            <div className="gallery-tint" aria-hidden="true" />
          </div>
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          content={content}
          index={lightboxIndex}
          onClose={close}
          onPrev={prev}
          onNext={next}
        />
      )}
    </section>
  )
}

// ─── Separator ────────────────────────────────────────────────────────────────

function SectionSeparator() {
  return (
    <Separator className="mx-6 !w-[calc(100%-3rem)] bg-border/40 sm:mx-10 sm:!w-[calc(100%-5rem)] lg:mx-14 lg:!w-[calc(100%-7rem)]" />
  )
}
