import { Fragment, type ReactNode } from 'react'
import type { PublicBlogNode } from '#/backend2/contracts/blog.contract'
import type { RichTextDoc, RichTextMark, RichTextNode } from '#/shared/validation/rich-text'
import type { ArticleDoc } from './public-article'
import { YoutubeEmbed } from './YoutubeEmbed'

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

/**
 * A node of either backend's document. The legacy article is a subset of the
 * Backend2 one; Backend2 adds tables and, at the top level, a YouTube video.
 */
type BodyNode = RichTextNode | PublicBlogNode

const renderNodes = (nodes: BodyNode[] | undefined): ReactNode =>
  (nodes ?? []).map((node, index) => <Fragment key={index}>{renderNode(node)}</Fragment>)

type CellNode = Extract<BodyNode, { type: 'tableCell' | 'tableHeader' }>

const span = (value: number | undefined) => (value && value > 1 ? value : undefined)

const renderCell = (cell: CellNode, inHead: boolean, index: number): ReactNode =>
  cell.type === 'tableHeader' ? (
    <th key={index} scope={inHead ? 'col' : 'row'} colSpan={span(cell.attrs?.colspan)} rowSpan={span(cell.attrs?.rowspan)}>
      {renderNodes(cell.content)}
    </th>
  ) : (
    <td key={index} colSpan={span(cell.attrs?.colspan)} rowSpan={span(cell.attrs?.rowspan)}>
      {renderNodes(cell.content)}
    </td>
  )

const cellsOf = (row: BodyNode): CellNode[] =>
  row.type === 'tableRow'
    ? ((row.content ?? []) as BodyNode[]).filter(
        (cell): cell is CellNode => cell.type === 'tableCell' || cell.type === 'tableHeader',
      )
    : []

const renderRow = (row: BodyNode, inHead: boolean, index: number): ReactNode => (
  <tr key={index}>{cellsOf(row).map((cell, cellIndex) => renderCell(cell, inHead, cellIndex))}</tr>
)

/**
 * A table keeps its own horizontal scroll, so a wide one never makes the page
 * scroll sideways on a phone. A first row made only of header cells becomes
 * the table's head, which is what a screen reader announces per column.
 */
const renderTable = (rows: BodyNode[]): ReactNode => {
  const onlyRows = rows.filter((row) => row.type === 'tableRow')
  const [first, ...rest] = onlyRows
  const firstCells = first ? cellsOf(first) : []
  const headed = firstCells.length > 0 && firstCells.every((cell) => cell.type === 'tableHeader')
  const body = headed ? rest : onlyRows

  return (
    <div className="post-table">
      <table>
        {headed && first ? <thead>{renderRow(first, true, 0)}</thead> : null}
        <tbody>{body.map((row, index) => renderRow(row, false, index))}</tbody>
      </table>
    </div>
  )
}

const renderNode = (node: BodyNode): ReactNode => {
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
    case 'table':
      return renderTable((node.content ?? []) as BodyNode[])
    case 'youtube':
      return <YoutubeEmbed videoId={node.attrs.videoId} start={node.attrs.start} title={node.attrs.title} />
    default:
      return null
  }
}

export function PostBody({ doc }: { doc: ArticleDoc }) {
  return <div className="post-body">{renderNodes(doc.content as BodyNode[])}</div>
}

/**
 * The same renderer without the article's typography, for a document that is
 * not an article — a reply in the inbox thread. Same guarantee: nothing the
 * schema does not name reaches the screen.
 */
export function RichTextView({ doc, className }: { doc: RichTextDoc; className?: string }) {
  return <div className={className}>{renderNodes(doc.content)}</div>
}
