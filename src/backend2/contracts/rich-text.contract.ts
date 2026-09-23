import * as v from 'valibot'

/**
 * The case-study document. See `docs/v2/projects-backend.md` §5.4.
 *
 * A separate file from `src/shared/validation/rich-text.ts` rather than an
 * import, for two reasons that both matter. V2 adds tables and changes how an
 * image is referenced, and legacy articles have to keep parsing with the
 * legacy schema — one shared file would force both to move at once. And
 * `src/backend2/` imports nothing from the rest of the tree, so the legacy
 * backend can be deleted at cutover without taking V2 with it.
 *
 * Pure: valibot and plain TypeScript. The Dashboard imports exactly this, so
 * the editor refuses what the server would refuse.
 *
 * The document is stored as a validated tree, never as HTML. A node type this
 * file does not name never reaches the page, so there is no markup to
 * sanitise — which is the only workable answer on Cloudflare Workers, where
 * the DOM-based sanitisers cannot run.
 */

export const RICH_TEXT_MARKS = ['bold', 'italic', 'underline', 'strike', 'code', 'link'] as const

export type RichTextMarkType = (typeof RICH_TEXT_MARKS)[number]

export type RichTextMark =
  | { type: Exclude<RichTextMarkType, 'link'> }
  | { type: 'link'; attrs: { href: string } }

/**
 * An inline image, by library id.
 *
 * `mediaId`, never a URL and never a storage key. The server resolves it to a
 * served address when it builds a response, and refuses an id the Media
 * library does not hold. That is what makes the image accounting provable:
 * every file a project uses is discoverable from the database alone, so
 * `replaceReferences` can state the complete set on every save.
 *
 * `alt` lives on the node rather than in a side table because an inline image
 * already sits inside one language's document — the German case study and the
 * Arabic one are different trees, and the same photograph needs a different
 * sentence in each.
 */
export type RichTextImageAttrs = {
  mediaId: string
  alt: string
  width: number | null
  height: number | null
}

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
  | { type: 'image'; attrs: RichTextImageAttrs }
  | { type: 'table'; content?: RichTextNode[] }
  | { type: 'tableRow'; content?: RichTextNode[] }
  | { type: 'tableHeader'; attrs: TableCellAttrs; content?: RichTextNode[] }
  | { type: 'tableCell'; attrs: TableCellAttrs; content?: RichTextNode[] }

export type TableCellAttrs = { colspan: number; rowspan: number }

export type RichTextDoc = { type: 'doc'; content: RichTextNode[] }

export const emptyRichTextDoc = (): RichTextDoc => ({ type: 'doc', content: [] })

/**
 * A link the browser may follow.
 *
 * A protocol allowlist rather than a URL check, because `javascript:` and
 * `data:` both parse as perfectly valid URLs. A path starting with `/` stays
 * allowed so a case study can link to another page on this site — but not
 * `//evil.example`, which is off-site, and not `/\evil.example`, which
 * browsers normalise to the same thing.
 */
const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:']

export const isSafeHref = (value: string): boolean => {
  const href = value.trim()

  if (href === '') return false
  if (/^\/(?![/\\])/.test(href)) return true

  try {
    return SAFE_PROTOCOLS.includes(new URL(href).protocol)
  } catch {
    return false
  }
}

/** Every text node in the document has to fit inside this many characters. */
export const CASE_STUDY_MAX_CHARACTERS = 60_000

const HrefSchema = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(2000, 'That link is too long'),
  v.check(isSafeHref, 'A link must be http(s), mailto, or a path on this site'),
)

const MediaIdSchema = v.pipe(
  v.string('An image must carry a media id'),
  v.trim(),
  v.uuid('That is not a file from the Media library'),
)

const SpanSchema = v.nullish(
  v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)),
  1,
) as v.GenericSchema<number | null | undefined, number>

const MarkSchema: v.GenericSchema<RichTextMark> = v.variant('type', [
  v.object({ type: v.literal('link'), attrs: v.object({ href: HrefSchema }) }),
  v.object({ type: v.picklist(['bold', 'italic', 'underline', 'strike', 'code'] as const) }),
]) as v.GenericSchema<RichTextMark>

const TableCellAttrsSchema = v.object({ colspan: SpanSchema, rowspan: SpanSchema })

/**
 * `v.lazy` breaks the cycle: a paragraph holds nodes, and a node may be a
 * paragraph. The annotation is explicit because TypeScript cannot infer a
 * recursive schema on its own.
 */
const NodeSchema: v.GenericSchema<RichTextNode> = v.lazy(() =>
  v.variant('type', [
    v.object({
      type: v.literal('text'),
      // One text node longer than this is a paste accident, not writing.
      text: v.pipe(v.string(), v.maxLength(20_000)),
      marks: v.optional(v.pipe(v.array(MarkSchema), v.maxLength(8))),
    }),
    v.object({ type: v.literal('hardBreak') }),
    v.object({ type: v.literal('horizontalRule') }),
    v.object({ type: v.literal('paragraph'), content: v.optional(ChildrenSchema) }),
    v.object({
      // The public page's own <h1> is the project name, so a case study
      // starts at level 2.
      type: v.literal('heading'),
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
      attrs: v.object({ language: v.nullish(v.pipe(v.string(), v.maxLength(40)), null) }),
      content: v.optional(ChildrenSchema),
    }),
    v.object({
      type: v.literal('image'),
      attrs: v.object({
        mediaId: MediaIdSchema,
        // The editor writes `null` for an image with no alt text yet, so this
        // accepts null as well as a missing key. Publication is where an
        // empty one becomes a blocker, not the draft save.
        alt: v.nullish(v.pipe(v.string(), v.maxLength(500)), ''),
        width: v.nullish(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000)), null),
        height: v.nullish(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000)), null),
      }),
    }),
    v.object({ type: v.literal('table'), content: v.optional(ChildrenSchema) }),
    v.object({ type: v.literal('tableRow'), content: v.optional(ChildrenSchema) }),
    v.object({
      type: v.literal('tableHeader'),
      attrs: TableCellAttrsSchema,
      content: v.optional(ChildrenSchema),
    }),
    v.object({
      type: v.literal('tableCell'),
      attrs: TableCellAttrsSchema,
      content: v.optional(ChildrenSchema),
    }),
  ]),
) as v.GenericSchema<RichTextNode>

/** A cap on breadth; the recursion itself is bounded by the document size. */
const ChildrenSchema: v.GenericSchema<RichTextNode[]> = v.lazy(() =>
  v.pipe(v.array(NodeSchema), v.maxLength(2000)),
) as v.GenericSchema<RichTextNode[]>

/**
 * One node, with every rule above.
 *
 * Exported so another module's document can reuse the same nodes and add its
 * own capabilities around them — the Blog allows a YouTube embed at the top of
 * an article, which a case study does not. The case study's own schema below
 * is unchanged by that.
 */
export const RichTextNodeSchema: v.GenericSchema<RichTextNode> = NodeSchema

export const RichTextDocSchema: v.GenericSchema<RichTextDoc> = v.pipe(
  v.object({
    type: v.literal('doc'),
    content: v.pipe(v.array(NodeSchema), v.maxLength(2000, 'That case study is too long')),
  }),
  v.check(
    (doc) => richTextToPlainText(doc as RichTextDoc).length <= CASE_STUDY_MAX_CHARACTERS,
    `A case study may hold at most ${CASE_STUDY_MAX_CHARACTERS} characters`,
  ),
) as v.GenericSchema<RichTextDoc>

/* ------------------------------------------------------------------ walking */

/** Every node in the tree, depth first. The one traversal the rest reuses. */
export const walkRichText = (doc: RichTextDoc, visit: (node: RichTextNode) => void): void => {
  const walk = (nodes: RichTextNode[]) => {
    for (const node of nodes) {
      visit(node)

      if ('content' in node && node.content) walk(node.content)
    }
  }

  walk(doc.content)
}

/**
 * Every library file the document uses, in the order it uses them, without
 * repeats.
 *
 * This is what makes `docs/v2/projects-backend.md` §7.5 step 5 possible: the
 * `inline` image rows are recomputed from the documents on every save, so the
 * set of files a version references is always exactly the set it uses.
 */
export const collectMediaIds = (doc: RichTextDoc | null): string[] => {
  if (!doc) return []

  const ids: string[] = []
  const seen = new Set<string>()

  walkRichText(doc, (node) => {
    if (node.type !== 'image') return
    if (seen.has(node.attrs.mediaId)) return

    seen.add(node.attrs.mediaId)
    ids.push(node.attrs.mediaId)
  })

  return ids
}

/** Every inline image, in document order, so a blocker can name "image 2". */
export const collectImageNodes = (
  doc: RichTextDoc | null,
): Array<{ mediaId: string; alt: string }> => {
  if (!doc) return []

  const images: Array<{ mediaId: string; alt: string }> = []

  walkRichText(doc, (node) => {
    if (node.type === 'image') images.push({ mediaId: node.attrs.mediaId, alt: node.attrs.alt })
  })

  return images
}

/** Every word in the document, flattened. Used for the length limit. */
export const richTextToPlainText = (doc: RichTextDoc): string => {
  const parts: string[] = []

  walkRichText(doc, (node) => {
    if (node.type === 'text') parts.push(node.text)
    else if ('content' in node) parts.push(' ')
  })

  return parts.join('').replace(/\s+/g, ' ').trim()
}

/** True once the owner has put something other than empty blocks in it. */
export const isRichTextEmpty = (doc: RichTextDoc | null): boolean =>
  !doc || richTextToPlainText(doc) === ''
