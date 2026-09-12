import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import {
  RichTextDocSchema,
  type RichTextDoc,
  isRichTextEmpty,
  isSafeHref,
  isSafeImageSrc,
  readingMinutes,
  richTextToPlainText,
} from '#/shared/validation/rich-text'

const parse = (doc: unknown) => v.safeParse(RichTextDocSchema, doc)

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

describe('link safety', () => {
  it('allows the protocols a reader can follow', () => {
    expect(isSafeHref('https://example.com/a')).toBe(true)
    expect(isSafeHref('http://example.com')).toBe(true)
    expect(isSafeHref('mailto:hallo@example.com')).toBe(true)
  })

  it('allows a path on this site but not a protocol-relative one', () => {
    expect(isSafeHref('/en/work/tech-store')).toBe(true)
    // `//evil.example` is another origin wearing a path's clothes.
    expect(isSafeHref('//evil.example')).toBe(false)
  })

  it('treats a backslash after the leading slash as off-site', () => {
    // Browsers normalise `/\` to `//`, so this leaves the site the same way a
    // protocol-relative link does.
    expect(isSafeHref('/\\evil.example')).toBe(false)
    expect(isSafeImageSrc('/\\evil.example/logo.png')).toBe(false)
  })

  it('still allows the site root', () => {
    expect(isSafeHref('/')).toBe(true)
  })

  it('refuses the protocols that execute', () => {
    expect(isSafeHref('javascript:alert(1)')).toBe(false)
    expect(isSafeHref('JavaScript:alert(1)')).toBe(false)
    expect(isSafeHref('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeHref('vbscript:msgbox(1)')).toBe(false)
    expect(isSafeHref('   ')).toBe(false)
  })

  it('holds images to https or a path here', () => {
    expect(isSafeImageSrc('https://cdn.example.com/a.webp')).toBe(true)
    expect(isSafeImageSrc('/images/posts/a.webp')).toBe(true)
    expect(isSafeImageSrc('http://example.com/a.png')).toBe(false)
    expect(isSafeImageSrc('data:image/svg+xml,<svg onload=alert(1)>')).toBe(false)
  })
})

describe('the article schema', () => {
  it('accepts a document the editor produces', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Why' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Read ' },
            {
              type: 'text',
              text: 'the guide',
              marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.com' } }],
            },
          ],
        },
        { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('One')] }] },
        { type: 'horizontalRule' },
      ],
    }

    expect(parse(doc).success).toBe(true)
  })

  it('refuses a node type the renderer cannot draw', () => {
    expect(parse({ type: 'doc', content: [{ type: 'iframe', attrs: { src: 'x' } }] }).success).toBe(
      false,
    )
  })

  it('refuses a link that would execute', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
          ],
        },
      ],
    }

    expect(parse(doc).success).toBe(false)
  })

  it('refuses a heading level the page does not own', () => {
    const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [] }] }

    expect(parse(doc).success).toBe(false)
  })

  it('drops attributes it was not told about', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [
                { type: 'link', attrs: { href: 'https://example.com', onclick: 'alert(1)', target: '_self' } },
              ],
            },
          ],
        },
      ],
    }

    const result = parse(doc)
    expect(result.success).toBe(true)

    const output = (result.success ? result.output : null) as RichTextDoc | null
    const first = output?.content[0]
    const text = first && 'content' in first ? first.content?.[0] : undefined
    const mark = text && text.type === 'text' ? text.marks?.[0] : undefined

    expect(mark).toEqual({ type: 'link', attrs: { href: 'https://example.com' } })
  })
})

describe('reading an article back', () => {
  const doc: RichTextDoc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title here' }] },
      paragraph('Two more words.'),
    ] as RichTextDoc['content'],
  }

  it('flattens the text without running the blocks together', () => {
    expect(richTextToPlainText(doc)).toBe('Title here Two more words.')
  })

  it('calls an empty document empty, whatever empty blocks it holds', () => {
    expect(isRichTextEmpty({ type: 'doc', content: [] })).toBe(true)
    expect(isRichTextEmpty({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true)
    expect(isRichTextEmpty(doc)).toBe(false)
  })

  it('never reports less than one minute', () => {
    expect(readingMinutes({ type: 'doc', content: [] })).toBe(1)
    expect(readingMinutes(doc)).toBe(1)
  })

  it('rounds a long article up', () => {
    const words = Array.from({ length: 450 }, () => 'word').join(' ')

    expect(readingMinutes({ type: 'doc', content: [paragraph(words)] as RichTextDoc['content'] })).toBe(3)
  })
})
