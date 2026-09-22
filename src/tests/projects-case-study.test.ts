import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { normalizeDoc } from '#/frontend/features/projects/case-study-document'
import { RichTextDocSchema } from '#/backend2/contracts/rich-text.contract'

/**
 * What a case study is allowed to become.
 *
 * The editor is a paste target, and a paste from a web page arrives full of
 * node types and attributes nothing downstream can draw. This is the function
 * that decides what survives, so it is tested directly rather than through
 * TipTap — and every result is checked against the contract the server
 * enforces, because "the editor produced it" is not a reason for the API to
 * accept it.
 */

const parses = (json: unknown) => v.safeParse(RichTextDocSchema, normalizeDoc(json))

describe('turning editor output into a stored document', () => {
  it('keeps the ordinary shape of a written page', () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Die Aufgabe' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Ein ' },
            { type: 'text', text: 'Makler', marks: [{ type: 'bold' }] },
          ],
        },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
      ],
    })

    expect(doc.content).toHaveLength(3)
    expect(doc.content[0]).toMatchObject({ type: 'heading', attrs: { level: 3 } })
    expect(v.safeParse(RichTextDocSchema, doc).success).toBe(true)
  })

  it('refuses a link the browser should never follow', () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click me',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    })

    const paragraph = doc.content[0] as { content: Array<{ marks?: unknown[] }> }

    // The words survive; the trap does not.
    expect(paragraph.content[0]!.marks ?? []).toEqual([])
    expect(v.safeParse(RichTextDocSchema, doc).success).toBe(true)
  })

  it('keeps a real link and a site-relative one', () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a', marks: [{ type: 'link', attrs: { href: 'https://x.test' } }] },
            { type: 'text', text: 'b', marks: [{ type: 'link', attrs: { href: '/work' } }] },
          ],
        },
      ],
    })

    const paragraph = doc.content[0] as { content: Array<{ marks?: Array<{ type: string }> }> }

    expect(paragraph.content[0]!.marks?.[0]).toMatchObject({ type: 'link' })
    expect(paragraph.content[1]!.marks?.[0]).toMatchObject({ type: 'link' })
  })

  it('drops an image the library cannot account for', () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [
        // Pasted from somewhere else: a real address, and no id.
        { type: 'image', attrs: { src: 'https://elsewhere.test/photo.jpg', alt: 'stolen' } },
        {
          type: 'image',
          attrs: {
            mediaId: '11111111-1111-4111-8111-111111111111',
            alt: 'Das Titelbild',
            width: 800,
            height: 600,
          },
        },
      ],
    })

    expect(doc.content).toHaveLength(1)
    expect(doc.content[0]).toEqual({
      type: 'image',
      attrs: {
        mediaId: '11111111-1111-4111-8111-111111111111',
        alt: 'Das Titelbild',
        width: 800,
        height: 600,
      },
    })
    // No `src` reaches the stored document, ever.
    expect(JSON.stringify(doc)).not.toContain('elsewhere.test')
    expect(JSON.stringify(doc)).not.toContain('src')
  })

  it('throws away node types the renderer does not know', () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [
        { type: 'script', content: [{ type: 'text', text: 'alert(1)' }] },
        { type: 'iframe', attrs: { src: 'https://evil.test' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'kept' }] },
      ],
    })

    expect(doc.content).toHaveLength(1)
    expect(JSON.stringify(doc)).not.toContain('evil.test')
  })

  it('brings a stray heading level into the allowed range', () => {
    // The public page's own <h1> is the project name, so a case study starts
    // at level 2 — a pasted <h1> becomes one rather than being dropped.
    const doc = normalizeDoc({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'T' }] }],
    })

    expect(doc.content[0]).toMatchObject({ attrs: { level: 2 } })
    expect(parses(doc).success).toBe(true)
  })

  it('keeps a table, with its spans clamped to something sane', () => {
    const doc = normalizeDoc({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', attrs: { colspan: 9999, rowspan: null }, content: [] },
                { type: 'tableCell', attrs: {}, content: [] },
              ],
            },
          ],
        },
      ],
    })

    const row = (doc.content[0] as { content: Array<{ attrs: { colspan: number; rowspan: number } }> })
      .content[0] as unknown as { content: Array<{ attrs: { colspan: number; rowspan: number } }> }

    expect(row.content[0]!.attrs).toEqual({ colspan: 1, rowspan: 1 })
    expect(row.content[1]!.attrs).toEqual({ colspan: 1, rowspan: 1 })
    expect(parses(doc).success).toBe(true)
  })

  it('produces an empty document from nothing at all', () => {
    for (const input of [null, undefined, {}, { type: 'doc' }, { content: [] }]) {
      expect(normalizeDoc(input)).toEqual({ type: 'doc', content: [] })
    }
  })

  it('always produces something the server would accept', () => {
    const messy = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 7 }, content: [{ type: 'text', text: 'x' }] },
        { type: 'orderedList', attrs: {}, content: [] },
        { type: 'codeBlock', attrs: { language: 'a'.repeat(200) }, content: [] },
        { type: 'unknown' },
        { type: 'text', text: '' },
      ],
    }

    expect(parses(messy).success).toBe(true)
  })
})
