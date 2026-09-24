// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PostBody } from '#/frontend/features/blog/PostBody'
import type { ArticleDoc } from '#/frontend/features/blog/public-article'

afterEach(cleanup)

const doc = (content: ArticleDoc['content']): ArticleDoc => ({ type: 'doc', content })

describe('rendering a stored article', () => {
  it('draws each block as the tag the stylesheet expects', () => {
    const { container } = render(
      <PostBody
        doc={doc([
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
          {
            type: 'bulletList',
            content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }] },
            ],
          },
          { type: 'horizontalRule' },
        ])}
      />,
    )

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Heading')
    expect(container.querySelector('ul li')?.textContent).toBe('One')
    expect(container.querySelector('hr')).not.toBeNull()
  })

  it('nests marks so the writer gets both', () => {
    const { container } = render(
      <PostBody
        doc={doc([
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'here',
                marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.com' } }],
              },
            ],
          },
        ])}
      />,
    )

    const link = screen.getByRole('link', { name: 'here' })
    expect(link.getAttribute('href')).toBe('https://example.com')
    // An outbound link opens in its own tab and passes on no referrer credit.
    expect(link.getAttribute('rel')).toBe('noreferrer nofollow')
    expect(container.querySelector('strong a')).not.toBeNull()
  })

  it('renders nothing for a node type it does not know', () => {
    const { container } = render(
      // Nothing can store this — the schema rejects it — but the renderer is
      // the second half of that guarantee, so it is checked on its own.
      <PostBody doc={doc([{ type: 'script', text: 'alert(1)' } as never])} />,
    )

    expect(container.querySelector('.post-body')?.innerHTML).toBe('')
  })
})
