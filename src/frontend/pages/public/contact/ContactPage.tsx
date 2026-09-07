import { useRef } from 'react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Eyebrow } from '#/frontend/components/layout/public/Section'
import { getContent, site } from '#/frontend/content'
import { ContactForm } from '#/frontend/features/contact/ContactForm'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { useReveal } from '#/frontend/motion'

export function ContactPage() {
  const { language } = useLanguage()
  const { contact } = getContent(language)
  const ref = useRef<HTMLElement>(null)
  useReveal(ref)

  return (
    <section ref={ref} className="py-16 sm:py-24">
      <Container className="grid gap-14 lg:grid-cols-[1fr_2fr] lg:gap-20">
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-5">
            <Eyebrow data-reveal>{contact.eyebrow}</Eyebrow>
            <h1 data-reveal className="font-heading text-display-lg">
              {contact.title}
            </h1>
            <p data-reveal className="text-muted-foreground text-lg leading-relaxed">
              {contact.intro}
            </p>
          </div>

          <div data-reveal className="border-border flex flex-col gap-4 border-t pt-6">
            <div className="flex flex-col gap-1">
              <p className="text-base font-medium">{contact.aside.title}</p>
              <p className="text-muted-foreground text-sm leading-relaxed">{contact.aside.body}</p>
            </div>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase rtl:tracking-normal">
                  {contact.aside.emailLabel}
                </dt>
                <dd className="m-0">
                  <a href={`mailto:${site.email}`} className="hover:underline hover:underline-offset-4" dir="ltr">
                    {site.email}
                  </a>
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase rtl:tracking-normal">
                  {contact.aside.locationLabel}
                </dt>
                <dd className="m-0">{contact.aside.location}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div data-reveal className="border-border bg-card rounded-2xl border p-6 sm:p-10">
          <ContactForm copy={contact.form} />
        </div>
      </Container>
    </section>
  )
}
