// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { editableFieldByKey } from '#/frontend/content/editable'
import { ContentOverlayContext } from '#/frontend/features/content/content-overlay'
import { ContentFieldRow } from '#/frontend/pages/admin/content/ContentFieldRow'
import { fieldLabel, sectionOf } from '#/frontend/pages/admin/content/content-format'
import { SectionHeading } from '#/frontend/components/layout/public/Section'
import type { EditableField } from '#/frontend/content/editable'
import type { ContentValue } from '#/shared/types/content.types'

vi.mock('#/frontend/motion', () => ({
  SplitWords: ({ text }: { text: string }) => <span>{text}</span>,
  useReveal: () => ({ current: null }),
}))

afterEach(cleanup)

const field = (key: string): EditableField => {
  const found = editableFieldByKey.get(key)
  if (!found) throw new Error(`${key} is not editable`)

  return found
}

const row = (
  key: string,
  value: ContentValue | undefined,
  overrides: Partial<Parameters<typeof ContentFieldRow>[0]> = {},
) => {
  const onChange = vi.fn()
  const onReset = vi.fn()
  const onReviewed = vi.fn()

  render(
    <ContentFieldRow
      field={field(key)}
      value={value}
      language="de"
      isDraft={false}
      needsReview={false}
      locked={false}
      onChange={onChange}
      onReset={onReset}
      onReviewed={onReviewed}
      {...overrides}
    />,
  )

  return { onChange, onReset, onReviewed }
}

describe('a field in the content form', () => {
  it('shows the current wording and reports every change', () => {
    const { onChange } = row('home.hero.headline', 'Dein direkter Partner für digitale Projekte.')

    const input = screen.getByDisplayValue('Dein direkter Partner für digitale Projekte.')
    fireEvent.change(input, { target: { value: 'Ein Partner, kein Anbieter.' } })

    expect(onChange).toHaveBeenCalledWith('Ein Partner, kein Anbieter.')
  })

  it('counts against the length the design expects and says when it is past it', () => {
    row('home.meta.title', 'Kurz')
    expect(screen.getByText('4 / 60')).toBeTruthy()

    cleanup()

    row('home.meta.title', 'x'.repeat(75))
    expect(screen.getByText(/75 \/ 60/)).toBeTruthy()
    expect(screen.getByText(/longer than the design expects/)).toBeTruthy()
  })

  it('never sends an empty value — clearing a field is "restore the original"', () => {
    const { onChange } = row('home.hero.cta', 'Termin buchen')

    fireEvent.change(screen.getByDisplayValue('Termin buchen'), { target: { value: '   ' } })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('edits a list entry by entry, adds, removes and reorders', () => {
    const { onChange } = row('home.hero.typed[]', ['WEB-', 'SHOP-', 'SOFTWARE-'])

    fireEvent.change(screen.getByDisplayValue('SHOP-'), { target: { value: 'APP-' } })
    expect(onChange).toHaveBeenLastCalledWith(['WEB-', 'APP-', 'SOFTWARE-'])

    fireEvent.click(screen.getAllByTitle('Move up')[1])
    expect(onChange).toHaveBeenLastCalledWith(['APP-', 'WEB-', 'SOFTWARE-'])

    fireEvent.click(screen.getAllByTitle('Remove')[0])
    expect(onChange).toHaveBeenLastCalledWith(['WEB-', 'SOFTWARE-'])
  })

  it('keeps a price a number', () => {
    const { onChange } = row('price.websites', 990)

    fireEvent.change(screen.getByDisplayValue('990'), { target: { value: '1290' } })

    expect(onChange).toHaveBeenCalledWith(1290)
  })

  it('says when a value is written once for all three languages', () => {
    row('site.email', 'yamanwarda06@gmail.com')

    expect(screen.getByText('all languages')).toBeTruthy()
  })

  it('offers the way back to the code’s wording', () => {
    const { onReset } = row('home.hero.headline', 'Etwas anderes.')

    fireEvent.click(screen.getByRole('button', { name: /Original/ }))

    expect(onReset).toHaveBeenCalled()
  })

  it('marks a draft and lets the other languages be signed off', () => {
    const { onReviewed } = row('home.hero.headline', 'Etwas anderes.', {
      isDraft: true,
      needsReview: true,
    })

    expect(screen.getByText('draft')).toBeTruthy()
    expect(screen.getByText('needs review')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Looks right/ }))
    expect(onReviewed).toHaveBeenCalled()
  })

  it('cannot be typed into while the legal documents are locked', () => {
    const { onChange } = row('legal.impressum.intro', 'Angaben gemäß § 5 TMG.', { locked: true })

    const input = screen.getByDisplayValue('Angaben gemäß § 5 TMG.') as HTMLTextAreaElement
    expect(input.disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'etwas' } })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('the form’s own labelling', () => {
  it('names a field by what is left after the page and the section', () => {
    expect(fieldLabel('home.hero.headline')).toBe('Headline')
    expect(fieldLabel('home.process.steps.0.body')).toBe('Steps · #1 · Body')
    expect(fieldLabel('blog.title')).toBe('Title')
  })

  it('files a field under the section it belongs to', () => {
    expect(sectionOf('home.hero.headline')).toBe('hero')
    expect(sectionOf('legal.impressum.title')).toBe('impressum')
    expect(sectionOf('blog.title')).toBe('general')
  })
})

describe('the preview overlay', () => {
  const heading = (overlay: ContentValue | undefined) =>
    render(
      <ContentOverlayContext.Provider
        value={{ value: () => overlay, version: 1 }}
      >
        <SectionHeading
          eyebrow="Leistungen"
          title="Was ich für dich bauen kann."
          eyebrowKey="home.services.eyebrow"
          titleKey="home.services.title"
        />
      </ContentOverlayContext.Provider>,
    )

  it('shows the unpublished wording in place of the published one', () => {
    heading('Was ich baue.')

    expect(screen.getByRole('heading').textContent).toBe('Was ich baue.')
  })

  it('falls back to the page’s own words when there is no draft', () => {
    heading(undefined)

    expect(screen.getByRole('heading').textContent).toBe('Was ich für dich bauen kann.')
  })

  it('renders the page untouched when there is no overlay at all', () => {
    render(
      <SectionHeading
        eyebrow="Leistungen"
        title="Was ich für dich bauen kann."
        eyebrowKey="home.services.eyebrow"
        titleKey="home.services.title"
      />,
    )

    expect(screen.getByRole('heading').textContent).toBe('Was ich für dich bauen kann.')
    expect(within(screen.getByRole('heading')).queryByRole('textbox')).toBeNull()
  })
})
