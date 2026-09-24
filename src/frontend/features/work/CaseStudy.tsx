import type { ReactNode } from 'react'
import type { PublicRichTextDoc, PublicRichTextNode } from '#/backend2/contracts/project.contract'
import type { RichTextMark } from '#/backend2/contracts/rich-text.contract'

/**
 * A Backend2 case study on the public project page.
 *
 * The owner approved extending the accepted project page to carry the
 * rich-text story (`docs/v2/projects.md`, "Frontend direction"), in the page's
 * own typography: headings as the page's section titles, body text at the size
 * and colour of the legacy "Starting point / What I built" blocks, and the
 * same reveal motion on every top-level block.
 *
 * It walks the tree and emits React elements for the node types the contract
 * names, and nothing else — no HTML string, so nothing to sanitise. Links are
 * checked again here with a local copy of the contract's rule, so the public
 * bundle does not carry the contract's validation schemas for one function.
 */

const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:']

export const isSafePublicHref = (value: string): boolean => {
  const href = value.trim()

  if (href === '') return false
  if (/^\/(?![/\\])/.test(href)) return true

  try {
    return SAFE_PROTOCOLS.includes(new URL(href).protocol)
  } catch {
    return false
  }
}

const renderText = (text: string, marks: RichTextMark[] | undefined, key: number): ReactNode => {
  let node: ReactNode = text

  for (const mark of marks ?? []) {
    switch (mark.type) {
      case 'bold':
        node = <strong className="font-semibold text-foreground">{node}</strong>
        break
      case 'italic':
        node = <em>{node}</em>
        break
      case 'underline':
        node = <u>{node}</u>
        break
      case 'strike':
        node = <s>{node}</s>
        break
      case 'code':
        node = <code className="rounded-md bg-secondary px-1.5 py-0.5 text-[0.88em]" dir="ltr">{node}</code>
        break
      case 'link': {
        const href = mark.attrs.href.trim()

        if (!isSafePublicHref(href)) break

        const external = !href.startsWith('/')

        node = (
          <a
            href={href}
            className="text-primary underline decoration-primary/35 underline-offset-4 hover:decoration-primary"
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {node}
          </a>
        )
        break
      }
    }
  }

  return <span key={key}>{node}</span>
}

const renderNodes = (nodes: PublicRichTextNode[] | undefined): ReactNode =>
  (nodes ?? []).map((node, index) => renderNode(node, index))

const cellClass = 'border-border border-b px-3 py-2.5 text-start align-top'

const renderNode = (node: PublicRichTextNode, key: number): ReactNode => {
  switch (node.type) {
    case 'text':
      return renderText(node.text, node.marks, key)

    case 'hardBreak':
      return <br key={key} />

    case 'horizontalRule':
      return <hr key={key} className="border-border" />

    case 'paragraph':
      return (
        <p key={key} className="text-foreground/85 text-lg leading-relaxed">
          {renderNodes(node.content)}
        </p>
      )

    case 'heading': {
      const content = renderNodes(node.content)

      // The page's own h1 is the project name, so the story starts at h2 —
      // drawn as the legacy blocks draw their titles.
      if (node.attrs.level === 2) {
        return (
          <h2 key={key} className="section-title text-display-sm text-foreground">
            {content}
          </h2>
        )
      }

      if (node.attrs.level === 3) {
        return (
          <h3 key={key} className="text-foreground text-xl font-medium">
            {content}
          </h3>
        )
      }

      return (
        <h4 key={key} className="text-foreground text-base font-medium">
          {content}
        </h4>
      )
    }

    case 'blockquote':
      return (
        <blockquote key={key} className="border-primary/60 text-foreground/75 flex flex-col gap-3 border-s-2 ps-5">
          {renderNodes(node.content)}
        </blockquote>
      )

    case 'bulletList':
      return (
        <ul key={key} className="text-foreground/85 flex list-disc flex-col gap-2 ps-6 text-lg leading-relaxed marker:text-primary">
          {renderNodes(node.content)}
        </ul>
      )

    case 'orderedList':
      return (
        <ol key={key} start={node.attrs.start} className="text-foreground/85 flex list-decimal flex-col gap-2 ps-6 text-lg leading-relaxed marker:text-primary">
          {renderNodes(node.content)}
        </ol>
      )

    case 'listItem':
      // Its paragraph is drawn at the list's own size and colour.
      return <li key={key}>{renderNodes(node.content)}</li>

    case 'codeBlock':
      return (
        <pre key={key} dir="ltr" className="bg-secondary text-foreground/85 overflow-x-auto rounded-2xl p-5 text-sm leading-relaxed">
          <code>{renderNodes(node.content)}</code>
        </pre>
      )

    case 'image':
      return (
        <figure key={key}>
          <img
            className="project-page-image"
            src={node.attrs.src}
            alt={node.attrs.alt}
            width={node.attrs.width ?? undefined}
            height={node.attrs.height ?? undefined}
            loading="lazy"
          />
        </figure>
      )

    case 'table':
      return (
        <div key={key} className="overflow-x-auto">
          <table className="text-foreground/85 w-full border-collapse text-sm">
            <tbody>{renderNodes(node.content)}</tbody>
          </table>
        </div>
      )

    case 'tableRow':
      return <tr key={key}>{renderNodes(node.content)}</tr>

    case 'tableHeader':
      return (
        <th key={key} colSpan={node.attrs.colspan} rowSpan={node.attrs.rowspan} className={`${cellClass} text-foreground font-medium`}>
          {renderNodes(node.content)}
        </th>
      )

    case 'tableCell':
      return (
        <td key={key} colSpan={node.attrs.colspan} rowSpan={node.attrs.rowspan} className={cellClass}>
          {renderNodes(node.content)}
        </td>
      )

    default:
      return null
  }
}

export function CaseStudy({ doc }: { doc: PublicRichTextDoc }) {
  return (
    // 12px from a heading to its text and 40px from text to the next
    // heading — the spacing of the legacy "Starting point" blocks.
    <div className="flex flex-col gap-3">
      {doc.content.map((node, index) => (
        // Each top-level block reveals on its own, as the legacy blocks do.
        <div key={index} data-reveal className={node.type === 'heading' && index > 0 ? 'pt-7' : undefined}>
          {renderNode(node, index)}
        </div>
      ))}
    </div>
  )
}
