import { Play } from 'lucide-react'
import type { PublicBlogDoc, PublicBlogNode, YoutubeNode } from '#/backend2/contracts/blog.contract'
import type { PublicRichTextNode } from '#/backend2/contracts/project.contract'
import { CaseStudyView } from '#/frontend/features/projects/CaseStudyView'

/**
 * An article body, drawn for the owner's preview.
 *
 * Everything but a video is the case study's renderer — the same nodes, the
 * same safety: React elements for the node types the contract names and
 * nothing else, no HTML string anywhere. A video is a placeholder here and
 * never a player: the Dashboard does not contact YouTube, and on the public
 * site a video loads only after the visitor presses play (the owner's answer
 * 1A). The link opens the video on YouTube in a new tab, for checking it is
 * the right one.
 */

function VideoPlaceholder({ video }: { video: YoutubeNode }) {
  const title = video.attrs.title.trim()

  return (
    <figure className="my-6 overflow-hidden rounded-[12px] border border-[var(--dash-line)]">
      <div className="relative grid aspect-video place-items-center bg-[var(--dash-slab)] text-[var(--dash-slab-ink)]">
        <span className="flex flex-col items-center gap-2 px-4 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-[#ff0033] text-white" aria-hidden="true">
            <Play className="size-5 fill-current" />
          </span>
          <span className="text-[14px] font-semibold">{title || 'YouTube video'}</span>
          <span className="text-[11.5px] text-[var(--dash-slab-quiet)]">
            Visitors see this placeholder; the player loads from YouTube only after they press play.
          </span>
        </span>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11.5px] text-[var(--dash-quiet)]">
        <span>{title ? 'Title for screen readers is set' : 'No title for screen readers in this language'}</span>
        <a
          href={`https://www.youtube.com/watch?v=${video.attrs.videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="dash-num text-[var(--dash-brand)] underline-offset-2 hover:underline"
        >
          Check it on YouTube
        </a>
      </figcaption>
    </figure>
  )
}

/** Runs of ordinary nodes between the videos, so each run is one case-study rendering. */
const split = (nodes: PublicBlogNode[]): Array<PublicRichTextNode[] | YoutubeNode> => {
  const parts: Array<PublicRichTextNode[] | YoutubeNode> = []

  for (const node of nodes) {
    if (node.type === 'youtube') {
      parts.push(node)

      continue
    }

    const last = parts[parts.length - 1]

    if (Array.isArray(last)) last.push(node)
    else parts.push([node])
  }

  return parts
}

export function BlogBodyView({ doc }: { doc: PublicBlogDoc }) {
  return (
    <div className="text-[15.5px] leading-[1.75]">
      {split(doc.content).map((part, index) =>
        Array.isArray(part) ? (
          <CaseStudyView key={index} doc={{ type: 'doc', content: part }} />
        ) : (
          <VideoPlaceholder key={index} video={part} />
        ),
      )}
    </div>
  )
}
