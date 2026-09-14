import { Fragment, type ReactNode } from 'react'
import type { RichTextDoc, RichTextMark, RichTextNode } from '#/shared/validation/rich-text'

/**
 * Renders a stored article. This function is the whole reason the body is a
 * document rather than HTML: it emits an element for each node type it knows
 * and returns nothing for anything else, so an attribute or tag the editor did
 * not produce cannot reach the page. There is no `dangerouslySetInnerHTML`
 * anywhere in the blog (D24).
 */

const applyMarks = (content: ReactNode, marks: RichTextMark[] | undefined): ReactNode => {
  if (!marks || marks.length === 0) return content

  // The document lists marks outermost first, so folding from the right
  // puts the last one closest to the text and keeps that nesting.
  return marks.reduceRight<ReactNode>((wrapped, mark) => {
    switch (mark.type) {
      case 'bold':
        return <strong>{wrapped}</strong>
      case 'italic':
        return <em>{wrapped}</em>
      case 'strike':
        return <s>{wrapped}</s>
      case 'underline':
        return <u>{wrapped}</u>
      case 'code':
        return <code>{wrapped}</code>
      case 'link':
        return (
          // An outbound link from an article is opened in its own tab and
          // carries no referrer credit it did not earn.
          <a href={mark.attrs.href} target="_blank" rel="noreferrer nofollow">
            {wrapped}
          </a>
        )
      default:
        return wrapped
    }
  }, content)
}

const renderNodes = (nodes: RichTextNode[] | undefined): ReactNode =>
  (nodes ?? []).map((node, index) => <Fragment key={index}>{renderNode(node)}</Fragment>)

const renderNode = (node: RichTextNode): ReactNode => {
  switch (node.type) {
    case 'text':
      return applyMarks(node.text, node.marks)
    case 'hardBreak':
      return <br />
    case 'horizontalRule':
      return <hr />
    case 'paragraph':
      return <p>{renderNodes(node.content)}</p>
    case 'heading': {
      // The page's own <h1> is the article title, so a body heading starts at 2.
      const Tag = `h${node.attrs.level}` as 'h2' | 'h3' | 'h4'

      return <Tag>{renderNodes(node.content)}</Tag>
    }
    case 'blockquote':
      return <blockquote>{renderNodes(node.content)}</blockquote>
    case 'bulletList':
      return <ul>{renderNodes(node.content)}</ul>
    case 'orderedList':
      return (
        <ol start={node.attrs.start === 1 ? undefined : node.attrs.start}>
          {renderNodes(node.content)}
        </ol>
      )
    case 'listItem':
      return <li>{renderNodes(node.content)}</li>
    case 'codeBlock':
      return (
        <pre dir="ltr">
          <code>{renderNodes(node.content)}</code>
        </pre>
      )
    case 'image':
      return (
        <img
          src={node.attrs.src}
          alt={node.attrs.alt}
          width={node.attrs.width ?? undefined}
          height={node.attrs.height ?? undefined}
          loading="lazy"
        />
      )
    default:
      return null
  }
}

export function PostBody({ doc }: { doc: RichTextDoc }) {
  return <div className="post-body">{renderNodes(doc.content)}</div>
}

/**
 * The same renderer without the article's typography, for a document that is
 * not an article — a reply in the inbox thread. Same guarantee: nothing the
 * schema does not name reaches the screen.
 */
export function RichTextView({ doc, className }: { doc: RichTextDoc; className?: string }) {
  return <div className={className}>{renderNodes(doc.content)}</div>
}
