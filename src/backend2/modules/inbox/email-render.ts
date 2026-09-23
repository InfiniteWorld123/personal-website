import type { RichTextDoc, RichTextMark, RichTextNode } from '../../contracts/rich-text.contract'
import { isSafeHref } from '../../contracts/rich-text.contract'

/**
 * An email body, twice: HTML for clients that render it, and plain text for
 * the ones that do not — and for search, the list excerpt and the log of what
 * was sent.
 *
 * Built from the validated tree, never from markup, so there is nothing to
 * sanitise: every character of text is escaped, and only the handful of tags
 * written below can ever appear.
 */

const escapeHtml = (value: string): string =>
  value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')

const wrapMarks = (text: string, marks: RichTextMark[] = []): string =>
  marks.reduce((inner, mark) => {
    switch (mark.type) {
      case 'bold':
        return `<strong>${inner}</strong>`
      case 'italic':
        return `<em>${inner}</em>`
      case 'underline':
        return `<u>${inner}</u>`
      case 'strike':
        return `<s>${inner}</s>`
      case 'code':
        return `<code>${inner}</code>`
      case 'link':
        // Checked again here: the schema already refused anything else, and
        // this is the last place an unsafe href could still be stopped.
        return isSafeHref(mark.attrs.href) && !mark.attrs.href.startsWith('/')
          ? `<a href="${escapeHtml(mark.attrs.href)}">${inner}</a>`
          : inner
    }
  }, text)

const htmlOf = (nodes: RichTextNode[] = []): string => nodes.map(nodeHtml).join('')

const nodeHtml = (node: RichTextNode): string => {
  switch (node.type) {
    case 'text':
      return wrapMarks(escapeHtml(node.text), node.marks)
    case 'hardBreak':
      return '<br>'
    case 'horizontalRule':
      return '<hr>'
    case 'paragraph':
      return `<p style="margin:0 0 12px">${htmlOf(node.content) || '&nbsp;'}</p>`
    case 'heading':
      return `<h${node.attrs.level}>${htmlOf(node.content)}</h${node.attrs.level}>`
    case 'blockquote':
      return `<blockquote style="margin:0 0 12px;padding-left:12px;border-left:3px solid #ccc">${htmlOf(node.content)}</blockquote>`
    case 'bulletList':
      return `<ul>${htmlOf(node.content)}</ul>`
    case 'orderedList':
      return `<ol start="${node.attrs.start}">${htmlOf(node.content)}</ol>`
    case 'listItem':
      return `<li>${htmlOf(node.content)}</li>`
    case 'codeBlock':
      return `<pre>${htmlOf(node.content)}</pre>`
    default:
      // Images and tables are refused by the email schema before this runs.
      return ''
  }
}

const inlineText = (nodes: RichTextNode[] = []): string =>
  nodes
    .map((node) => {
      if (node.type === 'text') {
        const link = node.marks?.find((mark) => mark.type === 'link')

        return link && link.type === 'link' && link.attrs.href !== node.text
          ? `${node.text} (${link.attrs.href})`
          : node.text
      }

      if (node.type === 'hardBreak') return '\n'

      return 'content' in node ? inlineText(node.content) : ''
    })
    .join('')

const blockText = (nodes: RichTextNode[], indent = ''): string[] => {
  const blocks: string[] = []

  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph':
      case 'heading':
      case 'codeBlock':
        blocks.push(indent + inlineText(node.content).replace(/\n/gu, `\n${indent}`))
        break
      case 'blockquote':
        blocks.push(...blockText(node.content ?? [], `${indent}> `))
        break
      case 'horizontalRule':
        blocks.push(`${indent}---`)
        break
      case 'bulletList':
      case 'orderedList': {
        const start = node.type === 'orderedList' ? node.attrs.start : 1

        ;(node.content ?? []).forEach((item, index) => {
          const marker = node.type === 'orderedList' ? `${start + index}. ` : '- '
          const inner = blockText('content' in item ? (item.content ?? []) : [], '').join('\n')

          blocks.push(`${indent}${marker}${inner.replace(/\n/gu, `\n${indent}   `)}`)
        })
        break
      }
      case 'text':
      case 'hardBreak':
        blocks.push(indent + inlineText([node]))
        break
      default:
        break
    }
  }

  return blocks
}

export const docToPlainText = (doc: RichTextDoc): string =>
  blockText(doc.content).join('\n\n').replace(/\n{3,}/gu, '\n\n').trim()

/** The quoted history under a reply, as most mail clients write it. */
export type QuotedMessage = { from: string; at: Date; text: string }

export const renderEmail = (input: {
  doc: RichTextDoc
  quoted?: QuotedMessage | null
}): { html: string; text: string } => {
  const text = docToPlainText(input.doc)
  const body = htmlOf(input.doc.content)

  if (!input.quoted) {
    return {
      text,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${body}</div>`,
    }
  }

  const header = `On ${input.quoted.at.toUTCString()}, ${input.quoted.from} wrote:`
  const quotedText = input.quoted.text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')

  return {
    text: `${text}\n\n${header}\n${quotedText}`,
    html:
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${body}` +
      `<p style="margin:16px 0 4px;color:#666">${escapeHtml(header)}</p>` +
      `<blockquote style="margin:0;padding-left:12px;border-left:3px solid #ccc;color:#555">` +
      `${escapeHtml(input.quoted.text).replace(/\n/gu, '<br>')}</blockquote></div>`,
  }
}

/** A short one-line excerpt for the conversation list. */
export const previewOf = (text: string): string => text.replace(/\s+/gu, ' ').trim().slice(0, 200)
