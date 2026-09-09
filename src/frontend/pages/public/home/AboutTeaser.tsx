import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Eyebrow, Section } from '#/frontend/components/layout/public/Section'
import { SplitWords } from '#/frontend/motion'
import { Button } from '#/frontend/components/ui/button'
import type { HomeCopy } from '#/frontend/content/types'
import type { Language } from '#/frontend/i18n/language'

export function AboutTeaser({ copy, language }: { copy: HomeCopy['about']; language: Language }) {
  return (
    <Section className="py-12 lg:py-14">
      <Container className="grid gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-start">
        <div className="flex flex-col">
          <Eyebrow data-reveal>{copy.eyebrow}</Eyebrow>
          <h2 className="section-title mt-5 max-w-sm text-display-md text-foreground">
            <SplitWords text={copy.title} />
          </h2>
        </div>
        <div className="flex flex-col gap-6">
          <p data-reveal className="m-0 text-base leading-8 text-foreground/62">
            {copy.body}
          </p>
          <Button
            asChild
            variant="outline"
            data-reveal
            className="w-fit rounded-full border-border/60 bg-card px-5 text-foreground/70 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
          >
            <Link to="/$lang/about" params={{ lang: language }}>
              {copy.link}
              <ArrowRight className="rtl:-scale-x-100" />
            </Link>
          </Button>
        </div>
      </Container>
    </Section>
  )
}
