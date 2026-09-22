import type { ReactNode } from 'react'
import type {
  PublicRichTextDoc,
  PublicRichTextNode,
} from '#/backend2/contracts/project.contract'
import { isSafeHref, type RichTextMark } from '#/backend2/contracts/rich-text.contract'

/**
 * A case study, drawn — for the owner's preview.
 *
 * It walks the stored tree and emits React elements for the node types the
 * contract names, and nothing else: there is no HTML string anywhere in this
 * file, so there is no markup to sanitise and nothing a pasted page could
 * smuggle through. An unknown node draws nothing rather than guessing.
 *
 * Links are checked again here even though the server already refused unsafe
 * ones. The check costs nothing, and it means this component stays safe if it
 * is ever handed a document that did not come through the contract.
 */

const renderText = (text: string, marks: RichTextMark[] | undefined, key: number): ReactNode => {
  let node: ReactNode = text

  for (const mark of marks ?? []) {
    switch (mark.type) {
      case 'bold':
        node = <strong>{node}</strong>
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
        node = (
          <code className="rounded bg-[var(--dash-chip)] px-1 py-0.5 text-[0.92em]">{node}</code>
        )
        break
      case 'link':
        node = isSafeHref(mark.attrs.href) ? (
          <a
            href={mark.attrs.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--dash-brand)] underline"
          >
            {node}
          </a>
        ) : (
          node
        )
        break
    }
  }

  return <span key={key}>{node}</span>
}

const renderNodes = (nodes: PublicRichTextNode[] | undefined): ReactNode =>
  (nodes ?? []).map((node, index) => renderNode(node, index))

const renderNode = (node: PublicRichTextNode, key: number): ReactNode => {
  switch (node.type) {
    case 'text':
      return renderText(node.text, node.marks, key)

    case 'hardBreak':
      return <br key={key} />

    case 'horizontalRule':
      return <hr key={key} className="my-6 border-[var(--dash-line)]" />

    case 'paragraph':
      return (
        <p key={key} className="my-3">
          {renderNodes(node.content)}
        </p>
      )

    case 'heading': {
      const content = renderNodes(node.content)

      // Level 2 at the top: the page's own heading is the project name.
      if (node.attrs.level === 2) {
        return (
          <h2 key={key} className="mt-8 mb-2 text-[20px] font-semibold">
            {content}
          </h2>
        )
      }

      if (node.attrs.level === 3) {
        return (
          <h3 key={key} className="mt-6 mb-2 text-[17px] font-semibold">
            {content}
          </h3>
        )
      }

      return (
        <h4 key={key} className="mt-5 mb-1.5 text-[15px] font-semibold">
          {content}
        </h4>
      )
    }

    case 'blockquote':
      return (
        <blockquote
          key={key}
          className="my-4 border-s-2 border-[var(--dash-brand)] ps-4 text-[var(--dash-quiet)]"
        >
          {renderNodes(node.content)}
        </blockquote>
      )

    case 'bulletList':
      return (
        <ul key={key} className="my-3 list-disc ps-6">
          {renderNodes(node.content)}
        </ul>
      )

    case 'orderedList':
      return (
        <ol key={key} start={node.attrs.start} className="my-3 list-decimal ps-6">
          {renderNodes(node.content)}
        </ol>
      )

    case 'listItem':
      return <li key={key}>{renderNodes(node.content)}</li>

    case 'codeBlock':
      return (
        <pre
          key={key}
          dir="ltr"
          className="my-4 overflow-x-auto rounded-[10px] bg-[var(--dash-slab)] p-4 text-[12.5px] text-[var(--dash-slab-ink)]"
        >
          <code>{renderNodes(node.content)}</code>
        </pre>
      )

    case 'image':
      return (
        <figure key={key} className="my-5">
          <img
            src={node.attrs.src}
            alt={node.attrs.alt}
            width={node.attrs.width ?? undefined}
            height={node.attrs.height ?? undefined}
            loading="lazy"
            className="h-auto max-w-full rounded-[12px] border border-[var(--dash-line)]"
          />
          {node.attrs.alt === '' ? (
            // A preview-only warning: an image with no description in this
            // language is what publication will refuse, so say it here too.
            <figcaption className="mt-1.5 text-[11.5px] font-medium text-[var(--dash-red-ink)]">
              This image has no description in this language yet.
            </figcaption>
          ) : null}
        </figure>
      )

    case 'table':
      return (
        <div key={key} className="my-4 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <tbody>{renderNodes(node.content)}</tbody>
          </table>
        </div>
      )

    case 'tableRow':
      return <tr key={key}>{renderNodes(node.content)}</tr>

    case 'tableHeader':
      return (
        <th
          key={key}
          colSpan={node.attrs.colspan}
          rowSpan={node.attrs.rowspan}
          className="border border-[var(--dash-line)] bg-[var(--dash-chip)] p-2 text-start font-semibold"
        >
          {renderNodes(node.content)}
        </th>
      )

    case 'tableCell':
      return (
        <td
          key={key}
          colSpan={node.attrs.colspan}
          rowSpan={node.attrs.rowspan}
          className="border border-[var(--dash-line)] p-2 align-top"
        >
          {renderNodes(node.content)}
        </td>
      )

    default:
      return null
  }
}

export function CaseStudyView({ doc }: { doc: PublicRichTextDoc }) {
  return <div className="text-[15px] leading-relaxed">{renderNodes(doc.content)}</div>
}
