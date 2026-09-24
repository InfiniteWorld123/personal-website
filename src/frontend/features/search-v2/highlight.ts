/**
 * Where the typed words sit inside a title, as plain pieces of text.
 *
 * No regular expression and no HTML: the pieces are rendered by React as
 * text, with a `<mark>` element around the matched ones, so a title such as
 * `<b>Probe</b>` stays those exact characters on the screen. Matching is
 * case-insensitive like the server's, and every occurrence is marked.
 */
export type HighlightPiece = { text: string; match: boolean }

export const highlightPieces = (text: string, query: string): HighlightPiece[] => {
  const needle = query.trim().toLocaleLowerCase()

  if (needle === '' || text === '') return text === '' ? [] : [{ text, match: false }]

  const haystack = text.toLocaleLowerCase()

  // Lower-casing can change a string's length (for example `İ`); marking by
  // position would then cut through the wrong characters, so do not mark.
  if (haystack.length !== text.length) return [{ text, match: false }]

  const pieces: HighlightPiece[] = []
  let from = 0

  while (from < text.length) {
    const at = haystack.indexOf(needle, from)

    if (at === -1) break

    if (at > from) pieces.push({ text: text.slice(from, at), match: false })

    pieces.push({ text: text.slice(at, at + needle.length), match: true })
    from = at + needle.length
  }

  if (from < text.length) pieces.push({ text: text.slice(from), match: false })

  return pieces
}
