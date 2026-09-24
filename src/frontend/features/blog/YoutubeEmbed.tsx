import { Play } from 'lucide-react'
import { useId, useState } from 'react'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { blogV2Words } from './blog-v2-words'

/** The only shape a stored video id has (`YOUTUBE_VIDEO_ID` in the Blog contract). */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/**
 * A YouTube video that loads only when the reader asks for it (owner's
 * answer 1A, `docs/v2/blog.md`).
 *
 * Until the button is pressed the page shows a drawn placeholder and nothing
 * is requested from Google — no thumbnail, no script, no frame. The player is
 * built from the stored eleven-character id alone, on the privacy-enhanced
 * `youtube-nocookie.com` host; the notice under the title says what pressing
 * play sends to YouTube.
 */
export function YoutubeEmbed({
  videoId,
  start,
  title,
}: {
  videoId: string
  start: number | null
  title: string
}) {
  const { language } = useLanguage()
  const words = blogV2Words(language)
  const [playing, setPlaying] = useState(false)
  const noteId = useId()
  const name = title.trim() || 'YouTube'

  // The server already refuses anything else; a renderer does not trust that.
  if (!VIDEO_ID.test(videoId)) return null

  if (playing) {
    const query = new URLSearchParams({ autoplay: '1', rel: '0' })

    if (start && start > 0) query.set('start', String(Math.floor(start)))

    return (
      <div className="yt-player">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?${query.toString()}`}
          title={name}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      className="yt"
      onClick={() => setPlaying(true)}
      aria-label={`${words.videoPlay}: ${name}`}
      // The label names the act; the notice is what pressing it sends to Google.
      aria-describedby={noteId}
    >
      <span className="yt-play" aria-hidden="true">
        <Play className="size-[26px] fill-current" />
      </span>
      {title.trim() ? <span className="yt-title">{title}</span> : null}
      <span id={noteId} className="yt-note">
        {words.videoNote}
      </span>
    </button>
  )
}
