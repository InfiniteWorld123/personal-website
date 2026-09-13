import { Languages, Mail, MapPin } from 'lucide-react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Eyebrow } from '#/frontend/components/layout/public/Section'
import { getContent, site } from '#/frontend/content'
import { BookingAside } from '#/frontend/features/booking/BookingAside'
import { ContactForm } from '#/frontend/features/contact/ContactForm'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { SplitWords, useReveal, useTilt } from '#/frontend/motion'

export function ContactPage() {
  const { language } = useLanguage()
  const { contact } = getContent(language)
  const ref = useReveal<HTMLElement>()
  const mailTilt = useTilt<HTMLAnchorElement>()
  const placeTilt = useTilt<HTMLDivElement>()
  const langTilt = useTilt<HTMLDivElement>()

  return (
    <section ref={ref} data-reveal-scope="" className="contact-page">
      <Container className="contact-layout">
        <div className="contact-intro flex flex-col gap-8">
          <div className="flex flex-col">
            <Eyebrow data-reveal>{contact.eyebrow}</Eyebrow>
            <h1 className="section-title mt-5 text-display-lg text-foreground"><SplitWords text={contact.title} /></h1>
            <p data-reveal className="hero-copy mt-5 text-base leading-8 sm:text-[1.05rem]">{contact.intro}</p>
          </div>

          {/* The faster route, offered once and above the details: whoever
              lands here has already decided to get in touch, and the form is
              still right beside it for whoever would rather write. */}
          <BookingAside />

          <div className="flex flex-col gap-3">
            <p className="text-base font-semibold text-foreground">{contact.aside.title}</p>
            <p className="m-0 text-sm leading-7 text-foreground/58">{contact.aside.body}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <a
              href={`mailto:${site.email}`}
              data-tilt
              ref={mailTilt}
              className="contact-info-card flex items-center gap-4 rounded-[1.4rem] px-5 py-4"
            >
              <span className="brand-mark text-primary">
                <Mail className="size-4" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-foreground/45 rtl:tracking-normal">
                  {contact.aside.emailLabel}
                </span>
                <span className="truncate text-sm font-semibold text-foreground" dir="ltr">
                  {site.email}
                </span>
              </span>
            </a>
            <div data-tilt ref={placeTilt} className="contact-info-card flex items-center gap-4 rounded-[1.4rem] px-5 py-4">
              <span className="brand-mark text-primary">
                <MapPin className="size-4" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-foreground/45 rtl:tracking-normal">
                  {contact.aside.locationLabel}
                </span>
                <span className="text-sm font-semibold text-foreground">{contact.aside.location}</span>
              </span>
            </div>
            <div data-tilt ref={langTilt} className="contact-info-card flex items-center gap-4 rounded-[1.4rem] px-5 py-4">
              <span className="brand-mark text-primary">
                <Languages className="size-4" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-foreground/45 rtl:tracking-normal">
                  {contact.aside.languagesLabel}
                </span>
                <span className="text-sm font-semibold text-foreground">{contact.aside.languages}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="contact-form-card rounded-[1.75rem] p-6 sm:p-9">
          <ContactForm copy={contact.form} language={language} />
        </div>
      </Container>
    </section>
  )
}
