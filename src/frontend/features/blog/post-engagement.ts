import { useEffect, useRef, useState } from 'react'
import { countRead, setLike } from './blog-v2-api'

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
/**
 * Backend2's counters started from zero (`docs/v2/public-cutover.md` step 4:
 * the old site's counts were not copied), so its memory has its own keys: a
 * like remembered from the old site's article would show "Liked" beside a
 * count that never included it.
 */
const KEYS = { read: 'blog:v2:read', liked: 'blog:v2:liked' } as const

type Counts = { viewCount: number; likeCount: number }

/** Where a read and a like go, answered in the page's own shape. */
const SERVER = {
  read: async (slug: string): Promise<Counts> => {
    const counts = await countRead(slug)

    return { viewCount: counts.readCount, likeCount: counts.likeCount }
  },
  like: async (slug: string, liked: boolean): Promise<Counts> => {
    const counts = await setLike(slug, liked)

    return { viewCount: counts.readCount, likeCount: counts.likeCount }
  },
} as const

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
  const keys = KEYS
  const server = SERVER
  const [counts, setCounts] = useState(initial)
  const [liked, setLiked] = useState(false)
  const [pending, setPending] = useState(false)
  // Strict mode mounts twice in development, and a read is not a thing that
  // happened twice because React rendered twice.
  const counted = useRef<string | null>(null)

  useEffect(() => {
    setCounts(initial)
    setLiked(readSet(keys.liked).has(slug))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  useEffect(() => {
    if (counted.current === slug) return
    counted.current = slug

    const already = readSet(keys.read)

    if (already.has(slug)) return

    void server
      .read(slug)
      .then((next) => {
        already.add(slug)
        writeSet(keys.read, already)
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

    void server
      .like(slug, next)
      .then((answer) => {
        setCounts(answer)

        const remembered = readSet(keys.liked)

        if (next) remembered.add(slug)
        else remembered.delete(slug)

        writeSet(keys.liked, remembered)
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
