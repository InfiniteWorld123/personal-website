import { useEffect, useRef, useState } from 'react'
import { countPostRead, likePost, unlikePost } from '#/frontend/api/post.api'

/**
 * What this browser has already done, kept in this browser.
 *
 * The server stores two integers per article and nothing else — no visitor id,
 * no cookie, no address. That is the privacy design (see
 * `0019_post_engagement.sql`), and its consequence is that the server cannot
 * know whether *you* have read this before. Only your own browser can, so
 * that is where it is remembered.
 *
 * What it costs: clear your storage and you are counted again. That is the
 * trade, taken deliberately — the alternative is keeping something that
 * identifies a reader, which is the thing this was built not to do.
 */
const READ_KEY = 'blog:read'
const LIKED_KEY = 'blog:liked'

/**
 * Every read and write is guarded.
 *
 * `localStorage` throws rather than returns null in a private window with site
 * data blocked, and the page must still render and still count. A reader whose
 * storage is unavailable is simply counted each visit.
 */
const readSet = (key: string): Set<string> => {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : []

    return new Set(Array.isArray(parsed) ? parsed.filter((slug) => typeof slug === 'string') : [])
  } catch {
    return new Set()
  }
}

const writeSet = (key: string, slugs: Set<string>): void => {
  try {
    // Bounded, so a reader who works through the whole archive over a year
    // does not grow an unbounded string in their own browser.
    window.localStorage.setItem(key, JSON.stringify([...slugs].slice(-500)))
  } catch {
    // Nothing to do and nothing to say: the count still happened on the server.
  }
}

export type Engagement = { viewCount: number; likeCount: number; liked: boolean }

/**
 * The reads and likes of one article, and the one thing a reader can change.
 *
 * Counts the read once per browser, on mount. Exposes `toggleLike`, which
 * updates the figure on screen straight away and puts back whatever the server
 * says a moment later — so two readers liking at the same time both end up
 * seeing the real total rather than their own guess.
 */
export const usePostEngagement = (
  slug: string,
  initial: { viewCount: number; likeCount: number },
): Engagement & { toggleLike: () => void; pending: boolean } => {
  const [counts, setCounts] = useState(initial)
  const [liked, setLiked] = useState(false)
  const [pending, setPending] = useState(false)
  // Strict mode mounts twice in development, and a read is not a thing that
  // happened twice because React rendered twice.
  const counted = useRef<string | null>(null)

  useEffect(() => {
    setCounts(initial)
    setLiked(readSet(LIKED_KEY).has(slug))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  useEffect(() => {
    if (counted.current === slug) return
    counted.current = slug

    const already = readSet(READ_KEY)

    if (already.has(slug)) return

    void countPostRead(slug)
      .then((next) => {
        already.add(slug)
        writeSet(READ_KEY, already)
        setCounts(next)
      })
      // A read that could not be counted is not worth telling anyone about.
      .catch(() => {})
  }, [slug])

  const toggleLike = () => {
    if (pending) return

    const next = !liked

    setPending(true)
    setLiked(next)
    setCounts((current) => ({
      ...current,
      likeCount: Math.max(current.likeCount + (next ? 1 : -1), 0),
    }))

    void (next ? likePost(slug) : unlikePost(slug))
      .then((server) => {
        setCounts(server)

        const remembered = readSet(LIKED_KEY)

        if (next) remembered.add(slug)
        else remembered.delete(slug)

        writeSet(LIKED_KEY, remembered)
      })
      .catch(() => {
        // Put the button and the figure back where they were. Saying nothing
        // would leave the reader believing something that did not happen.
        setLiked(!next)
        setCounts((current) => ({
          ...current,
          likeCount: Math.max(current.likeCount + (next ? -1 : 1), 0),
        }))
      })
      .finally(() => setPending(false))
  }

  return { ...counts, liked, toggleLike, pending }
}
