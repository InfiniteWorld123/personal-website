// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as v from 'valibot'
import type { ReactNode } from 'react'
import {
  BlogDraftSchema,
  type BlogDoc,
  type BlogVersionPayload,
  type OwnerBlogListItem,
  type OwnerBlogPost,
  type OwnerBlogTag,
  type OwnerComment,
  blogPublishIssues,
  canonicalBlogDraft,
  emptyBlogDraft,
} from '#/backend2/contracts/blog.contract'

/**
 * The Blog screens in the Dashboard, against a faked API.
 *
 * The backend suites prove the rules. These prove the screens tell the truth
 * about them: that a save sends only what changed and the revision it was
 * based on, that Publish saves first and refuses an unfinished article next
 * to the fields that are unfinished, that a second tab's save is never
 * silently overwritten, that a tag in use names its articles instead of
 * disappearing, and that the forms behave the way every V2 form does —
 * quiet until the first attempt, then checking as the owner types.
 */

/* ------------------------------------------------------------- the seams */

const navigate = vi.fn()
let search: Record<string, unknown> = {}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, search: _search, params: _params, ...rest }: { to: string; children: ReactNode; search?: unknown; params?: unknown }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
  useSearch: () => search,
  useParams: () => ({ postId: POST_ID }),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) => select({ location: { pathname: '/dashboard/blog' } }),
  useBlocker: () => ({ status: 'idle', proceed: () => {}, reset: () => {} }),
}))

/* The API module is the seam: every Blog screen reaches the server through it. */
const api = {
  listArticles: vi.fn(),
  readArticle: vi.fn(),
  createArticle: vi.fn(),
  saveArticle: vi.fn(),
  publishArticle: vi.fn(),
  scheduleArticle: vi.fn(),
  cancelArticleSchedule: vi.fn(),
  unpublishArticle: vi.fn(),
  discardArticleChanges: vi.fn(),
  setArticleComments: vi.fn(),
  deleteArticle: vi.fn(),
  checkArticleSlug: vi.fn(),
  previewArticle: vi.fn(),
  listTags: vi.fn(),
  createTag: vi.fn(),
  saveTag: vi.fn(),
  deleteTag: vi.fn(),
  listComments: vi.fn(),
  readComment: vi.fn(),
  replyToComment: vi.fn(),
  deleteComment: vi.fn(),
  markCommentsSeen: vi.fn(),
}

vi.mock('#/frontend/features/blog-v2/api', () => api)

/*
 * The rich-text editor is TipTap, which needs a real browser to lay text out;
 * it is exercised there. Here it is a text box that produces the same
 * document, so the page around it — saving, publishing, the checklist — can
 * be tested on its own.
 */
vi.mock('#/frontend/features/blog-v2/BlogBodyEditor', () => ({
  BlogBodyEditor: ({ id, value, onChange, error }: { id: string; value: BlogDoc; onChange: (doc: BlogDoc) => void; error?: string }) => {
    const text = value.content
      .map((node) => ('content' in node && node.content ? node.content.map((child) => ('text' in child ? child.text : '')).join('') : ''))
      .join('\n')

    return (
      <div>
        <label htmlFor={id}>Article</label>
        <textarea
          id={id}
          value={text}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(docOf(event.target.value))}
        />
        {error ? <p>{error}</p> : null}
      </div>
    )
  },
}))

vi.mock('#/frontend/features/media/MediaPicker', () => ({ MediaPicker: () => null }))

vi.mock('#/frontend/features/projects/api', () => ({
  listProjects: vi.fn(async () => ({ items: [], page: 1, pageSize: 50, total: 0, pageCount: 1, hasMore: false })),
}))

const { ApiRequestError } = await import('#/frontend/api/response')
const { BlogArticlesPage } = await import('#/frontend/pages/dashboard/blog/BlogArticlesPage')
const { BlogCommentsPage } = await import('#/frontend/pages/dashboard/blog/BlogCommentsPage')
const { BlogTagsPage } = await import('#/frontend/pages/dashboard/blog/BlogTagsPage')
const { BlogEditorPage } = await import('#/frontend/pages/dashboard/blog/BlogEditorPage')
const { ScheduleDialog, scheduleProblem } = await import('#/frontend/pages/dashboard/blog/ScheduleDialog')
const { StateBadge } = await import('#/frontend/pages/dashboard/blog/blog-parts')
const { DashboardSidebar } = await import('#/frontend/dashboard/DashboardSidebar')
const { normalizeBlogDoc } = await import('#/frontend/features/blog-v2/blog-document')
const form = await import('#/frontend/features/blog-v2/blog-form')
const time = await import('#/frontend/features/blog-v2/blog-time')

/* -------------------------------------------------------------- fixtures */

const POST_ID = '11111111-1111-4111-8111-111111111111'
const TAG_ID = '22222222-2222-4222-8222-222222222222'
const MEDIA_ID = '33333333-3333-4333-8333-333333333333'

function docOf(text: string): BlogDoc {
  return {
    type: 'doc',
    content: text === '' ? [] : text.split('\n').map((line) => ({ type: 'paragraph' as const, content: line ? [{ type: 'text' as const, text: line }] : [] })),
  }
}

const texts = (title: string, summary = 'A short summary.', body = 'Some words.') => ({
  title,
  summary,
  body: docOf(body),
  seoTitle: '',
  seoDescription: '',
  readingMinutes: 1,
})

const version = (over: Partial<BlogVersionPayload> = {}): BlogVersionPayload => ({
  slug: 'local-search',
  cover: null,
  projectId: null,
  project: null,
  tagIds: [],
  tags: [],
  texts: { de: texts('Lokale Suche'), en: texts('Local search'), ar: texts('البحث المحلي') },
  ...over,
})

const article = (over: Partial<OwnerBlogPost> = {}): OwnerBlogPost => ({
  id: POST_ID,
  state: 'draft',
  draftRevision: 3,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-22T10:00:00.000Z',
  slugLocked: false,
  publicSlug: null,
  firstPublishedAt: null,
  publishedAt: null,
  contentUpdatedAt: null,
  hasPendingChanges: false,
  schedule: null,
  publicationDelay: null,
  commentsEnabled: true,
  counts: { reads: 0, likes: 0, comments: 0, newComments: 0 },
  draft: version(),
  scheduled: null,
  published: null,
  publishBlockers: [],
  publishIssues: [],
  slugAvailable: true,
  ...over,
})

const listItem = (over: Partial<OwnerBlogListItem> = {}): OwnerBlogListItem => ({
  id: POST_ID,
  state: 'draft',
  draftRevision: 3,
  slug: 'local-search',
  publicSlug: null,
  displayTitle: 'Local search',
  languagesComplete: ['de', 'en'],
  coverUrl: null,
  tags: [],
  schedule: null,
  publicationDelay: null,
  firstPublishedAt: null,
  publishedAt: null,
  contentUpdatedAt: null,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-22T10:00:00.000Z',
  hasPendingChanges: false,
  commentsEnabled: true,
  counts: { reads: 12, likes: 3, comments: 2, newComments: 1 },
  ...over,
})

const tag = (over: Partial<OwnerBlogTag> = {}): OwnerBlogTag => ({
  id: TAG_ID,
  slug: 'seo',
  names: { de: 'Suche', en: 'SEO', ar: 'تحسين البحث' },
  articleCount: 0,
  liveArticleCount: 0,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
  ...over,
})

const comment = (over: Partial<OwnerComment> = {}): OwnerComment => ({
  id: '44444444-4444-4444-8444-444444444444',
  postId: POST_ID,
  parentId: null,
  level: 1,
  author: 'visitor',
  body: 'Does this work for a bakery too?',
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  isNew: true,
  replyCount: 2,
  post: { id: POST_ID, title: 'Local search', state: 'published', publicSlug: 'local-search', commentsEnabled: true },
  parent: null,
  ...over,
})

const page = <T,>(items: T[], extra: Record<string, unknown> = {}) => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
  pageCount: 1,
  hasMore: false,
  ...extra,
})

const renderWith = (node: ReactNode) => {
  // The screens retry a server failure; here the retry happens at once.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } })

  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

// jsdom lays nothing out, so it has no scrolling to do.
Element.prototype.scrollIntoView = () => {}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()

  navigate.mockReset()
  search = {}
  api.listArticles.mockResolvedValue(page([listItem()]))
  api.listTags.mockResolvedValue(page([tag()]))
  api.listComments.mockResolvedValue({ ...page([]), newTotal: 0 })
  api.checkArticleSlug.mockResolvedValue({ available: true })
})

afterEach(cleanup)

/* ================================================================ rules */

describe('the article body the editor hands the server', () => {
  it('keeps a video as its id alone, at the top, with its title trimmed', () => {
    const doc = normalizeBlogDoc({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
        { type: 'youtube', attrs: { videoId: 'dQw4w9WgXcQ', start: null, title: '  A talk  ', src: 'https://evil.example' } },
        { type: 'youtube', attrs: { videoId: 'not-an-id', title: 'x' } },
        { type: 'blockquote', content: [{ type: 'youtube', attrs: { videoId: 'dQw4w9WgXcQ' } }] },
      ],
    })

    expect(doc.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
      { type: 'youtube', attrs: { videoId: 'dQw4w9WgXcQ', start: null, title: 'A talk' } },
      { type: 'blockquote', content: [] },
    ])
  })

  it('drops the empty paragraph the editor keeps at the end, and an unsafe link', () => {
    const doc = normalizeBlogDoc({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Click', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [] },
      ],
    })

    expect(doc).toEqual({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Click' }] }] })
    expect(normalizeBlogDoc({ type: 'doc', content: [{ type: 'paragraph' }] })).toEqual({ type: 'doc', content: [] })
  })

  it('reads a picture without recorded dimensions as unknown, not 0 — which the server refuses', () => {
    const doc = normalizeBlogDoc({
      type: 'doc',
      content: [{ type: 'image', attrs: { mediaId: MEDIA_ID, alt: 'A shop', width: null, height: 0 } }],
    })

    expect(doc.content).toEqual([{ type: 'image', attrs: { mediaId: MEDIA_ID, alt: 'A shop', width: null, height: null } }])
  })

  /*
   * The property that makes "Unsaved changes" honest: what the editor sends
   * is, key for key, what the server stores and sends back.
   */
  it('equals what the server stores, so a save leaves nothing "unsaved"', () => {
    const body = normalizeBlogDoc({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Why' }] },
        { type: 'image', attrs: { mediaId: MEDIA_ID, alt: '', width: 1200, height: 800 } },
        { type: 'youtube', attrs: { videoId: 'dQw4w9WgXcQ', start: null, title: ' Talk ' } },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One', marks: [{ type: 'bold' }] }] }] }] },
        { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'const a = 1' }] },
        { type: 'paragraph' },
      ],
    })
    const draft = emptyBlogDraft()

    draft.slug = 'why'
    draft.texts.en = { ...draft.texts.en, title: 'Why', summary: 'Because.', body }

    const stored = v.parse(BlogDraftSchema, JSON.parse(JSON.stringify(draft)))

    expect(canonicalBlogDraft(stored)).toBe(canonicalBlogDraft(draft))
  })
})

describe('the editor values and the draft', () => {
  it('go there and back without losing anything', () => {
    const payload = version({ cover: { mediaId: MEDIA_ID, url: '/x', width: 10, height: 10, alt: { de: 'a', en: 'b', ar: 'c' } }, tagIds: [TAG_ID] })
    const values = form.toFormValues(payload)

    expect(form.toDraft(values, form.toBodies(payload))).toEqual(form.payloadToDraft(payload))
  })

  it('sends only what changed, down to one field in one language', () => {
    const before = form.payloadToDraft(version())
    const values = form.toFormValues(version())

    expect(form.draftPatch(before, form.toDraft(values, form.toBodies(version())))).toEqual({})

    values.texts.ar.title = '  عنوان جديد '
    values.tagIds = [TAG_ID]

    expect(form.draftPatch(before, form.toDraft(values, form.toBodies(version())))).toEqual({
      tagIds: [TAG_ID],
      texts: { ar: { title: 'عنوان جديد' } },
    })
  })

  it('checks shape only on save — an unfinished draft still saves', () => {
    expect(form.fieldErrors(form.emptyFormValues())).toEqual({})

    const values = form.emptyFormValues()

    values.slug = 'Not Valid'
    values.texts.de.title = 'x'.repeat(161)

    expect(form.fieldErrors(values)).toEqual({
      slug: 'Use lowercase letters, numbers and single hyphens only',
      'texts.de.title': 'A title is at most 160 characters',
    })
  })

  it('refuses a body over its limits by language', () => {
    const draft = emptyBlogDraft()

    draft.texts.de.body = {
      type: 'doc',
      content: Array.from({ length: 11 }, () => ({ type: 'youtube' as const, attrs: { videoId: 'dQw4w9WgXcQ', start: null, title: '' } })),
    }

    expect(form.bodyErrors(draft)).toEqual({ de: 'An article may hold at most 10 videos' })
  })

  it('lists the publication issues top to bottom, in the words of each field, and can go to each one', () => {
    const draft = emptyBlogDraft()

    draft.cover = { mediaId: MEDIA_ID, alt: { de: '', en: 'x', ar: 'y' } }

    const issues = form.orderedIssues(blogPublishIssues(draft))

    expect(issues.slice(0, 3).map((issue) => issue.field)).toEqual(['slug', 'cover.alt.de', 'texts.de.title'])
    expect(form.issuesByField(issues)['texts.ar.summary']).toBe('The summary is empty')

    for (const issue of issues) expect(form.fieldTarget(issue.field), issue.field).not.toBeNull()

    expect(form.fieldTarget('texts.ar.title')).toEqual({ id: 'blog-ar-title', language: 'ar' })
    expect(form.firstField(['texts.en.seoTitle', 'texts.de.summary', 'cover.alt.ar'])).toBe('cover.alt.ar')
  })

  it('suggests an address from the English title, and none from Arabic alone', () => {
    const values = form.emptyFormValues()

    values.texts.ar.title = 'البحث المحلي'
    expect(form.slugSuggestion(values)).toBe('')

    values.texts.de.title = 'Lokale Suche für Cafés'
    expect(form.slugSuggestion(values)).toBe('lokale-suche-fuer-cafes')

    values.texts.en.title = 'Local search'
    expect(form.slugSuggestion(values)).toBe('local-search')
  })

  it('asks a tag for all three names, and for an address when only Arabic could suggest one', () => {
    // With no name at all, the names' messages say it; the address follows the English name.
    expect(Object.keys(form.tagErrors({ names: { de: '', en: '', ar: '' }, slug: '' }))).toEqual([
      'names.de',
      'names.en',
      'names.ar',
    ])
    expect(form.tagErrors({ names: { de: '', en: '', ar: 'بحث' }, slug: '' }).slug).toMatch(/an Arabic name alone suggests none/)
    expect(form.tagErrors({ names: { de: 'Suche', en: 'Search', ar: 'بحث' }, slug: '' })).toEqual({})
    expect(form.tagSlugSuggestion({ de: 'Suche', en: 'Local SEO', ar: 'بحث' })).toBe('local-seo')
  })
})

describe('a time on the clock in Berlin', () => {
  const now = Date.parse('2026-09-23T10:00:00.000Z')

  it('refuses the hour the clocks skip in spring, the past and more than a year ahead', () => {
    expect(scheduleProblem('2027-03-28', '02:30', now)).toMatch(/does not exist in Berlin/)
    expect(scheduleProblem('2026-09-22', '09:00', now)).toBe('Choose a time in the future')
    expect(scheduleProblem('2027-10-01', '09:00', now)).toBe('Choose a time within the next year')
    expect(scheduleProblem('2026-09-29', '09:00', now)).toBeNull()
    expect(scheduleProblem('', '09:00', now)).toBe('Choose a date')
  })

  it('says it in Berlin, whatever the laptop says', () => {
    // 07:00 UTC in late September is 09:00 in Berlin (summer time).
    expect(time.berlinShort(new Date('2026-09-29T07:00:00.000Z'))).toBe('Tue 29 Sept, 09:00')
    expect(time.nextBerlinWeekday(1, new Date(now))).toBe('2026-09-28')
    expect(time.berlinTomorrow(new Date(now))).toBe('2026-09-24')
  })
})

describe('the state words', () => {
  it('names every state, with the clock on a schedule', () => {
    const { rerender } = render(<StateBadge state="scheduled" />)

    expect(screen.getByText('Scheduled')).toBeTruthy()

    rerender(<StateBadge state="published_with_pending_changes" />)
    expect(screen.getByText('Live · edited')).toBeTruthy()

    rerender(<StateBadge state="unpublished" />)
    expect(screen.getByText('Taken down')).toBeTruthy()
  })
})

/* ============================================================== screens */

describe('the articles list', () => {
  it('shows each article with its state, its schedule and its new comments', async () => {
    api.listArticles.mockResolvedValue(
      page([
        listItem(),
        listItem({
          id: '55555555-5555-4555-8555-555555555555',
          displayTitle: 'Accessibility is not an extra',
          state: 'scheduled',
          schedule: { publishAt: '2026-09-29T07:00:00.000Z', publishAtBerlin: { date: '2026-09-29', time: '09:00' } },
          commentsEnabled: false,
          counts: { reads: 0, likes: 0, comments: 0, newComments: 0 },
        }),
      ]),
    )

    renderWith(<BlogArticlesPage />)

    expect(await screen.findByText('Local search')).toBeTruthy()
    expect(screen.getByText(/Goes live Tue 29 Sept, 09:00 Berlin/)).toBeTruthy()
    expect(screen.getByText('Comments off')).toBeTruthy()
    expect(screen.getByLabelText('12 reads, 3 likes, 2 comments, 1 new')).toBeTruthy()
  })

  it('asks the server for the filter rather than filtering in the browser', async () => {
    renderWith(<BlogArticlesPage />)
    await screen.findByText('Local search')

    fireEvent.change(screen.getByLabelText('Filter by state'), { target: { value: 'scheduled' } })

    await waitFor(() =>
      expect(api.listArticles).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'scheduled', page: 1, pageSize: 20 })),
    )
  })

  it('says why a list is empty, and what to do', async () => {
    api.listArticles.mockResolvedValue(page([]))

    renderWith(<BlogArticlesPage />)

    expect(await screen.findByText('No articles yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Write your first article/ })).toBeTruthy()
  })

  it('says so when the list cannot be loaded, and offers to try again', async () => {
    api.listArticles.mockRejectedValue(new ApiRequestError({ message: 'down', status: 500 }))

    renderWith(<BlogArticlesPage />)

    expect(await screen.findByText('The articles could not be loaded')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('creates a draft in the chosen language and opens it on that tab', async () => {
    api.createArticle.mockResolvedValue(article())

    renderWith(<BlogArticlesPage />)
    fireEvent.click(await screen.findByRole('button', { name: /New article/ }))

    const dialog = await screen.findByRole('dialog', { name: 'New article' })
    const title = within(dialog).getByLabelText(/Working title/)

    // Quiet until the first attempt, then checking as the owner types.
    fireEvent.change(title, { target: { value: 'x'.repeat(170) } })
    expect(within(dialog).queryByText(/at most 160/)).toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create draft' }))

    expect(await within(dialog).findByText('A title is at most 160 characters')).toBeTruthy()
    expect(title.getAttribute('aria-invalid')).toBe('true')
    expect(api.createArticle).not.toHaveBeenCalled()

    fireEvent.change(title, { target: { value: 'البحث المحلي' } })
    await waitFor(() => expect(within(dialog).queryByText(/at most 160/)).toBeNull())

    fireEvent.click(within(dialog).getByLabelText('العربية'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create draft' }))

    await waitFor(() => expect(api.createArticle).toHaveBeenCalledWith({ title: 'البحث المحلي', language: 'ar' }))
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/dashboard/blog/$postId', params: { postId: POST_ID }, search: { language: 'ar' } }),
    )
  })
})

describe('the article editor', () => {
  const openEditor = async (data: OwnerBlogPost = article()) => {
    api.readArticle.mockResolvedValue(data)
    renderWith(<BlogEditorPage />)
    await screen.findByRole('heading', { level: 1, name: 'Local search' })
  }

  it('saves only what changed, with the revision it was based on', async () => {
    await openEditor()

    expect(screen.getByText('All changes saved')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Local search, explained' } })
    expect(screen.getAllByText('Unsaved changes').length).toBeGreaterThan(0)

    const saved = article({ draftRevision: 4, draft: version({ texts: { ...version().texts, en: texts('Local search, explained') } }) })

    api.saveArticle.mockResolvedValue(saved)
    api.readArticle.mockResolvedValue(saved)
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!)

    await waitFor(() =>
      expect(api.saveArticle).toHaveBeenCalledWith(POST_ID, { draftRevision: 3, texts: { en: { title: 'Local search, explained' } } }),
    )
    expect(await screen.findByText('All changes saved')).toBeTruthy()
  })

  it('refuses to publish an unfinished article, says where, and goes there', async () => {
    const draft = version({ texts: { ...version().texts, ar: texts('', '', '') } })

    await openEditor(article({ draft }))

    fireEvent.click(screen.getAllByRole('button', { name: 'Publish' })[0]!)

    await waitFor(() => expect(screen.getByRole('tab', { name: /العربية/ }).getAttribute('aria-selected')).toBe('true'))

    const title = await screen.findByLabelText('Title')

    await waitFor(() => expect(document.activeElement).toBe(title))
    expect(title.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('The title is empty')).toBeTruthy()
    expect(screen.getByText(/Not published yet: 3 things to finish/)).toBeTruthy()
    expect(api.publishArticle).not.toHaveBeenCalled()
    expect(api.saveArticle).not.toHaveBeenCalled()

    // After the attempt, the field clears the moment it is fixed.
    fireEvent.change(title, { target: { value: 'البحث المحلي' } })
    await waitFor(() => expect(screen.queryByText('The title is empty')).toBeNull())
  })

  it('saves first, then publishes what it saved', async () => {
    await openEditor()

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Local search, again' } })

    const saved = article({ draftRevision: 4, draft: version({ texts: { ...version().texts, en: texts('Local search, again') } }) })

    api.saveArticle.mockResolvedValue(saved)
    api.readArticle.mockResolvedValue(saved)
    api.publishArticle.mockResolvedValue({ ...saved, state: 'published', published: saved.draft, firstPublishedAt: '2026-09-23T10:00:00.000Z' })

    fireEvent.click(screen.getAllByRole('button', { name: 'Publish' })[0]!)

    await waitFor(() => expect(api.publishArticle).toHaveBeenCalledWith(POST_ID, 4))
    expect(api.saveArticle).toHaveBeenCalledTimes(1)
  })

  it('never overwrites a save made somewhere else: it asks to reload', async () => {
    await openEditor()

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Mine' } })

    api.saveArticle.mockRejectedValue(
      new ApiRequestError({ message: 'This article was changed somewhere else. Reload the page to see the newer version.', code: 'CONFLICT', status: 409 }),
    )
    api.readArticle.mockResolvedValue(article({ draftRevision: 5, draft: version({ texts: { ...version().texts, en: texts('Theirs') } }) }))

    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!)

    expect(await screen.findByText('This article was changed somewhere else')).toBeTruthy()
    // The owner's text is still on screen until they choose to reload.
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Mine')

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Theirs'))
  })

  /*
   * Found in the browser: `#` links changed the address, and the unsaved-work
   * guard read that as leaving the page. The shortcuts are buttons now.
   */
  it('jumps between sections without touching the address', async () => {
    await openEditor()

    for (const name of ['Address & tags', 'Cover', 'Article']) {
      const shortcut = screen.getByRole('button', { name })

      expect(shortcut.getAttribute('href')).toBeNull()
    }

    expect(screen.queryByRole('link', { name: 'Cover' })).toBeNull()
  })

  it('switches comments at once, not with Publish', async () => {
    await openEditor()

    api.setArticleComments.mockResolvedValue(article({ commentsEnabled: false }))
    fireEvent.click(screen.getByRole('switch', { name: /Comments on/ }))

    await waitFor(() => expect(api.setArticleComments).toHaveBeenCalledWith(POST_ID, false))
    expect(api.publishArticle).not.toHaveBeenCalled()
  })

  it('fixes the address once the article has been published', async () => {
    await openEditor(article({ state: 'published', slugLocked: true, publicSlug: 'local-search', published: version(), firstPublishedAt: '2026-09-01T10:00:00.000Z' }))

    expect((screen.getByLabelText('Web address') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText(/Fixed since it was first scheduled or published/)).toBeTruthy()
    // Live and unchanged: there is nothing new to publish, and no schedule for an update.
    expect((screen.getAllByRole('button', { name: 'Publish update' })[0] as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: /Schedule…/ })).toBeNull()
  })

  it('deletes only after the title is typed back', async () => {
    await openEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Delete…' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this article permanently?' })
    const confirm = within(dialog).getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement

    expect(confirm.disabled).toBe(true)

    fireEvent.change(within(dialog).getByLabelText(/Type the title to confirm/), { target: { value: 'Local search' } })
    expect(confirm.disabled).toBe(false)

    api.deleteArticle.mockResolvedValue({ deleted: true, comments: 0 })
    fireEvent.click(confirm)

    await waitFor(() => expect(api.deleteArticle).toHaveBeenCalledWith(POST_ID))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/dashboard/blog' }))
  })

  it('says so when the article does not exist', async () => {
    api.readArticle.mockRejectedValue(new ApiRequestError({ message: 'That article does not exist', code: 'NOT_FOUND', status: 404 }))

    renderWith(<BlogEditorPage />)

    expect(await screen.findByText('This article does not exist')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to articles' })).toBeTruthy()
  })
})

describe('the schedule', () => {
  it('refuses a time that does not exist, then schedules on the Berlin clock', async () => {
    const onClose = vi.fn()

    api.scheduleArticle.mockResolvedValue(
      article({ state: 'scheduled', schedule: { publishAt: '2026-10-05T07:00:00.000Z', publishAtBerlin: { date: '2026-10-05', time: '09:00' }, draftRevision: 3, matchesDraft: true } }),
    )

    renderWith(<ScheduleDialog article={article()} unsaved={false} onPublishNow={async () => {}} onClose={onClose} />)

    const dialog = screen.getByRole('dialog', { name: 'Schedule the first publication' })
    const date = within(dialog).getByLabelText('Date')
    const hour = within(dialog).getByLabelText('Time in Berlin')

    fireEvent.change(date, { target: { value: '2027-03-28' } })
    fireEvent.change(hour, { target: { value: '02:30' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Schedule' }))

    expect(await within(dialog).findByText(/does not exist in Berlin/)).toBeTruthy()
    expect(hour.getAttribute('aria-invalid')).toBe('true')
    expect(api.scheduleArticle).not.toHaveBeenCalled()

    const future = time.nextBerlinWeekday(1)

    fireEvent.change(date, { target: { value: future } })
    fireEvent.change(hour, { target: { value: '09:00' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Schedule' }))

    await waitFor(() =>
      expect(api.scheduleArticle).toHaveBeenCalledWith(POST_ID, { draftRevision: 3, date: future, time: '09:00', snapshot: 'draft' }),
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('keeps the frozen version when only the time changes', () => {
    const scheduled = article({
      state: 'scheduled',
      slugLocked: true,
      schedule: { publishAt: '2026-10-05T07:00:00.000Z', publishAtBerlin: { date: '2026-10-05', time: '09:00' }, draftRevision: 3, matchesDraft: true },
    })

    renderWith(<ScheduleDialog article={scheduled} unsaved={false} onPublishNow={async () => {}} onClose={() => {}} />)

    expect((screen.getByLabelText(/Keep the frozen version/) as HTMLInputElement).checked).toBe(true)
    // Nothing to replace it with: the saved draft is the frozen version.
    expect((screen.getByLabelText(/Replace it with what you saved now/) as HTMLInputElement).disabled).toBe(true)
  })
})

describe('the tags', () => {
  it('asks for all three names on the first attempt, then checks as the owner types', async () => {
    api.createTag.mockResolvedValue(tag({ id: 'new' }))

    renderWith(<BlogTagsPage />)
    fireEvent.click((await screen.findAllByRole('button', { name: /New tag/ }))[0]!)

    const dialog = await screen.findByRole('dialog', { name: 'New tag' })

    expect(within(dialog).queryByText(/Needed in/)).toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create tag' }))

    expect(await within(dialog).findByText(/Needed in German/)).toBeTruthy()
    expect(within(dialog).getByText(/Needed in Arabic/)).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByLabelText('Name (German)')))

    fireEvent.change(within(dialog).getByLabelText('Name (German)'), { target: { value: 'Lokale Suche' } })
    await waitFor(() => expect(within(dialog).queryByText(/Needed in German/)).toBeNull())

    fireEvent.change(within(dialog).getByLabelText('Name (English)'), { target: { value: 'Local search' } })
    fireEvent.change(within(dialog).getByLabelText('Name (Arabic)'), { target: { value: 'البحث المحلي' } })

    expect((within(dialog).getByLabelText('Filter address') as HTMLInputElement).value).toBe('local-search')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create tag' }))

    await waitFor(() =>
      expect(api.createTag).toHaveBeenCalledWith({ names: { de: 'Lokale Suche', en: 'Local search', ar: 'البحث المحلي' }, slug: 'local-search' }),
    )
  })

  it('names the articles that carry a tag instead of deleting it', async () => {
    api.listTags.mockResolvedValue(page([tag({ articleCount: 2, liveArticleCount: 1 })]))
    api.listArticles.mockImplementation(async (query: { tag?: string }) =>
      query.tag === TAG_ID
        ? page([listItem(), listItem({ id: 'b', displayTitle: 'Accessibility is not an extra', state: 'published' })])
        : page([listItem()]),
    )

    renderWith(<BlogTagsPage />)

    expect(await screen.findByText('On 2 articles · 1 live')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete SEO' }))

    const dialog = await screen.findByRole('alertdialog', { name: '“SEO” is still in use' })

    expect(await within(dialog).findByText('Accessibility is not an extra')).toBeTruthy()
    expect(api.deleteTag).not.toHaveBeenCalled()
  })

  it('deletes an unused tag after asking once', async () => {
    api.deleteTag.mockResolvedValue({ deleted: true })

    renderWith(<BlogTagsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete SEO' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete the tag “SEO”?' })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete tag' }))
    await waitFor(() => expect(api.deleteTag).toHaveBeenCalledWith(TAG_ID))
  })
})

describe('the comments', () => {
  const thread = {
    comment: comment(),
    ancestors: [],
    descendantCount: 2,
  }

  beforeEach(() => {
    api.listComments.mockResolvedValue({ ...page([comment()]), newTotal: 1 })
    api.readComment.mockResolvedValue(thread)
  })

  it('shows a new comment as new, with where it is and the label for a visitor', async () => {
    renderWith(<BlogCommentsPage />)

    expect(await screen.findByText('Does this work for a bakery too?')).toBeTruthy()
    expect(screen.getByText('Guest')).toBeTruthy()
    expect(screen.getAllByText('New').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Mark all as seen' })).toBeTruthy()
  })

  it('answers in the conversation, after checking the reply is not empty', async () => {
    api.replyToComment.mockResolvedValue(comment({ author: 'owner', body: 'Yes.' }))

    renderWith(<BlogCommentsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reply' }))

    const dialog = await screen.findByRole('dialog', { name: 'Conversation' })

    expect(await within(dialog).findByText('2 replies below this comment')).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reply' }))
    expect(await within(dialog).findByText('Write the reply before sending it')).toBeTruthy()
    expect(api.replyToComment).not.toHaveBeenCalled()

    fireEvent.change(within(dialog).getByLabelText(/Your reply/), { target: { value: 'Yes — the same rules apply.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reply' }))

    await waitFor(() =>
      expect(api.replyToComment).toHaveBeenCalledWith('44444444-4444-4444-8444-444444444444', 'Yes — the same rules apply.'),
    )
  })

  it('says how much goes before deleting a branch', async () => {
    api.deleteComment.mockResolvedValue({ deleted: 3 })

    renderWith(<BlogCommentsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this comment and its 2 replies?' })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 3 comments' }))
    await waitFor(() => expect(api.deleteComment).toHaveBeenCalledWith('44444444-4444-4444-8444-444444444444'))
  })

  it('says there is nothing new when everything has been seen', async () => {
    search = { status: 'new' }
    api.listComments.mockResolvedValue({ ...page([]), newTotal: 0 })

    renderWith(<BlogCommentsPage />)

    expect(await screen.findByText('Nothing new')).toBeTruthy()
  })
})

describe('the sidebar', () => {
  it('shows the new-comment count beside Blog', async () => {
    api.listComments.mockResolvedValue({ ...page([]), newTotal: 3 })

    renderWith(<DashboardSidebar />)

    const blog = screen.getByRole('link', { name: /Blog/ })

    expect(await within(blog).findByText('3')).toBeTruthy()
    expect(within(blog).getByText('new comments')).toBeTruthy()
  })

  it('shows nothing when Backend2 does not answer', async () => {
    api.listComments.mockRejectedValue(new ApiRequestError({ message: 'Not found', status: 404 }))

    renderWith(<DashboardSidebar />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(within(screen.getByRole('link', { name: /Blog/ })).queryByText(/new/)).toBeNull()
  })
})
