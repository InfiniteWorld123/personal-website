// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PublicComment } from '#/backend2/contracts/blog.contract'

/**
 * The public Blog V2 pieces in the browser, against a faked `fetch`
 * (`docs/v2/public-cutover.md` step 4, from the approved Blog Design Lab):
 * the comment section with its form, refusals and states, the click-to-load
 * video, the table, and reads and likes going to Backend2.
 */

const language = vi.hoisted(() => ({ current: 'en' as 'de' | 'en' | 'ar' }))

vi.mock('#/frontend/i18n/language-provider', () => ({
  useLanguage: () => ({ language: language.current, direction: language.current === 'ar' ? 'rtl' : 'ltr' }),
}))

const { PostComments } = await import('#/frontend/features/blog/PostComments')
const { PostBody } = await import('#/frontend/features/blog/PostBody')
const { PostEngagement } = await import('#/frontend/features/blog/PostEngagement')

/* ------------------------------------------------------------ the fake API */

type Call = { method: string; url: string; body: unknown }

let calls: Call[] = []
let routes: Array<(call: Call) => Response | undefined> = []

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const ok = (data: unknown, status = 200) => json(status, { success: true, message: 'ok', data })

const refuse = (status: number, code: string, reason: string) =>
  json(status, { success: false, message: 'refused', code, details: { reason } })

const comment = (over: Partial<PublicComment> & { id: string }): PublicComment => ({
  parentId: null,
  level: 1,
  author: 'visitor',
  body: `Comment ${over.id}`,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  replyCount: 0,
  ...over,
})

const page = (items: PublicComment[], extra: Record<string, unknown> = {}) =>
  ok({ enabled: true, total: items.length, items, nextCursor: null, ...extra })

beforeEach(() => {
  calls = []
  routes = []
  language.current = 'en'
  window.localStorage.clear()
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  Element.prototype.scrollIntoView = () => {}

  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }

    calls.push(call)

    for (const route of routes) {
      const answer = route(call)

      if (answer) return answer
    }

    throw new TypeError('network down')
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const listRoute = (answer: () => Response) => (call: Call) =>
  call.method === 'GET' && /\/comments\?/.test(call.url) && !call.url.includes('/replies') ? answer() : undefined

/* ------------------------------------------------------------- comments */

describe('the comment section', () => {
  it('says it is loading, then shows the threads newest first with the approved labels', async () => {
    routes.push(
      listRoute(() => page([comment({ id: 'b', body: 'Second' }), comment({ id: 'a', author: 'owner', body: 'First' })])),
    )

    render(<PostComments slug="rich-article" initialCount={2} />)

    expect(screen.getByRole('heading', { name: 'Comments' })).toBeTruthy()
    expect(screen.getByText('2 comments')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Loading comments…')

    await screen.findByText('Second')

    const bodies = [...document.querySelectorAll('.cmt-body')].map((node) => node.textContent)
    expect(bodies).toEqual(['Second', 'First'])
    expect(screen.getByText('Guest')).toBeTruthy()
    expect(screen.getByText('Yaman Warda')).toBeTruthy()
    expect(screen.getByText('Author')).toBeTruthy()
    expect(screen.getAllByText('5 minutes ago')).toHaveLength(2)
    expect(calls[0]?.url).toBe('/api/v2/blog/posts/rich-article/comments?limit=10')
  })

  it('shows the empty state, and an error with a retry that recovers', async () => {
    let fail = true

    routes.push(listRoute(() => (fail ? json(500, { success: false }) : page([]))))

    render(<PostComments slug="a" initialCount={0} />)

    await screen.findByText('The comments could not be loaded just now.')
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await screen.findByText('No comments yet. Be the first.')
  })

  it('renders visitor text as text, never as markup', async () => {
    routes.push(listRoute(() => page([comment({ id: 'x', body: 'Try <img src=x onerror=alert(1)> here' })])))

    render(<PostComments slug="a" initialCount={1} />)

    await screen.findByText('Try <img src=x onerror=alert(1)> here')
    expect(document.querySelector('.cmt-body img')).toBeNull()
  })

  it('is quiet until the first attempt, then checks as the reader types, and focuses the field', async () => {
    routes.push(listRoute(() => page([])))

    render(<PostComments slug="a" initialCount={0} />)
    await screen.findByText('No comments yet. Be the first.')

    const field = screen.getByLabelText('Your comment') as HTMLTextAreaElement

    expect(field.getAttribute('aria-invalid')).toBeNull()
    expect(screen.getByText(/No account needed/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }))

    await screen.findByText('Write something before posting.')
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(field.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id)
    await waitFor(() => expect(document.activeElement).toBe(field))
    expect(calls.some((call) => call.method === 'POST')).toBe(false)

    // After the first attempt, each change is checked at once.
    fireEvent.change(field, { target: { value: 'Hello' } })
    await waitFor(() => expect(screen.queryByText('Write something before posting.')).toBeNull())

    fireEvent.change(field, { target: { value: 'a'.repeat(3001) } })
    await screen.findByText('A comment may be at most 3,000 characters.')
    expect(screen.getByText('3,001 / 3,000').className).toContain('is-over')
  })

  it('posts a comment, shows it at the top with the success notice, and sends the hidden field', async () => {
    routes.push(listRoute(() => page([comment({ id: 'old', body: 'Older' })])))
    routes.push((call) =>
      call.method === 'POST' && call.url.endsWith('/comments')
        ? ok(comment({ id: 'new', body: (call.body as { body: string }).body, createdAt: new Date().toISOString() }), 201)
        : undefined,
    )

    render(<PostComments slug="rich-article" initialCount={1} />)
    await screen.findByText('Older')

    fireEvent.change(screen.getByLabelText('Your comment'), { target: { value: 'Great article' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }))

    await screen.findByText('Your comment is live.')
    const post = calls.find((call) => call.method === 'POST')

    expect(post).toEqual({
      method: 'POST',
      url: '/api/v2/blog/posts/rich-article/comments',
      body: { body: 'Great article', parentId: null, website: '' },
    })
    expect([...document.querySelectorAll('.cmt-body')].map((node) => node.textContent)).toEqual([
      'Great article',
      'Older',
    ])
    expect(screen.getByText('2 comments')).toBeTruthy()
    expect((screen.getByLabelText('Your comment') as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([
    [422, 'COMMENT_REJECTED', 'markup', 'Comments are plain text. Remove the HTML code and try again.'],
    [422, 'COMMENT_REJECTED', 'too_many_links', 'A comment may contain at most 2 links.'],
    [409, 'DUPLICATE_COMMENT', 'duplicate', 'This comment has already been posted.'],
    [429, 'RATE_LIMITED', 'too_fast', 'You are commenting very quickly. Wait a few minutes and try again.'],
  ])('shows the server refusal %s %s (%s) beside the field and keeps the text', async (status, code, reason, message) => {
    routes.push(listRoute(() => page([])))
    routes.push((call) => (call.method === 'POST' ? refuse(status, code, reason) : undefined))

    render(<PostComments slug="a" initialCount={0} />)
    await screen.findByText('No comments yet. Be the first.')

    const field = screen.getByLabelText('Your comment') as HTMLTextAreaElement

    fireEvent.change(field, { target: { value: 'Some text' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }))

    await screen.findByText(message)
    expect(field.value).toBe('Some text')
    expect(field.getAttribute('aria-invalid')).toBe('true')

    // Editing the text is fixing it: the refusal steps aside.
    fireEvent.change(field, { target: { value: 'Some other text' } })
    await waitFor(() => expect(screen.queryByText(message)).toBeNull())
  })

  it('keeps the text when the network fails, and cannot be sent twice while sending', async () => {
    let answer: () => void = () => {}
    routes.push(listRoute(() => page([])))

    render(<PostComments slug="a" initialCount={0} />)
    await screen.findByText('No comments yet. Be the first.')

    vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url: String(input), body: init?.body })

      return new Promise<Response>((_resolve, reject) => {
        answer = () => reject(new TypeError('down'))
      })
    })

    const field = screen.getByLabelText('Your comment') as HTMLTextAreaElement

    fireEvent.change(field, { target: { value: 'Hello there' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' }))

    const busy = await screen.findByRole('button', { name: 'Posting…' })
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(busy)
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1)

    await act(async () => {
      answer()
    })

    await screen.findByText('Your comment could not be posted just now. Your text is still here — try again.')
    expect(field.value).toBe('Hello there')
  })

  it('loads replies a page at a time, and posts a reply under its comment', async () => {
    routes.push(listRoute(() => page([comment({ id: 'root', body: 'Root', replyCount: 4 })], { total: 5 })))
    routes.push((call) => {
      if (!call.url.includes('/comments/root/replies')) return undefined

      return call.url.includes('cursor=c1')
        ? ok({ enabled: true, total: 4, items: [comment({ id: 'r4', parentId: 'root', level: 2, body: 'Reply 4' })], nextCursor: null })
        : ok({
            enabled: true,
            total: 4,
            items: ['r1', 'r2', 'r3'].map((id) => comment({ id, parentId: 'root', level: 2, body: `Reply ${id.slice(1)}` })),
            nextCursor: 'c1',
          })
    })
    routes.push((call) =>
      call.method === 'POST'
        ? ok(comment({ id: 'mine', parentId: 'root', level: 2, body: 'My reply', createdAt: new Date().toISOString() }), 201)
        : undefined,
    )

    render(<PostComments slug="a" initialCount={5} />)

    await screen.findByText('Reply 3')
    expect(screen.queryByText('Reply 4')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 reply' }))
    await screen.findByText('Reply 4')
    expect(calls.filter((call) => call.url.includes('/replies'))[0]?.url).toBe(
      '/api/v2/blog/posts/a/comments/root/replies?limit=3',
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0]!)
    const replyField = screen.getByLabelText('Your reply to Guest')
    fireEvent.change(replyField, { target: { value: 'My reply' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post reply' }))

    await screen.findByText('My reply')
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ body: 'My reply', parentId: 'root', website: '' })
    expect(screen.queryByLabelText('Your reply to Guest')).toBeNull()
    expect(screen.getByText('6 comments')).toBeTruthy()
  })

  it('folds a deep branch into "Continue this conversation" and opens it with its trail', async () => {
    const chain = [1, 2, 3, 4, 5].map((level) =>
      comment({
        id: `c${level}`,
        parentId: level === 1 ? null : `c${level - 1}`,
        level,
        body: `Level ${level}`,
        replyCount: 1,
      }),
    )
    const deeper = comment({ id: 'c6', parentId: 'c5', level: 6, body: 'Level 6' })

    routes.push(listRoute(() => page([chain[0]!], { total: 6 })))
    routes.push((call) => {
      const match = call.url.match(/comments\/(c\d)\/replies/)

      if (!match) return undefined

      const child = [...chain, deeper].find((entry) => entry.parentId === match[1])

      return ok({ enabled: true, total: 1, items: child ? [child] : [], nextCursor: null })
    })

    render(<PostComments slug="a" initialCount={6} />)

    await screen.findByText('Level 5')
    expect(screen.queryByText('Level 6')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Continue this conversation/ }))

    await screen.findByText('Level 6')
    expect(screen.getByRole('button', { name: 'Back to all comments' })).toBeTruthy()
    expect(document.querySelectorAll('.cmt-trail p')).toHaveLength(4)
    // The form for a new thread is not offered inside a branch.
    expect(screen.queryByLabelText('Your comment')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Back to all comments' }))
    expect(screen.getByLabelText('Your comment')).toBeTruthy()
  })

  it('disappears when the owner switched comments off meanwhile', async () => {
    routes.push(listRoute(() => ok({ enabled: false, total: 0, items: [], nextCursor: null })))

    const { container } = render(<PostComments slug="a" initialCount={3} />)

    await waitFor(() => expect(container.querySelector('.cmts')).toBeNull())
  })

  it('speaks German and Arabic with the approved words', async () => {
    routes.push(listRoute(() => page([comment({ id: 'a' })])))

    language.current = 'de'
    const { unmount } = render(<PostComments slug="a" initialCount={1} />)
    await screen.findByText('Gast')
    expect(screen.getByText('1 Kommentar')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Kommentar senden' })).toBeTruthy()
    unmount()

    language.current = 'ar'
    render(<PostComments slug="a" initialCount={1} />)
    await screen.findByText('زائر')
    expect(screen.getByText('تعليق واحد')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'انشر التعليق' })).toBeTruthy()
  })
})

/* ---------------------------------------------------------- rich content */

describe('the article body', () => {
  it('loads nothing from YouTube until the reader presses play', () => {
    render(
      <PostBody
        doc={{
          type: 'doc',
          content: [{ type: 'youtube', attrs: { videoId: 'dQw4w9WgXcQ', start: 30, title: 'A film' } }],
        }}
      />,
    )

    expect(document.querySelector('iframe')).toBeNull()
    expect(document.body.innerHTML).not.toContain('youtube')

    const play = screen.getByRole('button', { name: 'Play video: A film' })
    expect(play.getAttribute('aria-describedby')).toBeTruthy()
    fireEvent.click(play)

    const frame = document.querySelector('iframe')
    expect(frame?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&start=30')
    expect(frame?.getAttribute('title')).toBe('A film')
  })

  it('refuses to build a player from anything but a video id', () => {
    render(
      <PostBody
        doc={{ type: 'doc', content: [{ type: 'youtube', attrs: { videoId: '"><script>', start: null, title: '' } }] }}
      />,
    )

    expect(screen.queryByRole('button')).toBeNull()
  })

  it('draws a table with its header row as the head, inside its own scroll box', () => {
    const cell = (type: 'tableHeader' | 'tableCell', text: string, colspan = 1) => ({
      type,
      attrs: { colspan, rowspan: 1 },
      content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }],
    })

    const { container } = render(
      <PostBody
        doc={{
          type: 'doc',
          content: [
            {
              type: 'table',
              content: [
                { type: 'tableRow', content: [cell('tableHeader', 'Plan'), cell('tableHeader', 'Price')] },
                { type: 'tableRow', content: [cell('tableCell', 'Start'), cell('tableCell', '900 €')] },
                { type: 'tableRow', content: [cell('tableHeader', 'Total'), cell('tableCell', 'x', 1)] },
              ],
            },
          ],
        }}
      />,
    )

    expect(container.querySelector('.post-body > .post-table > table')).not.toBeNull()
    expect([...container.querySelectorAll('thead th')].map((th) => [th.textContent, th.getAttribute('scope')])).toEqual([
      ['Plan', 'col'],
      ['Price', 'col'],
    ])
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(container.querySelector('tbody th')?.getAttribute('scope')).toBe('row')
  })
})

/* ------------------------------------------------------ reads and likes */

describe('reads and likes of a Backend2 article', () => {
  it('counts the read and the like on Backend2, remembering them apart from legacy', async () => {
    routes.push((call) =>
      call.url === '/api/v2/blog/posts/rich-article/read' ? ok({ readCount: 1, likeCount: 0 }) : undefined,
    )
    routes.push((call) =>
      call.url === '/api/v2/blog/posts/rich-article/like'
        ? ok({ readCount: 1, likeCount: (call.body as { liked: boolean }).liked ? 1 : 0 })
        : undefined,
    )

    // Liked on the legacy page long ago: that must not show as liked here.
    window.localStorage.setItem('blog:liked', JSON.stringify(['rich-article']))

    render(<PostEngagement source="v2" slug="rich-article" viewCount={0} likeCount={0} />)

    await screen.findByText('1 read')
    const like = screen.getByRole('button', { pressed: false })

    fireEvent.click(like)
    await waitFor(() => expect(screen.getByRole('button', { pressed: true })).toBeTruthy())

    expect(calls.map((call) => [call.method, call.url, call.body])).toEqual([
      ['POST', '/api/v2/blog/posts/rich-article/read', {}],
      ['POST', '/api/v2/blog/posts/rich-article/like', { liked: true }],
    ])
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem('blog:v2:liked') ?? '[]')).toEqual(['rich-article']))
    expect(JSON.parse(window.localStorage.getItem('blog:v2:read') ?? '[]')).toEqual(['rich-article'])
  })

  it('puts the like back when Backend2 refuses it', async () => {
    window.localStorage.setItem('blog:v2:read', JSON.stringify(['a']))
    routes.push((call) => (call.url.endsWith('/like') ? refuse(429, 'RATE_LIMITED', 'too_fast') : undefined))

    render(<PostEngagement source="v2" slug="a" viewCount={5} likeCount={2} />)

    fireEvent.click(screen.getByRole('button', { pressed: false }))
    await waitFor(() => expect(calls).toHaveLength(1))
    await waitFor(() => expect(screen.getByRole('button', { pressed: false }).textContent).toContain('2'))
  })
})
