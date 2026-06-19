import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  defaultLanguage,
  links,
  portfolioContent,
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
  }, [language])

  return (
    <>
      {/* Full-width seamless layout — no outer card, no background contrast */}
      <div className="main-shell">
        <PortfolioHeader content={content} language={language} onLanguageChange={setLanguage} />

        {/* All sections share an inner-wrap to keep content readable on wide screens */}
        <div className="inner-wrap">
          <HeroSection content={content} />
          <SectionSeparator />
          <AboutSection content={content} />
          <SectionSeparator />
          <ProjectsSection content={content} />
        </div>

        {/* Contact spans full width so its tinted bg goes edge-to-edge */}
        <ContactSection content={content} />
      </div>

      <footer className="inner-wrap flex flex-col gap-3 px-6 pb-8 pt-5 text-center text-sm text-foreground/38 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:text-left lg:px-14">
        <p className="m-0">
          {content.profile.name} · {content.profile.location}
        </p>
        <Button
          asChild
          variant="ghost"
          className="mx-auto rounded-full border border-border/50 bg-card px-4 text-foreground/52 hover:bg-primary/5 hover:text-primary sm:mx-0"
        >
          <a href={links.github} target="_blank" rel="noreferrer">
            {content.ui.viewGitHub}
          </a>
        </Button>
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
      <div className="inner-wrap flex items-center justify-between gap-3 px-6 py-4 sm:px-10 lg:px-14">
        {/* Brand */}
        <a
          href="#home"
          className="inline-flex items-center gap-3 text-sm font-semibold tracking-[0.18em] text-foreground no-underline"
        >
          <span className="brand-mark">{profile.initials}</span>
          <span className="hidden text-[0.8rem] font-bold uppercase tracking-widest sm:inline">
            Yaman Warda
          </span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navigation.map((item) => (
            <Button
              key={item.href}
              asChild
              variant="ghost"
              size="sm"
              className="rounded-full px-4 text-[0.82rem] font-semibold text-foreground/52 hover:bg-primary/6 hover:text-foreground"
            >
              <a href={item.href}>{item.label}</a>
            </Button>
          ))}
        </nav>

        {/* CTA + mobile menu */}
        <div className="flex items-center gap-2">
          <LanguageSwitcher
            content={content}
            language={language}
            onLanguageChange={onLanguageChange}
          />
          <ThemeToggle />

          <Button
            asChild
            size="lg"
            className="hidden rounded-full bg-primary px-5 text-primary-foreground shadow-[0_6px_24px_rgba(53,92,255,0.28)] hover:bg-primary/90 sm:inline-flex"
          >
            <a href="#contact">{ui.connectCta}</a>
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full border-border/60 bg-card md:hidden"
                aria-label={ui.openNavigationMenu}
              >
                <Menu />
              </Button>
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
                      className="justify-start rounded-2xl px-4 py-5 text-left text-sm font-semibold"
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
                    className="w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <a href={links.github} target="_blank" rel="noreferrer">
                      GitHub
                    </a>
                  </Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
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
          className="h-11 rounded-full border-border/60 bg-card px-4 text-foreground/72 shadow-sm hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
        >
          <Languages className="size-4" />
          <span className="min-w-16 text-sm font-bold">{content.ui.languageOptions[language]}</span>
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
              'rounded-full text-foreground/58 shadow-none transition-all hover:bg-card/70 hover:text-foreground',
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

function HeroSection({ content }: { content: PortfolioContent }) {
  const { profile, skills, ui } = content

  return (
    <section
      id="home"
      className="scroll-mt-20 px-6 pb-16 pt-12 sm:px-10 sm:pb-20 sm:pt-14 lg:px-14 lg:pt-16"
    >
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)] lg:items-center">
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

          <h1 className="hero-display mt-2 text-[clamp(3.2rem,8vw,5.8rem)] font-black uppercase leading-[0.88] tracking-[-0.07em] text-foreground">
            <span className="block">{profile.heroLines[0]}</span>
            <span className="hero-accent block">{profile.heroLines[1]}</span>
          </h1>

          <p className="hero-copy mt-6 max-w-xl text-base leading-8 sm:text-[1.05rem]">
            {profile.lead}
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-primary px-7 text-primary-foreground shadow-[0_12px_32px_rgba(53,92,255,0.28)] hover:bg-primary/90"
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
              className="rounded-full border-border/60 bg-card px-7 text-foreground hover:bg-primary/5 hover:border-primary/30"
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
              className="rounded-full border border-border/60 bg-card text-foreground/70 hover:bg-primary/6 hover:text-primary"
            >
              <a href={links.github} target="_blank" rel="noreferrer" aria-label="Open GitHub">
                <Github />
              </a>
            </Button>
            <a
              href={`mailto:${links.email}`}
              className="text-sm font-medium text-foreground/48 hover:text-primary"
            >
              {links.email}
            </a>
          </div>

          {/* Skill badges */}
          <div className="mt-7 flex flex-wrap gap-2">
            {skills.map((skill) => (
              <Badge
                key={skill}
                variant="outline"
                className="rounded-full border-border/60 bg-card px-3 py-1 text-[0.72rem] font-semibold text-foreground/60"
              >
                {skill}
              </Badge>
            ))}
          </div>
        </div>

        {/* Right: portrait blob */}
        <PortraitPlaceholder content={content} />
      </div>
    </section>
  )
}

function PortraitPlaceholder({ content }: { content: PortfolioContent }) {
  const { profile, ui } = content

  return (
    <div className="fade-up delay-2 flex items-center justify-center py-4">
      <div className="relative flex w-full max-w-[400px] items-center justify-center">
        <div className="portrait-blob relative flex h-[360px] w-[320px] items-center justify-center sm:h-[420px] sm:w-[375px]">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-white/50 bg-white/22 text-4xl font-bold tracking-tight text-white shadow-[0_8px_32px_rgba(0,0,0,0.14)]">
              {profile.initials}
            </div>
            <span className="rounded-full border border-white/30 bg-white/18 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
              {ui.addPhoto}
            </span>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 rounded-full bg-primary/8 blur-3xl" />
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
      className="scroll-mt-20 grid gap-8 px-6 py-14 sm:px-10 lg:grid-cols-[0.9fr_1.1fr] lg:px-14"
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
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
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
          className="fade-up shrink-0 rounded-full border-border/60 bg-card px-5 text-foreground/64 hover:bg-primary/5 hover:border-primary/30 hover:text-primary"
        >
          <a href={links.github} target="_blank" rel="noreferrer">
            {ui.seeAllGitHub}
            <ArrowUpRight />
          </a>
        </Button>
      </div>

      <div className="mt-10 flex flex-col gap-5 lg:flex-row lg:items-stretch">
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
      className="project-card fade-up flex min-w-0 flex-col rounded-[1.75rem] border-border/50 bg-card py-0 shadow-[0_4px_24px_rgba(16,23,47,0.07)] lg:flex-1"
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
        <span className="text-sm font-medium text-foreground/36">0{index + 1}</span>
        {isLive && (websiteHref || githubHref) ? (
          <div className="flex flex-wrap justify-end gap-2">
            {websiteHref && (
              <Button
                asChild
                className="rounded-full bg-primary px-4 text-primary-foreground shadow-[0_6px_20px_rgba(53,92,255,0.22)] hover:bg-primary/90"
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
                className="rounded-full border-border/50 bg-card px-4 text-foreground/68 hover:bg-primary/5 hover:border-primary/30 hover:text-primary"
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
                icon={<Github className="size-4 text-primary" />}
                title={ui.contactGithubTitle}
                value="InfiniteWorld123"
                href={links.github}
              />
              <ContactInfoCard
                icon={<MapPin className="size-4 text-primary" />}
                title={ui.contactLocationTitle}
                value={profile.location}
              />
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
                      className="rounded-full bg-primary px-7 text-primary-foreground shadow-[0_8px_24px_rgba(53,92,255,0.26)] hover:bg-primary/90"
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

// ─── Separator ────────────────────────────────────────────────────────────────

function SectionSeparator() {
  return <Separator className="mx-6 w-auto bg-border/40 sm:mx-10 lg:mx-14" />
}
