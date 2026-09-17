import * as v from 'valibot'

/**
 * The article body is stored as a ProseMirror document rather than HTML.
 *
 * The reason is the renderer: it walks this tree and emits React elements for
 * the node types listed below and nothing else. An attribute the schema does
 * not name never reaches the page, so there is no markup to sanitise and no
 * sanitiser to keep current — which matters here, because the site runs on
 * Cloudflare Workers where the DOM-based sanitisers cannot run at all (D24).
 */

export const RICH_TEXT_MARKS = ['bold', 'italic', 'strike', 'underline', 'code', 'link'] as const

export type RichTextMarkType = (typeof RICH_TEXT_MARKS)[number]

export type RichTextMark =
  | { type: Exclude<RichTextMarkType, 'link'> }
  | { type: 'link'; attrs: { href: string } }

export type RichTextNode =
  | { type: 'text'; text: string; marks?: RichTextMark[] }
  | { type: 'hardBreak' }
  | { type: 'horizontalRule' }
  | { type: 'paragraph'; content?: RichTextNode[] }
  | { type: 'heading'; attrs: { level: 2 | 3 | 4 }; content?: RichTextNode[] }
  | { type: 'blockquote'; content?: RichTextNode[] }
  | { type: 'bulletList'; content?: RichTextNode[] }
  | { type: 'orderedList'; attrs: { start: number }; content?: RichTextNode[] }
  | { type: 'listItem'; content?: RichTextNode[] }
  | { type: 'codeBlock'; attrs: { language: string | null }; content?: RichTextNode[] }
  | {
      type: 'image'
      attrs: { src: string; alt: string; width: number | null; height: number | null }
    }

export type RichTextDoc = { type: 'doc'; content: RichTextNode[] }

export const emptyRichTextDoc = (): RichTextDoc => ({ type: 'doc', content: [] })

/**
 * A link the browser may follow. `javascript:` and `data:` are the reason this
 * is a picklist of protocols rather than a URL check: both parse as valid URLs.
 * A path starting with `/` stays allowed so an article can link to another page
 * on this site.
 */
const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:']

export const isSafeHref = (value: string): boolean => {
  const href = value.trim()

  if (href === '') return false
  // Site-relative, but not protocol-relative: `//evil.example` is off-site, and
  // so is `/\evil.example` — browsers normalise that backslash to a slash.
  if (/^\/(?![/\\])/.test(href)) return true

  try {
    return SAFE_PROTOCOLS.includes(new URL(href).protocol)
  } catch {
    return false
  }
}

/** Images come from this site's own storage or an https address; nothing else. */
export const isSafeImageSrc = (value: string): boolean => {
  const src = value.trim()

  if (src === '') return false
  if (/^\/(?![/\\])/.test(src)) return true

  try {
    return new URL(src).protocol === 'https:'
  } catch {
    return false
  }
}

const HrefSchema = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(2000, 'That link is too long'),
  v.check(isSafeHref, 'A link must be http(s), mailto, or a path on this site'),
)

const ImageSrcSchema = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(2000, 'That image address is too long'),
  v.check(isSafeImageSrc, 'An image must be an https address or a path on this site'),
)

const MarkSchema: v.GenericSchema<RichTextMark> = v.variant('type', [
  v.object({ type: v.literal('link'), attrs: v.object({ href: HrefSchema }) }),
  v.object({ type: v.picklist(['bold', 'italic', 'strike', 'underline', 'code'] as const) }),
]) as v.GenericSchema<RichTextMark>

/**
 * `v.lazy` breaks the cycle: a paragraph holds nodes, and a node may be a
 * paragraph. The annotation is explicit because TypeScript cannot infer a
 * recursive schema on its own.
 */
const NodeSchema: v.GenericSchema<RichTextNode> = v.lazy(() =>
  v.variant('type', [
    v.object({
      type: v.literal('text'),
      // A single text node longer than this is a paste accident, not writing.
      text: v.pipe(v.string(), v.maxLength(20_000)),
      marks: v.optional(v.pipe(v.array(MarkSchema), v.maxLength(8))),
    }),
    v.object({ type: v.literal('hardBreak') }),
    v.object({ type: v.literal('horizontalRule') }),
    v.object({ type: v.literal('paragraph'), content: v.optional(ChildrenSchema) }),
    v.object({
      type: v.literal('heading'),
      // The page's own <h1> is the title, so an article starts at level 2.
      attrs: v.object({ level: v.picklist([2, 3, 4] as const) }),
      content: v.optional(ChildrenSchema),
    }),
    v.object({ type: v.literal('blockquote'), content: v.optional(ChildrenSchema) }),
    v.object({ type: v.literal('bulletList'), content: v.optional(ChildrenSchema) }),
    v.object({
      type: v.literal('orderedList'),
      attrs: v.object({ start: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(9999)) }),
      content: v.optional(ChildrenSchema),
    }),
    v.object({ type: v.literal('listItem'), content: v.optional(ChildrenSchema) }),
    v.object({
      type: v.literal('codeBlock'),
      attrs: v.object({
        language: v.nullish(v.pipe(v.string(), v.maxLength(40)), null),
      }),
      content: v.optional(ChildrenSchema),
    }),
    v.object({
      type: v.literal('image'),
      attrs: v.object({
        src: ImageSrcSchema,
        // The editor writes `null` for an image with no alt text, so this
        // has to accept null as well as a missing key.
        alt: v.nullish(v.pipe(v.string(), v.maxLength(500)), ''),
        width: v.nullish(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000)), null),
        height: v.nullish(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000)), null),
      }),
    }),
  ]),
) as v.GenericSchema<RichTextNode>

/** A cap on breadth; the recursion itself is bounded by the document size. */
const ChildrenSchema: v.GenericSchema<RichTextNode[]> = v.lazy(() =>
  v.pipe(v.array(NodeSchema), v.maxLength(2000)),
) as v.GenericSchema<RichTextNode[]>

export const RichTextDocSchema: v.GenericSchema<RichTextDoc> = v.object({
  type: v.literal('doc'),
  content: v.pipe(v.array(NodeSchema), v.maxLength(2000, 'That article is too long')),
}) as v.GenericSchema<RichTextDoc>

/** Every word in the document, flattened. Used for reading time and excerpts. */
export const richTextToPlainText = (doc: RichTextDoc): string => {
  const parts: string[] = []

  const walk = (nodes: RichTextNode[]) => {
    for (const node of nodes) {
      if (node.type === 'text') {
        parts.push(node.text)
        continue
      }

      if ('content' in node && node.content) {
        walk(node.content)
        // Blocks are separate sentences, not one run-on line.
        parts.push(' ')
      }
    }
  }

  walk(doc.content)

  return parts.join('').replace(/\s+/g, ' ').trim()
}

/**
 * The same document as a **letter**: paragraphs kept apart, line breaks kept.
 *
 * `richTextToPlainText` above is for reading time and excerpts, so it collapses
 * every space into one and returns a single line. Sending a reply through it
 * turned "Sehr geehrter Herr Ware / hiermit sende ich…" into
 * "Sehr geehrter Herr Warehiermit sende ich…" — the plain-text part of the mail
 * and the copy stored in the inbox were both unreadable, and neither matched
 * what was actually typed.
 */
export const richTextToLetter = (doc: RichTextDoc): string => {
  const block = (nodes: RichTextNode[]): string => {
    let text = ''

    for (const node of nodes) {
      if (node.type === 'text') {
        text += node.text
        continue
      }

      // Shift+Enter. It carries no content, so anything that only walks
      // children drops it and glues the two lines together.
      if (node.type === 'hardBreak') {
        text += '\n'
        continue
      }

      if ('content' in node && node.content) text += block(node.content)
    }

    return text
  }

  return doc.content
    .map((node) => ('content' in node && node.content ? block(node.content) : ''))
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** True once the writer has put something other than empty blocks in it. */
export const isRichTextEmpty = (doc: RichTextDoc): boolean => richTextToPlainText(doc) === ''

/**
 * 200 words a minute, rounded up, never less than one. Arabic and German run
 * at different speeds, but a reading estimate is a courtesy, not a promise.
 */
export const readingMinutes = (doc: RichTextDoc): number => {
  const words = richTextToPlainText(doc).split(' ').filter(Boolean).length

  return Math.max(1, Math.ceil(words / 200))
}
