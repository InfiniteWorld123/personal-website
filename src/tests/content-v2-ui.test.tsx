// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type {
  ContentFieldDefinition,
  ContentFieldState,
  ContentSnapshot,
  ContentValue,
} from '#/backend2/contracts/content.contract'
import { ApiRequestError } from '#/frontend/api/response'

/**
 * The Content screen (`docs/v2/content.md`), approved in the Design Lab on
 * 23 Sep 2026. What is under test is what the owner has to be able to trust:
 * "live" is said only after the server confirms it, nothing is sent while
 * typing, a failed or refused save keeps the wording, Legal cannot change
 * while locked, and leaving with a change that is not live asks first.
 */

/* ------------------------------------------------------------- the seams */

const navigate = vi.fn()
let search: Record<string, unknown> = {}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useSearch: () => search,
  useBlocker: () => ({ status: 'idle', proceed: () => {}, reset: () => {} }),
}))

const api = {
  readContent: vi.fn(),
  saveContentField: vi.fn(),
  restoreContentOriginal: vi.fn(),
  markContentReviewed: vi.fn(),
  listContentHistory: vi.fn(),
  restoreContentHistory: vi.fn(),
}

vi.mock('#/frontend/features/content-v2/api', () => api)

const { ContentPage, parseContentSearch } = await import('#/frontend/pages/dashboard/content/ContentPage')
const { contentStore } = await import('#/frontend/features/content-v2/content-store')
const { fieldLabel } = await import('#/frontend/features/content-v2/content-words')

/* -------------------------------------------------------------- fixtures */

const definition = (key: string, over: Partial<ContentFieldDefinition> = {}): ContentFieldDefinition => ({
  key,
  page: key.split('.')[0],
  section: key.split('.').length >= 3 ? key.split('.')[1] : 'header',
  kind: 'text',
  scope: key.startsWith('legal.') ? 'legal' : 'copy',
  format: 'plain',
  shared: false,
  optional: false,
  guidance: 60,
  minEntries: 0,
  maxEntries: 0,
  ...over,
})

const slot = (value: ContentValue, over: Partial<ContentFieldState['slots']['de']> = {}) => ({
  value,
  original: value,
  isOriginal: true,
  revision: 0,
  needsReview: false,
  updatedAt: null,
  ...over,
})

const perLanguage = (key: string, values: Record<'de' | 'en' | 'ar', ContentValue>, over: Partial<ContentFieldDefinition> = {}): ContentFieldState => ({
  ...definition(key, over),
  slots: { de: slot(values.de), en: slot(values.en), ar: slot(values.ar) },
})

const snapshot = (): ContentSnapshot => ({
  pages: ['home', 'legal', 'site'],
  reviewCounts: { de: 0, en: 1, ar: 0 },
  fields: [
    perLanguage('home.hero.headline', { de: 'Dein Partner.', en: 'Your partner.', ar: 'شريكك.' }),
    {
      ...perLanguage('home.hero.sub', { de: 'Ich höre zu.', en: 'I listen.', ar: 'أستمع.' }, { kind: 'longText', guidance: 90 }),
    },
    perLanguage('home.hero.typed[]', { de: ['WEB-', 'SHOP-'], en: ['WEB', 'SHOP'], ar: ['مواقع', 'متاجر'] }, { kind: 'list', minEntries: 1, maxEntries: 24 }),
    {
      ...perLanguage('home.cta.title', { de: 'Erzähl mir davon.', en: 'Tell me.', ar: 'أخبرني.' }),
      slots: {
        de: slot('Erzähl mir davon.', { isOriginal: false, revision: 2, updatedAt: '2026-09-23T08:00:00.000Z', original: 'Erzähl.' }),
        en: slot('Tell me.', { needsReview: true }),
        ar: slot('أخبرني.'),
      },
    },
    perLanguage('legal.impressum.title', { de: 'Impressum', en: 'Impressum', ar: 'بيانات الناشر' }),
    {
      ...definition('site.email', { page: 'site', section: 'facts', scope: 'fact', format: 'email', shared: true, guidance: 0 }),
      slots: { shared: slot('info@yamanwarda.de') },
    },
  ],
})

/** What the server answers after a save: the field, with the new wording live. */
const savedField = (key: string, language: 'de' | 'en' | 'ar', value: ContentValue) => {
  const field = snapshot().fields.find((item) => item.key === key)!

  return {
    changed: true,
    field: {
      ...field,
      slots: { ...field.slots, [language]: { ...field.slots[language]!, value, isOriginal: false, revision: (field.slots[language]!.revision ?? 0) + 1, updatedAt: new Date().toISOString() } },
    },
  }
}

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(<QueryClientProvider client={client}>{(<ContentPage />) as ReactNode}</QueryClientProvider>)
}

const fieldBox = (key: string) => document.querySelector<HTMLElement>(`[data-field="${key}"]`)!

const leave = async (element: HTMLElement) => {
  await act(async () => {
    fireEvent.blur(element)
  })
}

beforeEach(() => {
  search = {}
  navigate.mockReset()
  for (const mock of Object.values(api)) mock.mockReset()
  api.readContent.mockResolvedValue(snapshot())
  api.listContentHistory.mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0, pageCount: 1, hasMore: false })
  contentStore.reset()
})

afterEach(cleanup)

/* ================================================================= reading */

describe('opening Content', () => {
  it('shows the page’s fields in German with the other two languages under each', async () => {
    renderPage()

    const headline = await screen.findByRole('textbox', { name: 'Headline' })
    expect((headline as HTMLInputElement).value).toBe('Dein Partner.')

    const others = within(fieldBox('home.hero.headline')).getByLabelText('The other languages')
    expect(others.textContent).toContain('Your partner.')
    expect(others.textContent).toContain('شريكك.')
    expect(screen.getByText(/There is no Publish button/)).toBeTruthy()
  })

  it('shows nothing editable when the text cannot be loaded — never the release wording', async () => {
    // A refusal the server meant (here, the route not being there) is not retried.
    api.readContent.mockRejectedValue(new ApiRequestError({ message: 'Route not found', code: 'NOT_FOUND', status: 404 }))
    renderPage()

    expect(await screen.findByText('The website text could not be loaded')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Headline' })).toBeNull()
  })

  it('reads the page, language and view from the address, and ignores anything else', () => {
    expect(parseContentSearch({ lang: 'ar', page: 'legal', view: 'history', hpage: '3', hlang: 'shared' })).toEqual({
      lang: 'ar',
      page: 'legal',
      view: 'history',
      hpage: 3,
      hlang: 'shared',
    })
    expect(parseContentSearch({ lang: 'fr', page: 'nowhere', view: 'x', hpage: '-1' })).toEqual({})
  })

  it('names fields in the owner’s words', () => {
    expect(fieldLabel({ key: 'home.story.steps.0.title', section: 'story' })).toBe('Step 1 › Title')
    expect(fieldLabel({ key: 'home.hero.typed[]', section: 'hero' })).toBe('Rotating words')
    expect(fieldLabel({ key: 'site.email', section: 'facts' })).toBe('Email')
  })
})

/* ================================================================ saving */

describe('saving a field', () => {
  it('sends nothing while typing, and saves the whole value on leaving the field', async () => {
    api.saveContentField.mockResolvedValue(savedField('home.hero.headline', 'de', 'Neue Überschrift'))
    renderPage()

    const headline = await screen.findByRole('textbox', { name: 'Headline' })
    fireEvent.change(headline, { target: { value: 'Neue Überschrift  ' } })

    expect(api.saveContentField).not.toHaveBeenCalled()
    expect(within(fieldBox('home.hero.headline')).getByText(/Not saved yet/)).toBeTruthy()

    await leave(headline)

    await waitFor(() => expect(api.saveContentField).toHaveBeenCalledTimes(1))
    expect(api.saveContentField).toHaveBeenCalledWith({
      key: 'home.hero.headline',
      language: 'de',
      value: 'Neue Überschrift',
      expectedRevision: 0,
      legalUnlocked: false,
    })
    expect(await within(fieldBox('home.hero.headline')).findByText('Saved · live now')).toBeTruthy()
  })

  it('makes no request when the wording did not change', async () => {
    renderPage()

    const headline = await screen.findByRole('textbox', { name: 'Headline' })
    fireEvent.change(headline, { target: { value: 'Dein Partner. ' } })
    await leave(headline)

    await waitFor(() => expect(within(fieldBox('home.hero.headline')).getByText('Live')).toBeTruthy())
    expect(api.saveContentField).not.toHaveBeenCalled()
  })

  it('shows the rule beside the field only after leaving it, and rechecks as the owner types', async () => {
    renderPage()

    const headline = await screen.findByRole('textbox', { name: 'Headline' })
    fireEvent.change(headline, { target: { value: '   ' } })
    expect(screen.queryByRole('alert')).toBeNull()

    await leave(headline)

    const error = await within(fieldBox('home.hero.headline')).findByText('This text cannot be empty')
    expect(headline.getAttribute('aria-invalid')).toBe('true')
    expect(headline.getAttribute('aria-describedby')).toBe(error.closest('p')!.id)
    expect(api.saveContentField).not.toHaveBeenCalled()

    fireEvent.change(headline, { target: { value: 'Wieder da.' } })
    await waitFor(() => expect(within(fieldBox('home.hero.headline')).queryByText('This text cannot be empty')).toBeNull())
  })

  it('keeps the wording when saving fails, says the website did not change, and tries again', async () => {
    api.saveContentField.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    api.saveContentField.mockResolvedValueOnce(savedField('home.hero.headline', 'de', 'Mein Text'))
    renderPage()

    const headline = await screen.findByRole('textbox', { name: 'Headline' })
    fireEvent.change(headline, { target: { value: 'Mein Text' } })
    await leave(headline)

    const box = fieldBox('home.hero.headline')
    expect(await within(box).findByText(/website still shows the previous wording/)).toBeTruthy()
    expect((headline as HTMLInputElement).value).toBe('Mein Text')

    fireEvent.click(within(box).getByRole('button', { name: 'Try again' }))

    expect(await within(box).findByText('Saved · live now')).toBeTruthy()
    expect(api.saveContentField).toHaveBeenLastCalledWith(expect.objectContaining({ value: 'Mein Text' }))
  })

  it('never overwrites a change made in another tab: it shows that version and lets the owner choose', async () => {
    api.saveContentField.mockRejectedValueOnce(
      new ApiRequestError({
        message: 'This text was changed somewhere else.',
        code: 'CONFLICT',
        status: 409,
        details: { current: { value: 'Aus dem anderen Tab.', revision: 1 } },
      }),
    )
    renderPage()

    const headline = await screen.findByRole('textbox', { name: 'Headline' })
    fireEvent.change(headline, { target: { value: 'Meine Fassung' } })
    await leave(headline)

    const box = fieldBox('home.hero.headline')
    expect(await within(box).findByText('Aus dem anderen Tab.')).toBeTruthy()

    // "Save my wording instead" sends the revision the owner has now seen.
    api.saveContentField.mockResolvedValueOnce(savedField('home.hero.headline', 'de', 'Meine Fassung'))
    fireEvent.click(within(box).getByRole('button', { name: 'Save my wording instead' }))

    await waitFor(() =>
      expect(api.saveContentField).toHaveBeenLastCalledWith(expect.objectContaining({ value: 'Meine Fassung', expectedRevision: 1 })),
    )
  })

  it('saves a list whole, and never sends a new line that is still empty', async () => {
    api.saveContentField.mockImplementation(async (input: { value: ContentValue }) => savedField('home.hero.typed[]', 'de', input.value))
    renderPage()

    await screen.findByRole('textbox', { name: 'Headline' })
    const list = fieldBox('home.hero.typed[]')

    fireEvent.click(within(list).getByRole('button', { name: /Add line/ }))
    const lines = within(list).getAllByRole('textbox')
    expect(lines).toHaveLength(3)

    await leave(lines[2])
    expect(api.saveContentField).not.toHaveBeenCalled()

    fireEvent.change(lines[2], { target: { value: 'APP-' } })
    await leave(lines[2])

    await waitFor(() =>
      expect(api.saveContentField).toHaveBeenCalledWith(expect.objectContaining({ key: 'home.hero.typed[]', value: ['WEB-', 'SHOP-', 'APP-'] })),
    )
  })
})

/* ========================================================== Legal, review */

describe('Legal text', () => {
  it('is read-only until unlocked on purpose, and the unlock says what it means', async () => {
    search = { page: 'legal' }
    api.saveContentField.mockResolvedValue(savedField('legal.impressum.title', 'de', 'Impressum neu'))
    renderPage()

    const title = (await screen.findByRole('textbox', { name: 'Title' })) as HTMLInputElement
    expect(title.readOnly).toBe(true)

    fireEvent.change(title, { target: { value: 'Versehentlich' } })
    await leave(title)
    expect(api.saveContentField).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Unlock to edit/ }))
    expect(screen.getByRole('dialog', { name: 'Unlock legal text?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Unlock legal text/ }))

    const editable = screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement
    expect(editable.readOnly).toBe(false)

    fireEvent.change(editable, { target: { value: 'Impressum neu' } })
    await leave(editable)

    await waitFor(() => expect(api.saveContentField).toHaveBeenCalledWith(expect.objectContaining({ legalUnlocked: true })))
  })
})

describe('translation review', () => {
  it('flags the language to check, and clears it with "It still matches"', async () => {
    search = { lang: 'en' }
    const field = snapshot().fields.find((item) => item.key === 'home.cta.title')!
    api.markContentReviewed.mockResolvedValue({ ...field, slots: { ...field.slots, en: { ...field.slots.en!, needsReview: false } } })
    renderPage()

    await screen.findByRole('textbox', { name: 'Headline' })
    const box = fieldBox('home.cta.title')
    expect(within(box).getByText(/Check this translation/)).toBeTruthy()

    fireEvent.click(within(box).getByRole('button', { name: /It still matches/ }))

    await waitFor(() => expect(api.markContentReviewed).toHaveBeenCalledWith({ key: 'home.cta.title', language: 'en' }))
    await waitFor(() => expect(within(fieldBox('home.cta.title')).queryByText(/Check this translation/)).toBeNull())
  })
})

/* ======================================================== leaving, history */

describe('leaving with a change that is not live', () => {
  it('asks first, and names what visitors would not see', async () => {
    api.saveContentField.mockRejectedValue(new TypeError('Failed to fetch'))
    renderPage()

    const headline = await screen.findByRole('textbox', { name: 'Headline' })
    fireEvent.change(headline, { target: { value: 'Nicht gespeichert' } })
    await leave(headline)
    await within(fieldBox('home.hero.headline')).findByText(/website still shows the previous wording/)

    fireEvent.click(screen.getAllByRole('button', { name: /Site facts/ })[0])

    const dialog = await screen.findByRole('dialog', { name: /not on the website/ })
    expect(dialog.textContent).toContain('Headline')
    expect(dialog.textContent).toContain('saving failed')
    expect(navigate).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave and discard' }))
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ search: expect.objectContaining({ page: 'site' }) }))
  })
})

describe('All changes', () => {
  it('asks the server for one bounded page at a time, and pages on', async () => {
    search = { view: 'history', hpage: 2 }
    api.listContentHistory.mockResolvedValue({
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          key: 'home.cta.title',
          language: 'de',
          action: 'edit',
          before: 'Erzähl.',
          after: 'Erzähl mir davon.',
          revision: 2,
          restoredFrom: null,
          createdAt: '2026-09-23T08:00:00.000Z',
        },
      ],
      page: 2,
      pageSize: 20,
      total: 21,
      pageCount: 2,
      hasMore: false,
    })
    renderPage()

    expect(await screen.findByText('Erzähl mir davon.', { selector: '.cv-now' })).toBeTruthy()
    expect(api.listContentHistory).toHaveBeenCalledWith({ page: 2, pageSize: 20, language: undefined })
    expect(screen.getByText('Live now')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ search: expect.objectContaining({ hpage: undefined }) }))
  })
})
