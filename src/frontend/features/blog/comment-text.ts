/**
 * The two comment rules the browser can check before sending: empty and too
 * long. Copied from the Blog contract (`normalizeCommentText`, `COMMENT_LIMITS`)
 * rather than imported, so the comment chunk does not carry the contract's
 * schemas and the validation library; `public-blog.test.ts` keeps the copy
 * equal to its source. The server checks both again, and everything else
 * (links, markup, copies, speed) only there.
 */

export const COMMENT_MAX_LENGTH = 3000

const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩﻿]/g

/** The text as the server will store it: the same normalising, character for character. */
export const normalizeComment = (raw: string): string =>
  raw
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export const commentLengthProblem = (raw: string): 'empty' | 'too_long' | null => {
  const text = normalizeComment(raw)

  if (text === '') return 'empty'
  if (text.length > COMMENT_MAX_LENGTH) return 'too_long'

  return null
}
