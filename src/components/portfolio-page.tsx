import { useState, type FormEvent, type ReactNode } from 'react'
import {
  aboutHighlights,
  links,
  navigation,
  profile,
  projects,
  skills,
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
  Github,
  Mail,
  MapPin,
  Menu,
  Send,
} from 'lucide-react'

type FormStatus = 'idle' | 'sending' | 'sent' | 'redirected' | 'error'

const statusLabels: Record<ProjectStatus, string> = {
  live: 'Live',
  'coming-soon': 'Soon',
  placeholder: 'Reserved',
}

const statusClasses: Record<ProjectStatus, string> = {
  live: 'border-primary/15 bg-primary/10 text-primary',
  'coming-soon': 'border-foreground/10 bg-foreground/[0.04] text-foreground/60',
  placeholder: 'border-foreground/10 bg-background/90 text-foreground/50',
}

export function PortfolioPage() {
  return (
    <>
      {/* Full-width seamless layout — no outer card, no background contrast */}
      <div className="main-shell">
        <PortfolioHeader />

        {/* All sections share an inner-wrap to keep content readable on wide screens */}
        <div className="inner-wrap">
          <HeroSection />
          <SectionSeparator />
          <AboutSection />
          <SectionSeparator />
          <ProjectsSection />
        </div>

        {/* Contact spans full width so its tinted bg goes edge-to-edge */}
        <ContactSection />
      </div>

      <footer className="inner-wrap flex flex-col gap-3 px-6 pb-8 pt-5 text-center text-sm text-foreground/38 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:text-left lg:px-14">
        <p className="m-0">
          {profile.name} · {profile.location}
        </p>
        <Button
          asChild
          variant="ghost"
          className="mx-auto rounded-full border border-border/50 bg-white px-4 text-foreground/52 hover:bg-primary/5 hover:text-primary sm:mx-0"
        >
          <a href={links.github} target="_blank" rel="noreferrer">
            View GitHub
          </a>
        </Button>
      </footer>
    </>
  )
}

// ─── Header ──────────────────────────────────────────────────────────────────

function PortfolioHeader() {
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
          <Button
            asChild
            size="lg"
            className="hidden rounded-full bg-primary px-5 text-primary-foreground shadow-[0_6px_24px_rgba(53,92,255,0.28)] hover:bg-primary/90 sm:inline-flex"
          >
            <a href="#contact">Let&apos;s Connect</a>
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full border-border/60 bg-white md:hidden"
                aria-label="Open navigation menu"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[85vw] max-w-xs border-l border-border/30 bg-white px-0"
            >
              <SheetHeader className="pb-2">
                <SheetTitle>{profile.name}</SheetTitle>
                <SheetDescription>Portfolio navigation</SheetDescription>
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

// ─── Hero ─────────────────────────────────────────────────────────────────────

function HeroSection() {
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
                Let&apos;s Connect
                <ArrowRight />
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-border/60 bg-white px-7 text-foreground hover:bg-primary/5 hover:border-primary/30"
            >
              <a href="#projects">
                See Projects
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
              className="rounded-full border border-border/60 bg-white text-foreground/70 hover:bg-primary/6 hover:text-primary"
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
                className="rounded-full border-border/60 bg-white px-3 py-1 text-[0.72rem] font-semibold text-foreground/60"
              >
                {skill}
              </Badge>
            ))}
          </div>
        </div>

        {/* Right: portrait blob */}
        <PortraitPlaceholder />
      </div>
    </section>
  )
}

function PortraitPlaceholder() {
  return (
    <div className="fade-up delay-2 flex items-center justify-center py-4">
      <div className="relative flex w-full max-w-[400px] items-center justify-center">
        <div className="portrait-blob relative flex h-[360px] w-[320px] items-center justify-center sm:h-[420px] sm:w-[375px]">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-white/50 bg-white/22 text-4xl font-bold tracking-tight text-white shadow-[0_8px_32px_rgba(0,0,0,0.14)]">
              {profile.initials}
            </div>
            <span className="rounded-full border border-white/30 bg-white/18 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
              Add your photo here
            </span>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 rounded-full bg-primary/8 blur-3xl" />
      </div>
    </div>
  )
}

// ─── About ────────────────────────────────────────────────────────────────────

function AboutSection() {
  return (
    <section
      id="about"
      className="scroll-mt-20 grid gap-8 px-6 py-14 sm:px-10 lg:grid-cols-[0.9fr_1.1fr] lg:px-14"
    >
      <div className="fade-up">
        <Badge variant="outline" className="section-chip rounded-full px-3 py-1">
          About
        </Badge>
        <h2 className="section-title mt-5 max-w-sm text-4xl text-foreground sm:text-5xl">
          Simple on the surface, solid underneath.
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
              className="rounded-[1.4rem] border-border/50 bg-white py-0 shadow-[0_4px_20px_rgba(16,23,47,0.06)]"
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

function ProjectsSection() {
  return (
    <section id="projects" className="scroll-mt-20 px-6 py-14 sm:px-10 lg:px-14">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="fade-up">
          <Badge variant="outline" className="section-chip rounded-full px-3 py-1">
            Projects
          </Badge>
          <h2 className="section-title mt-5 text-4xl text-foreground sm:text-5xl">
            Selected builds, kept intentionally focused.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-foreground/58">
            A small portfolio reads better when every project has a reason to be here, so this
            section stays short on purpose.
          </p>
        </div>

        <Button
          asChild
          variant="outline"
          className="fade-up shrink-0 rounded-full border-border/60 bg-white px-5 text-foreground/64 hover:bg-primary/5 hover:border-primary/30 hover:text-primary"
        >
          <a href={links.github} target="_blank" rel="noreferrer">
            See all on GitHub
            <ArrowUpRight />
          </a>
        </Button>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {projects.map((project, index) => (
          <ProjectCard key={project.title} project={project} index={index} />
        ))}
      </div>
    </section>
  )
}

function ProjectCard({ project, index }: { project: Project; index: number }) {
  const isLive = project.status === 'live'

  return (
    <Card
      className="project-card fade-up flex flex-col rounded-[1.75rem] border-border/50 bg-white py-0 shadow-[0_4px_24px_rgba(16,23,47,0.07)]"
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
              statusClasses[project.status]
            )}
          >
            {statusLabels[project.status]}
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
        {isLive && project.href ? (
          <Button
            asChild
            className="rounded-full bg-primary px-5 text-primary-foreground shadow-[0_6px_20px_rgba(53,92,255,0.22)] hover:bg-primary/90"
          >
            <a href={project.href} target="_blank" rel="noreferrer">
              {project.ctaLabel}
              <ArrowUpRight />
            </a>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled
            className="rounded-full border-border/50 bg-white px-5 text-foreground/38"
          >
            {project.ctaLabel}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

// ─── Contact ──────────────────────────────────────────────────────────────────

function ContactSection() {
  const [status, setStatus] = useState<FormStatus>('idle')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const name = String(formData.get('name') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const message = String(formData.get('message') ?? '').trim()

    if (!links.formEndpoint) {
      const subject = encodeURIComponent(`Portfolio inquiry from ${name}`)
      const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`)
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
              Contact
            </Badge>
            <h2 className="section-title mt-5 text-4xl text-foreground sm:text-5xl">
              Let&apos;s talk if the work feels right.
            </h2>
            <p className="mt-4 max-w-md text-base leading-8 text-foreground/58">
              I&apos;m focused on building my own direction and open to collaborating when the
              connection is real.
            </p>

            <div className="mt-8 space-y-3">
              <ContactInfoCard
                icon={<Mail className="size-4 text-primary" />}
                title="Email"
                value={links.email}
                href={`mailto:${links.email}`}
              />
              <ContactInfoCard
                icon={<Github className="size-4 text-primary" />}
                title="GitHub"
                value="InfiniteWorld123"
                href={links.github}
              />
              <ContactInfoCard
                icon={<MapPin className="size-4 text-primary" />}
                title="Location"
                value={profile.location}
              />
            </div>
          </div>

          {/* ── Right: form card ── */}
          <div className="fade-up delay-1">
            <div className="contact-form-card rounded-[1.6rem] p-8 sm:p-10">
              <h3 className="text-xl font-semibold text-foreground">Send a message</h3>
              <p className="mt-1 text-sm leading-6 text-foreground/50">
                No Formspree endpoint yet? Submitting will open your email app with everything
                prefilled.
              </p>

              <form onSubmit={handleSubmit} className="mt-7 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-foreground/72">
                      Full name
                    </Label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="Your name"
                      required
                      className="h-12 rounded-xl border-border/60 bg-white px-4 focus:border-primary/40"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-foreground/72">
                      Email
                    </Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="name@example.com"
                      required
                      className="h-12 rounded-xl border-border/60 bg-white px-4 focus:border-primary/40"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message" className="text-foreground/72">
                    Message
                  </Label>
                  <Textarea
                    id="message"
                    name="message"
                    rows={5}
                    placeholder="Tell me a little about what you have in mind."
                    required
                    className="min-h-[140px] resize-none rounded-xl border-border/60 bg-white px-4 py-3 focus:border-primary/40"
                  />
                </div>

                <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                  <ContactStatusMessage status={status} />
                  <Button
                    type="submit"
                    size="lg"
                    disabled={status === 'sending'}
                    className="rounded-full bg-primary px-7 text-primary-foreground shadow-[0_8px_24px_rgba(53,92,255,0.26)] hover:bg-primary/90"
                  >
                    {status === 'sending' ? 'Sending...' : 'Send message'}
                    <Send />
                  </Button>
                </div>
              </form>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}

function ContactStatusMessage({ status }: { status: FormStatus }) {
  if (status === 'idle') {
    return (
      <p className="text-sm text-foreground/44">
        You can also email me directly if that&apos;s easier.
      </p>
    )
  }

  const message =
    status === 'sent'
      ? 'Message sent successfully.'
      : status === 'redirected'
        ? 'Email app should open with message prefilled.'
        : status === 'error'
          ? 'Something went wrong. Please try again.'
          : 'Sending your message...'

  return (
    <Badge
      variant="outline"
      className={cn(
        'h-auto rounded-full px-3 py-2 text-left text-[0.74rem] font-semibold',
        status === 'error'
          ? 'border-destructive/20 bg-destructive/10 text-destructive'
          : 'border-primary/15 bg-primary/10 text-primary'
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
    <div className="contact-info-card flex items-center gap-5 rounded-[1.2rem] px-6 py-5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/14 bg-primary/8">
        {icon}
      </div>
      <div>
        <p className="m-0 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-foreground/40">
          {title}
        </p>
        <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
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
