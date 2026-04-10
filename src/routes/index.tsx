import { createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { profile, links, projects, skills } from '../config/config'

export const Route = createFileRoute('/')({ component: Portfolio })

const FORMSPREE_URL = '' // TODO: Replace with your Formspree endpoint, e.g. https://formspree.io/f/xxxxxx

function Portfolio() {
  return (
    <main className="page-wrap space-y-8 px-4 pb-8 pt-14">
      <HeroSection />
      <AboutSection />
      <ProjectsSection />
      <ContactSection />
    </main>
  )
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section
      id="top"
      className="island-shell rise-in relative overflow-hidden rounded-[2rem] px-6 py-14 sm:px-10 sm:py-20"
    >
      <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.22),transparent_66%)]" />
      <div className="pointer-events-none absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.12),transparent_66%)]" />

      <p className="island-kicker mb-4">{profile.location}</p>
      <h1 className="display-title mb-3 max-w-3xl text-5xl font-bold leading-[1.02] tracking-tight text-[var(--sea-ink)] sm:text-7xl">
        {profile.name}
      </h1>
      <p className="mb-5 text-xl font-semibold text-[var(--lagoon-deep)] sm:text-2xl">
        {profile.headline}
      </p>
      <p className="mb-10 max-w-2xl text-base leading-relaxed text-[var(--sea-ink-soft)] sm:text-lg">
        {profile.bio}
      </p>
      <div className="flex flex-wrap gap-3">
        <a
          href="#projects"
          className="inline-flex items-center gap-2 rounded-full bg-[var(--lagoon-deep)] px-5 py-2.5 text-sm font-semibold text-white no-underline transition hover:-translate-y-0.5 hover:brightness-110"
        >
          View Projects
        </a>
        <a
          href="#contact"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:-translate-y-0.5 hover:bg-[var(--link-bg-hover)]"
        >
          Get in Touch
        </a>
      </div>
    </section>
  )
}

// ─── About ───────────────────────────────────────────────────────────────────

function AboutSection() {
  return (
    <section id="about" className="island-shell rounded-2xl px-6 py-10 sm:px-10">
      <p className="island-kicker mb-3">About Me</p>
      <h2 className="display-title mb-5 text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
        Building things that matter
      </h2>
      <div className="mb-8 max-w-2xl space-y-4 text-base leading-relaxed text-[var(--sea-ink-soft)]">
        <p>
          I'm a self-taught full-stack developer based in Erfurt, Germany. I started coding out of
          curiosity and quickly found a passion for building products — from polished interfaces to
          robust backend systems.
        </p>
        <p>
          I believe the best way to grow is to build real things, ship them, and learn from the
          process. I work primarily with React and the modern JavaScript ecosystem.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <span
            key={skill}
            className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1 text-sm font-semibold text-[var(--sea-ink)]"
          >
            {skill}
          </span>
        ))}
      </div>
    </section>
  )
}

// ─── Projects ────────────────────────────────────────────────────────────────

function ProjectsSection() {
  return (
    <section id="projects">
      <div className="mb-6">
        <p className="island-kicker mb-1">Work</p>
        <h2 className="display-title text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
          Projects
        </h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {projects.map((project, index) => (
          <ProjectCard key={project.title} project={project} index={index} />
        ))}
      </div>
    </section>
  )
}

function ProjectCard({
  project,
  index,
}: {
  project: (typeof projects)[0]
  index: number
}) {
  const isLive = project.status === 'live'

  return (
    <article
      className="island-shell feature-card rise-in rounded-2xl p-6"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-[var(--sea-ink)]">{project.title}</h3>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
            isLive
              ? 'border-[rgba(37,99,235,0.2)] bg-[rgba(37,99,235,0.08)] text-[var(--lagoon-deep)]'
              : 'border-[var(--line)] bg-[var(--chip-bg)] text-[var(--sea-ink-soft)]'
          }`}
        >
          {isLive ? 'Live' : 'Coming Soon'}
        </span>
      </div>
      <p className="mb-5 text-sm leading-relaxed text-[var(--sea-ink-soft)]">{project.description}</p>
      {isLive ? (
        <a
          href={project.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-[var(--lagoon-deep)] px-4 py-2 text-sm font-semibold text-white no-underline transition hover:-translate-y-0.5 hover:brightness-110"
        >
          {project.ctaLabel}
          <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
            <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </a>
      ) : (
        <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink-soft)] opacity-60">
          {project.ctaLabel}
        </span>
      )}
    </article>
  )
}

// ─── Contact ─────────────────────────────────────────────────────────────────

type FormStatus = 'idle' | 'sending' | 'sent' | 'error'

function ContactSection() {
  const [status, setStatus] = useState<FormStatus>('idle')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!FORMSPREE_URL) {
      setStatus('error')
      return
    }
    setStatus('sending')
    const formData = new FormData(e.currentTarget)
    try {
      const res = await fetch(FORMSPREE_URL, {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
      })
      setStatus(res.ok ? 'sent' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <section id="contact" className="island-shell rounded-2xl px-6 py-10 sm:px-10">
      <p className="island-kicker mb-3">Contact</p>
      <h2 className="display-title mb-2 text-3xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
        Get in touch
      </h2>
      <p className="mb-8 text-base text-[var(--sea-ink-soft)]">
        Have a project in mind or want to collaborate? Send me a message.
      </p>

      {status === 'sent' ? (
        <div className="rounded-2xl border border-[rgba(37,99,235,0.2)] bg-[rgba(37,99,235,0.06)] p-6 text-center">
          <p className="font-semibold text-[var(--lagoon-deep)]">
            Message sent! I'll get back to you soon.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-xl space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="name"
                className="mb-1.5 block text-sm font-semibold text-[var(--sea-ink)]"
              >
                Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="Your name"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none transition placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon-deep)] focus:ring-2 focus:ring-[rgba(37,99,235,0.15)]"
              />
            </div>
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-semibold text-[var(--sea-ink)]"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="your@email.com"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none transition placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon-deep)] focus:ring-2 focus:ring-[rgba(37,99,235,0.15)]"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="message"
              className="mb-1.5 block text-sm font-semibold text-[var(--sea-ink)]"
            >
              Message
            </label>
            <textarea
              id="message"
              name="message"
              required
              rows={5}
              placeholder="Tell me about your project..."
              className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none transition placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon-deep)] focus:ring-2 focus:ring-[rgba(37,99,235,0.15)]"
            />
          </div>
          {status === 'error' && (
            <p className="text-sm text-red-500">
              {FORMSPREE_URL
                ? 'Something went wrong. Please try again.'
                : 'Contact form not configured yet — email me directly.'}
            </p>
          )}
          <button
            type="submit"
            disabled={status === 'sending'}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--lagoon-deep)] px-6 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === 'sending' ? 'Sending…' : 'Send message'}
          </button>
        </form>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-8">
        <span className="text-sm text-[var(--sea-ink-soft)]">Or reach me directly:</span>
        <a
          href={`mailto:${links.email}`}
          className="text-sm font-semibold text-[var(--lagoon-deep)] hover:underline"
        >
          {links.email}
        </a>
        <a
          href={links.github}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:-translate-y-0.5"
        >
          <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
          GitHub
        </a>
      </div>
    </section>
  )
}
