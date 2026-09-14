import { isSafeHref, type RichTextDoc, type RichTextMark, type RichTextNode } from '#/shared/validation/rich-text'
import { escapeHtml } from './mail'

/**
 * The document as an email body.
 *
 * The browser renders the same tree into React; a letter needs HTML, and this
 * is the one place that turns one into the other. It walks the node types the
 * schema names and emits nothing for anything else — an attribute the schema
 * does not carry can never reach a mail client, which is why no sanitiser is
 * needed here either (D24).
 *
 * Styling is inline and conservative, because mail clients drop a stylesheet.
 */

const SANS = 'Helvetica,Arial,sans-serif'

const markOpen = (mark: RichTextMark): string => {
  switch (mark.type) {
    case 'bold': return '<strong>'
    case 'italic': return '<em>'
    case 'strike': return '<s>'
    case 'underline': return '<u>'
    case 'code': return '<code style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px">'
    case 'link': return isSafeHref(mark.attrs.href)
      ? `<a href="${escapeHtml(mark.attrs.href)}" style="color:#355cff">`
      : '<span>'
    default: return ''
  }
}

const markClose = (mark: RichTextMark): string => {
  switch (mark.type) {
    case 'bold': return '</strong>'
    case 'italic': return '</em>'
    case 'strike': return '</s>'
    case 'underline': return '</u>'
    case 'code': return '</code>'
    case 'link': return isSafeHref(mark.attrs.href) ? '</a>' : '</span>'
    default: return ''
  }
}

const children = (nodes: RichTextNode[] | undefined): string =>
  (nodes ?? []).map(nodeToHtml).join('')

const nodeToHtml = (node: RichTextNode): string => {
  switch (node.type) {
    case 'text': {
      const text = escapeHtml(node.text)
      const marks = node.marks ?? []

      return marks.map(markOpen).join('') + text + [...marks].reverse().map(markClose).join('')
    }
    case 'hardBreak':
      return '<br />'
    case 'horizontalRule':
      return '<hr style="border:0;border-top:1px solid #e3ebff;margin:18px 0" />'
    case 'paragraph':
      return `<p style="margin:0 0 14px;font:400 15px/1.75 ${SANS}">${children(node.content) || '&nbsp;'}</p>`
    case 'heading':
      return `<h${node.attrs.level} style="margin:22px 0 8px;font:700 ${node.attrs.level === 2 ? 19 : 17}px/1.4 ${SANS}">${children(node.content)}</h${node.attrs.level}>`
    case 'blockquote':
      return `<blockquote style="margin:0 0 14px;padding:2px 14px;border-inline-start:3px solid #e3ebff;color:#5d6b8f">${children(node.content)}</blockquote>`
    case 'bulletList':
      return `<ul style="margin:0 0 14px;padding-inline-start:22px;font:400 15px/1.75 ${SANS}">${children(node.content)}</ul>`
    case 'orderedList':
      return `<ol start="${node.attrs.start}" style="margin:0 0 14px;padding-inline-start:22px;font:400 15px/1.75 ${SANS}">${children(node.content)}</ol>`
    case 'listItem':
      // A list item wraps its text in a paragraph; the margin would double-space the list.
      return `<li style="margin:0 0 4px">${children(node.content).replace(/margin:0 0 14px/g, 'margin:0')}</li>`
    default:
      return ''
  }
}

export const richTextToHtml = (doc: RichTextDoc): string => children(doc.content)
