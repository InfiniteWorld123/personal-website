import type { ReactNode } from 'react'
import type { ContentFieldState, ContentLanguage, ContentValue } from '#/backend2/contracts/content.contract'
import { sameContentValue } from '#/backend2/contracts/content.contract'
import { type LocalEntry, slotKey, useAllLocal } from '#/frontend/features/content-v2/content-store'
import { PAGE_PATH, slotOf } from '#/frontend/features/content-v2/content-words'
import { cn } from '#/frontend/lib/utils'

/**
 * "Preview as visitor" (approved choice 1A): the page in the language being
 * edited, drawn with the public site's own type, colours and buttons, with the
 * wording that is not saved yet outlined.
 *
 * It reads live values from Backend2 and the owner's unsaved wording from the
 * editor, and it can publish nothing. It is a faithful picture of the *words*
 * and their order, not the public components themselves: those still read the
 * legacy content until the approved public cutover connects them to Backend2.
 */

type Read = { value: ContentValue; unsaved: boolean }

const makeReader = (fields: Map<string, ContentFieldState>, local: Map<string, LocalEntry>, language: ContentLanguage) =>
  (key: string): Read | undefined => {
    const field = fields.get(key)
    if (!field) return undefined

    const slot = slotOf(field, language)
    const live = field.slots[slot]!.value
    const entry = local.get(slotKey(key, slot))
    const mine = entry && entry.status !== 'saved' ? entry.value : undefined

    return mine === undefined || sameContentValue(mine, live) ? { value: live, unsaved: false } : { value: mine, unsaved: true }
  }

export function ContentPreview({
  fields,
  page,
  language,
}: {
  fields: ContentFieldState[]
  page: string
  language: ContentLanguage
}) {
  const local = useAllLocal()
  const byKey = new Map(fields.map((field) => [field.key, field]))
  const read = makeReader(byKey, local, language)
  const has = (key: string) => byKey.has(key)

  const T = ({ k, className, as: Tag = 'span' }: { k: string; className?: string; as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'div' }) => {
    const got = read(k)
    if (!got) return null
    const text = Array.isArray(got.value) ? got.value.join(' ') : got.value
    if (text === '') return null

    return <Tag className={className}>{got.unsaved ? <mark className="cv-unsaved" title="Not saved yet">{text}</mark> : text}</Tag>
  }

  const L = ({ k, minus = false }: { k: string; minus?: boolean }) => {
    const got = read(k)
    if (!got || !Array.isArray(got.value)) return null

    return (
      <ul className={cn('cvs-list', minus && 'is-minus')}>
        {got.value.filter((line) => line.trim() !== '').map((line, index) => (
          <li key={index}>{got.unsaved ? <mark className="cv-unsaved">{line}</mark> : line}</li>
        ))}
      </ul>
    )
  }

  const numbered = (prefix: string, leaf: string) => {
    const out: number[] = []
    for (let index = 0; has(`${prefix}.${index}.${leaf}`); index += 1) out.push(index)
    return out
  }

  const Serp = ({ base, path }: { base: string; path: string }) =>
    has(`${base}.meta.title`) ? (
      <div className="cvs-stack">
        <span className="cvs-small">How Google may show this page</span>
        <div className="cvs-serp">
          <span className="cvs-serp-url" dir="ltr">yamanwarda.de/{language}{path}</span>
          <T k={`${base}.meta.title`} className="cvs-serp-title" />
          <T k={`${base}.meta.description`} className="cvs-serp-desc" />
        </div>
      </div>
    ) : null

  const Head = ({ p }: { p: string }) => (
    <div className="cvs-stack">
      <T k={`${p}.eyebrow`} className="cvs-chip" />
      <T k={`${p}.title`} className="cvs-title cvs-title-md" as="h1" />
      <T k={`${p}.intro`} className="cvs-soft" as="p" />
    </div>
  )

  const body: ReactNode[] = []

  if (page === 'home') {
    const typed = read('home.hero.typed[]')
    body.push(
      <div key="hero" className="cvs-stack">
        <T k="home.hero.eyebrow" className="cvs-chip" />
        <T k="home.hero.greeting" className="cvs-h3" as="p" />
        <T k="home.hero.prefix" className="cvs-small" as="p" />
        <h1 className="cvs-title cvs-title-lg">
          <span className="cvs-typed">{Array.isArray(typed?.value) ? typed.value[0] : ''}</span> <T k="home.hero.staticLine" />
        </h1>
        <T k="home.hero.headline" className="cvs-h3" as="p" />
        <T k="home.hero.sub" className="cvs-soft" as="p" />
        <div className="cvs-btns">
          <T k="home.hero.cta" className="cvs-btn cvs-btn-primary" />
          <T k="home.hero.secondary" className="cvs-btn cvs-btn-outline" />
        </div>
        <T k="home.hero.availability" className="cvs-small" as="p" />
      </div>,
      <div key="story" className="cvs-stack">
        <T k="home.story.eyebrow" className="cvs-chip" />
        <T k="home.story.title" className="cvs-title cvs-title-md" as="h2" />
        <T k="home.story.sub" className="cvs-soft" as="p" />
        <div className="cvs-grid">
          {numbered('home.story.steps', 'title').map((index) => (
            <div key={index} className="cvs-card">
              <T k={`home.story.steps.${index}.label`} className="cvs-small" />
              <T k={`home.story.steps.${index}.title`} className="cvs-h3" />
              <T k={`home.story.steps.${index}.body`} className="cvs-soft" />
            </div>
          ))}
        </div>
      </div>,
      <div key="process" className="cvs-stack">
        <T k="home.process.eyebrow" className="cvs-chip" />
        <T k="home.process.title" className="cvs-title cvs-title-md" as="h2" />
        <T k="home.process.sub" className="cvs-soft" as="p" />
        <div className="cvs-grid">
          {numbered('home.process.steps', 'title').map((index) => (
            <div key={index} className="cvs-card">
              <T k={`home.process.steps.${index}.title`} className="cvs-h3" />
              <T k={`home.process.steps.${index}.body`} className="cvs-soft" />
            </div>
          ))}
        </div>
      </div>,
      <div key="fit" className="cvs-stack">
        <T k="home.fit.eyebrow" className="cvs-chip" />
        <T k="home.fit.title" className="cvs-title cvs-title-md" as="h2" />
        <div className="cvs-grid">
          <div className="cvs-card"><T k="home.fit.forTitle" className="cvs-h3" /><L k="home.fit.forItems[]" /></div>
          <div className="cvs-card"><T k="home.fit.notForTitle" className="cvs-h3" /><L k="home.fit.notForItems[]" minus /></div>
        </div>
        <T k="home.fit.honesty" className="cvs-soft" as="p" />
      </div>,
      <div key="cta" className="cvs-card">
        <T k="home.cta.title" className="cvs-title cvs-title-md" as="h2" />
        <T k="home.cta.body" className="cvs-soft" as="p" />
        <div className="cvs-btns">
          <T k="home.cta.button" className="cvs-btn cvs-btn-primary" />
          <T k="home.cta.alt" className="cvs-btn cvs-btn-outline" />
        </div>
      </div>,
      <Serp key="serp" base="home" path="" />,
    )
  } else if (page === 'legal') {
    for (const document of ['impressum', 'privacy'] as const) {
      body.push(
        <div key={document} className="cvs-stack cvs-legal">
          <T k={`legal.${document}.eyebrow`} className="cvs-chip" />
          <T k={`legal.${document}.title`} className="cvs-title cvs-title-md" as="h1" />
          <T k={`legal.${document}.intro`} className="cvs-soft" as="p" />
          {numbered(`legal.${document}.sections`, 'title').map((index) => (
            <div key={index} className="cvs-stack">
              <T k={`legal.${document}.sections.${index}.title`} as="h3" />
              <T k={`legal.${document}.sections.${index}.body`} className="cvs-soft" as="p" />
              <L k={`legal.${document}.sections.${index}.lines[]`} minus />
            </div>
          ))}
          <T k={`legal.${document}.updated`} className="cvs-small" as="p" />
        </div>,
        <Serp key={`${document}-serp`} base={`legal.${document}`} path={document === 'impressum' ? '/impressum' : '/datenschutz'} />,
      )
    }
  } else if (page === 'faq') {
    body.push(<Head key="head" p="faq" />)
    for (const group of numbered('faq.groups', 'title')) {
      body.push(
        <div key={group} className="cvs-stack">
          <T k={`faq.groups.${group}.title`} className="cvs-h3" as="h2" />
          {numbered(`faq.groups.${group}.items`, 'question').map((index) => (
            <div key={index} className="cvs-faq">
              <T k={`faq.groups.${group}.items.${index}.question`} className="cvs-h3" />
              <T k={`faq.groups.${group}.items.${index}.answer`} className="cvs-soft" />
            </div>
          ))}
        </div>,
      )
    }
    body.push(<Serp key="serp" base="faq" path="/faq" />)
  } else if (page === 'site' || page === 'shell') {
    body.push(
      <span key="note" className="cvs-small">The footer on every page, and your details on the contact page</span>,
      <div key="footer" className="cvs-card">
        <T k="shell.footer.tagline" className="cvs-soft" as="p" />
        <div className="cvs-row">
          <T k="shell.footer.location" />
          <T k="site.email" />
          <T k="site.phone" />
        </div>
        <div className="cvs-row" dir="ltr">
          <T k="site.github" />
          <T k="site.linkedin" />
        </div>
        <T k="shell.footer.builtWith" className="cvs-small" as="p" />
      </div>,
      <div key="contact" className="cvs-card">
        <T k="contact.aside.emailLabel" className="cvs-h3" />
        <T k="site.email" />
        <T k="contact.aside.locationLabel" className="cvs-h3" />
        <T k="site.city" />
      </div>,
    )
  } else if (page === 'notFound') {
    body.push(
      <div key="404" className="cvs-stack">
        <span className="cvs-chip">404</span>
        <T k="notFound.title" className="cvs-title cvs-title-md" as="h1" />
        <T k="notFound.body" className="cvs-soft" as="p" />
        <div className="cvs-btns"><T k="notFound.link" className="cvs-btn cvs-btn-primary" /></div>
      </div>,
    )
  } else {
    body.push(<Head key="head" p={page} />)
    const groups = new Map<string, ContentFieldState[]>()
    for (const field of fields) {
      if (field.page !== page || field.section === 'meta' || field.section === 'header') continue
      groups.set(field.section, [...(groups.get(field.section) ?? []), field])
    }
    for (const [section, items] of groups) {
      body.push(
        <div key={section} className="cvs-card">
          {items.map((field) =>
            field.kind === 'list' ? (
              <L key={field.key} k={field.key} />
            ) : (
              <T
                key={field.key}
                k={field.key}
                as="div"
                className={/\.(title|question|label)$/u.test(field.key) ? 'cvs-h3' : field.kind === 'longText' ? 'cvs-soft' : undefined}
              />
            ),
          )}
        </div>,
      )
    }
    body.push(<Serp key="serp" base={page} path={PAGE_PATH[page] ?? ''} />)
  }

  return (
    <div className="cvs" dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language}>
      <div className="cvs-bar">
        <span className="cvs-logo" aria-hidden="true" />
        <span className="cvs-bar-name">Yaman Warda</span>
        <T k="shell.cta" className="cvs-btn cvs-btn-primary" />
      </div>
      <div className="cvs-wrap">{body}</div>
    </div>
  )
}
