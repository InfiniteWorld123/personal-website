import { describe, expect, it } from 'vitest'
import { richTextToLetter, richTextToPlainText } from '#/shared/validation/rich-text'
import type { RichTextDoc } from '#/shared/validation/rich-text'

const paragraph = (...text: string[]): RichTextDoc['content'][number] => ({
  type: 'paragraph',
  content: text.map((value) => ({ type: 'text' as const, text: value })),
})

describe('richTextToLetter', () => {
  /**
   * The fault this exists for. A reply written as three paragraphs was sent
   * and stored as "Sehr geehrter Herr Warehiermit sende ich…" — every break
   * gone, the words welded together, and neither the mail nor the copy in the
   * inbox matching what was actually typed.
   */
  it('keeps paragraphs apart', () => {
    const doc: RichTextDoc = {
      type: 'doc',
      content: [
        paragraph('Sehr geehrter Herr Ware'),
        paragraph('hiermit sende ich Ihnen meine Webseite.'),
        paragraph('Mit freundlichen Grüßen'),
      ],
    }

    expect(richTextToLetter(doc)).toBe(
      'Sehr geehrter Herr Ware\n\nhiermit sende ich Ihnen meine Webseite.\n\nMit freundlichen Grüßen',
    )
  })

  /** Shift+Enter carries no children, so anything walking content alone drops it. */
  it('keeps a soft line break inside a paragraph', () => {
    const doc: RichTextDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Yaman Warda' },
            { type: 'hardBreak' },
            { type: 'text', text: 'yamanwarda.de' },
          ],
        },
      ],
    }

    expect(richTextToLetter(doc)).toBe('Yaman Warda\nyamanwarda.de')
  })

  it('does not leave a run of blank lines behind an empty paragraph', () => {
    const doc: RichTextDoc = {
      type: 'doc',
      content: [paragraph('One'), { type: 'paragraph' }, paragraph('Two')],
    }

    expect(richTextToLetter(doc)).toBe('One\n\nTwo')
  })

  it('reads the words inside a list, in order', () => {
    const doc: RichTextDoc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('Hosting')] },
            { type: 'listItem', content: [paragraph('Backups')] },
          ],
        },
      ],
    }

    expect(richTextToLetter(doc)).toContain('Hosting')
    expect(richTextToLetter(doc)).toContain('Backups')
  })

  /**
   * The old function stays as it was: reading time and one-line excerpts still
   * want every break collapsed. The two are not interchangeable, which is the
   * whole reason the letter version had to exist.
   */
  it('is not the same as the excerpt flattener', () => {
    const doc: RichTextDoc = { type: 'doc', content: [paragraph('One'), paragraph('Two')] }

    expect(richTextToPlainText(doc)).toBe('One Two')
    expect(richTextToLetter(doc)).toBe('One\n\nTwo')
  })
})
