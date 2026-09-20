import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Hiding a field by pushing it off the side of the page widens the document by
 * however far it was pushed. In an RTL document the page then opens scrolled
 * onto that empty strip, and the visitor sees a blank screen — which is what
 * the Arabic contact page did on a phone until the honeypots were clipped
 * instead. Nothing under `src/frontend` may hide anything that way again.
 */
const FRONTEND = join(process.cwd(), 'src/frontend')
const OFFSCREEN = /-?\[?-\d{3,}px\]?/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(tsx?|css)$/.test(entry.name) ? [path] : []
  })
}

describe('nothing is hidden off the side of the page', () => {
  it('has no large negative offsets under src/frontend', () => {
    const offenders = sourceFiles(FRONTEND).flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          OFFSCREEN.test(line) ? [`${path}:${index + 1} ${line.trim()}`] : [],
        ),
    )

    expect(offenders).toEqual([])
  })
})
