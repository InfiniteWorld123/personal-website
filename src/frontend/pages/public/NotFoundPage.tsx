import { Link } from '@tanstack/react-router'
import { Container } from '#/frontend/components/layout/public/Container'
import { Button } from '#/frontend/components/ui/button'
import { getContent } from '#/frontend/content'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'

export function NotFoundPage({ language }: { language?: string }) {
  const resolved = isLanguage(language) ? language : defaultLanguage
  const { notFound } = getContent(resolved)

  return (
    <section className="py-24">
      <Container className="flex max-w-xl flex-col gap-5">
        <h1 className="section-title text-display-lg text-foreground">{notFound.title}</h1>
        <p className="text-muted-foreground text-lg">{notFound.body}</p>
        <Button asChild className="btn-glow-primary w-fit rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90">
          <Link to="/$lang" params={{ lang: resolved }}>
            {notFound.link}
          </Link>
        </Button>
      </Container>
    </section>
  )
}
