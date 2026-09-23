import {
  BLOG_LIMITS,
  type BlogDoc,
  type BlogNode,
  YOUTUBE_VIDEO_ID,
  type YoutubeNode,
} from '#/backend2/contracts/blog.contract'
import type { RichTextNode } from '#/backend2/contracts/rich-text.contract'
import { normalizeDoc } from '#/frontend/features/projects/case-study-document'

/**
 * The article editor's JSON into the body the server will accept.
 *
 * A module of its own, free of TipTap, for the reason the case study's is:
 * it is the part with rules in it, and rules are tested directly. Every node
 * but a video goes through the case study's normaliser — a heading is a
 * heading in both — and a video is rebuilt from its id and nothing else, only
 * at the top of the document, because that is the one place the contract
 * allows one.
 *
 * The result must equal what the server stores, key for key, or the editor
 * would claim unsaved changes straight after a save. That is why a video's
 * title is trimmed here (the server trims it) and why the trailing empty
 * paragraph the editor keeps after a picture, for the cursor, is dropped.
 */

const toVideo = (attrs: Record<string, unknown> | undefined): YoutubeNode | null => {
  const videoId = typeof attrs?.videoId === 'string' ? attrs.videoId.trim() : ''

  if (!YOUTUBE_VIDEO_ID.test(videoId)) return null

  const start = Number(attrs?.start)
  const title = typeof attrs?.title === 'string' ? attrs.title.trim().slice(0, BLOG_LIMITS.videoTitle) : ''

  return {
    type: 'youtube',
    attrs: {
      videoId,
      start:
        attrs?.start !== null && attrs?.start !== undefined && Number.isInteger(start) && start >= 0 && start <= BLOG_LIMITS.videoStartSeconds
          ? start
          : null,
      title,
    },
  }
}

const size = (value: number | null): number | null => (value !== null && value >= 1 && value <= 10_000 ? value : null)

/**
 * An image's size is a positive whole number or unknown. The case study's
 * normaliser reads a missing size as `Number(null)`, which is 0, and the
 * server refuses 0 — so a picture without recorded dimensions could never be
 * saved. Unknown is `null` here.
 */
const withSizes = (node: RichTextNode): RichTextNode => {
  if (node.type === 'image') {
    return { ...node, attrs: { ...node.attrs, width: size(node.attrs.width), height: size(node.attrs.height) } }
  }

  if ('content' in node && Array.isArray(node.content)) {
    return { ...node, content: node.content.map(withSizes) } as RichTextNode
  }

  return node
}

const isEmptyParagraph = (node: BlogNode): boolean =>
  node.type === 'paragraph' && (node.content === undefined || node.content.length === 0)

export const normalizeBlogDoc = (json: unknown): BlogDoc => {
  const source = json as { content?: unknown[] } | null
  const content: BlogNode[] = []

  for (const node of source?.content ?? []) {
    const entry = node as { type?: unknown; attrs?: Record<string, unknown> } | null

    if (entry?.type === 'youtube') {
      const video = toVideo(entry.attrs)

      if (video) content.push(video)

      continue
    }

    const [normalized] = normalizeDoc({ content: [node] }).content

    if (normalized) content.push(withSizes(normalized))
  }

  while (content.length > 0 && isEmptyParagraph(content[content.length - 1]!)) content.pop()

  return { type: 'doc', content }
}

/** What the editor footer counts: words, the way the reading time counts them. */
export const countWords = (text: string): number => text.split(/\s+/).filter(Boolean).length
