import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useRef } from 'react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Eyebrow, Section } from '#/frontend/components/layout/public/Section'
import { site } from '#/frontend/content'
import type { HomeCopy } from '#/frontend/content/types'
import type { Language } from '#/frontend/i18n/language'
import { useReveal } from '#/frontend/motion'

export function AboutTeaser({ copy, language }: { copy: HomeCopy['about']; language: Language }) {
  const ref = useRef<HTMLElement>(null)
  useReveal(ref)

  return (
    <Section ref={ref} tone="paper" className="py-14 lg:py-16">
      <Container className="flex flex-col gap-8 sm:flex-row sm:items-center sm:gap-12">
        <img
          data-reveal
          src={site.portrait}
          alt={site.name}
          width={160}
          height={160}
          loading="lazy"
          className="border-border size-28 shrink-0 rounded-2xl border object-cover sm:size-40"
        />
        <div className="flex max-w-2xl flex-col gap-3">
          <Eyebrow data-reveal>{copy.eyebrow}</Eyebrow>
          <h2 data-reveal className="font-heading text-display-sm">
            {copy.title}
          </h2>
          <p data-reveal className="text-foreground/80 leading-relaxed">
            {copy.body}
          </p>
          <Link
            data-reveal
            to="/$lang/about"
            params={{ lang: language }}
            className="text-primary inline-flex w-fit items-center gap-1.5 text-sm font-medium hover:underline hover:underline-offset-4"
          >
            {copy.link}
            <ArrowRight className="size-4 rtl:-scale-x-100" />
          </Link>
        </div>
      </Container>
    </Section>
  )
}
