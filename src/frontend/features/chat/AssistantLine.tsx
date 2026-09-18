import { useEffect, useState } from 'react'

/**
 * An answer that arrives a few characters at a time (D34, the `reveal`
 * setting).
 *
 * The text is already complete when this mounts — nothing is streamed over the
 * wire. This is pacing, not transport: an answer that appears whole reads as a
 * lookup, and one that arrives in time reads as a reply. The owner chose it in
 * the prototype, and it is a setting because he may well choose otherwise
 * after living with it.
 *
 * With reduced motion requested, the whole answer is there immediately. Motion
 * here is decoration, and the site's rule is that decoration never gates
 * content.
 */
export function AssistantLine({ text }: { text: string }) {
  const [shown, setShown] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? text.length
      : 0,
  )

  useEffect(() => {
    if (shown >= text.length) return

    const timer = window.setInterval(() => {
      setShown((current) => {
        if (current >= text.length) {
          window.clearInterval(timer)

          return current
        }

        // Two at a time: one is slower than reading and looks broken on a long
        // answer, four is fast enough that nothing is gained by pacing at all.
        return current + 2
      })
    }, 14)

    return () => window.clearInterval(timer)
    // Intentionally not keyed on `shown`: the interval owns its own progress,
    // and re-creating it every tick is a new timer sixty times a second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  return (
    <>
      {/* Screen readers get the finished sentence once, rather than a
          character at a time from the live region above. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden>{text.slice(0, shown)}</span>
    </>
  )
}
