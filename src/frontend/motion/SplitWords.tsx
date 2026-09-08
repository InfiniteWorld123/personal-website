import { Fragment } from 'react'
import type { CSSProperties } from 'react'

/**
 * Splits a heading into words, each in its own overflow mask, so the line can
 * rise word by word. Splitting stops at word boundaries: Arabic letters stay
 * joined inside their word and keep their shaping.
 *
 * The separating space is a text node *between* the masks, never inside one:
 * trailing whitespace collapses at the end of an inline block, which would
 * run every word into the next.
 */
export function SplitWords({ text }: { text: string }) {
  const words = text.trim().split(/\s+/)

  return (
    <>
      {words.map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          {index > 0 ? ' ' : null}
          <span className="split-word" style={{ '--word-i': index } as CSSProperties}>
            <span className="split-word-inner">{word}</span>
          </span>
        </Fragment>
      ))}
    </>
  )
}
