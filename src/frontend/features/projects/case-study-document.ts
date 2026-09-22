import {
  isSafeHref,
  type RichTextDoc,
  type RichTextNode,
} from '#/backend2/contracts/rich-text.contract'

/**
 * TipTap's JSON into the document the server will accept.
 *
 * A module of its own rather than a corner of the editor component, because
 * it is the part with rules in it: what a pasted web page is allowed to turn
 * into. Keeping it free of TipTap means it can be tested directly, which is
 * the only way to be sure a `javascript:` link or an image with no library id
 * cannot survive a paste.
 */

const LEVELS = new Set([2, 3, 4])

/**
 * TipTap's JSON into the document the server will accept.
 *
 * Mostly a pass-through — StarterKit's node names are already the contract's —
 * but it drops what the schema does not name, clamps a heading that somehow
 * arrived at level 1, and rebuilds an image out of its `mediaId` alone. A
 * paste from a web page is the reason it exists: it arrives full of nodes and
 * attributes nothing downstream can render.
 */
const normalizeNode = (node: unknown): RichTextNode | null => {
  if (!node || typeof node !== 'object') return null

  const source = node as { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: unknown[]; content?: unknown[] }
  const attrs = source.attrs ?? {}
  const children = (source.content ?? []).map(normalizeNode).filter((child): child is RichTextNode => child !== null)

  switch (source.type) {
    case 'text': {
      if (typeof source.text !== 'string' || source.text === '') return null

      const marks = (source.marks ?? [])
        .map((mark) => {
          const entry = mark as { type?: string; attrs?: { href?: unknown } }

          if (entry.type === 'link') {
            const href = typeof entry.attrs?.href === 'string' ? entry.attrs.href : ''

            return isSafeHref(href) ? { type: 'link' as const, attrs: { href } } : null
          }

          return ['bold', 'italic', 'underline', 'strike', 'code'].includes(entry.type ?? '')
            ? { type: entry.type as 'bold' | 'italic' | 'underline' | 'strike' | 'code' }
            : null
        })
        .filter((mark): mark is NonNullable<typeof mark> => mark !== null)

      return marks.length > 0
        ? { type: 'text', text: source.text, marks }
        : { type: 'text', text: source.text }
    }

    case 'hardBreak':
      return { type: 'hardBreak' }

    case 'horizontalRule':
      return { type: 'horizontalRule' }

    case 'paragraph':
      return { type: 'paragraph', content: children }

    case 'heading': {
      const level = Number(attrs.level)

      return {
        type: 'heading',
        attrs: { level: (LEVELS.has(level) ? level : 2) as 2 | 3 | 4 },
        content: children,
      }
    }

    case 'blockquote':
      return { type: 'blockquote', content: children }

    case 'bulletList':
      return { type: 'bulletList', content: children }

    case 'orderedList':
      return {
        type: 'orderedList',
        attrs: { start: Number.isFinite(Number(attrs.start)) ? Number(attrs.start) : 1 },
        content: children,
      }

    case 'listItem':
      return { type: 'listItem', content: children }

    case 'codeBlock':
      return {
        type: 'codeBlock',
        attrs: { language: typeof attrs.language === 'string' ? attrs.language.slice(0, 40) : null },
        content: children,
      }

    case 'image': {
      // No id, no image. A picture the database cannot account for is exactly
      // what this node type exists to prevent.
      if (typeof attrs.mediaId !== 'string' || attrs.mediaId === '') return null

      return {
        type: 'image',
        attrs: {
          mediaId: attrs.mediaId,
          alt: typeof attrs.alt === 'string' ? attrs.alt.slice(0, 500) : '',
          width: Number.isFinite(Number(attrs.width)) ? Number(attrs.width) : null,
          height: Number.isFinite(Number(attrs.height)) ? Number(attrs.height) : null,
        },
      }
    }

    case 'table':
      return { type: 'table', content: children }

    case 'tableRow':
      return { type: 'tableRow', content: children }

    case 'tableHeader':
    case 'tableCell': {
      const span = (value: unknown) => {
        const number = Number(value)

        return Number.isFinite(number) && number >= 1 && number <= 20 ? number : 1
      }

      return {
        type: source.type,
        attrs: { colspan: span(attrs.colspan), rowspan: span(attrs.rowspan) },
        content: children,
      }
    }

    default:
      return null
  }
}

export const normalizeDoc = (json: unknown): RichTextDoc => {
  const source = json as { content?: unknown[] } | null

  return {
    type: 'doc',
    content: (source?.content ?? [])
      .map(normalizeNode)
      .filter((node): node is RichTextNode => node !== null),
  }
}

