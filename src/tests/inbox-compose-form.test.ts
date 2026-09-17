import { Elysia } from 'elysia'
import { describe, expect, it, vi } from 'vitest'

vi.mock('#/shared/env', () => ({
  env: { BASE_URL: 'https://yamanwarda.de', APP_NAME: 'Yaman Warda' },
}))

import { readComposeForm } from '#/backend/modules/inbox/inbox.route'

/**
 * The compose route on Cloudflare.
 *
 * `new Function` is forbidden on a Worker, so Elysia runs there without AOT
 * and parses every body itself before the handler is called. On the Node dev
 * server AOT is on, and a handler that never mentions `body` is handed the
 * untouched request. The same route therefore behaved differently on the two
 * — "That message could not be read" on the live site, 201 locally — and no
 * test caught it because every test ran on Node.
 *
 * These run Elysia the way the Worker runs it, `aot: false`, and post the
 * exact multipart the compose page sends.
 */
const letter = () => {
  const body = new FormData()

  body.append('message', JSON.stringify({ to: 'a@b.de', subject: 'Hi', body: 'Text' }))
  body.append('file', new File([new Uint8Array([1, 2, 3])], 'Angebot.pdf', { type: 'application/pdf' }))
  body.append('file', new File([new Uint8Array([4])], 'Foto.png', { type: 'image/png' }))

  return new Request('http://localhost/compose', { method: 'POST', body })
}

describe('reading the compose form the way the Worker hands it over', () => {
  it('is handed a parsed body, with the message already an object and both files', async () => {
    const seen: unknown[] = []
    const app = new Elysia({ aot: false }).post('/compose', ({ body }) => {
      seen.push(readComposeForm(body))

      return 'ok'
    })

    await app.handle(letter())

    expect(seen).toHaveLength(1)

    const { message, files } = seen[0] as { message: unknown; files: File[] }

    expect(message).toEqual({ to: 'a@b.de', subject: 'Hi', body: 'Text' })
    expect(files.map((file) => file.name)).toEqual(['Angebot.pdf', 'Foto.png'])
  })

  /** The fault itself, kept so nobody reaches for `request.formData()` again. */
  it('has already consumed the request by the time a handler runs', async () => {
    let failure: string | null = null
    const app = new Elysia({ aot: false }).post('/compose', async ({ request }) => {
      await request.formData().catch((error: Error) => {
        failure = error.name
      })

      return 'ok'
    })

    await app.handle(letter())

    expect(failure).toBe('TypeError')
  })
})

describe('the shapes Elysia produces', () => {
  it('accepts a single file bare, not only as an array', () => {
    const file = new File(['x'], 'one.pdf', { type: 'application/pdf' })

    expect(readComposeForm({ message: { to: 'a@b.de' }, file }).files).toEqual([file])
  })

  it('accepts the message as a string when Elysia did not parse it', () => {
    expect(readComposeForm({ message: '{"to":"a@b.de"}' }).message).toEqual({ to: 'a@b.de' })
  })

  it('refuses a body with no message in it', () => {
    expect(() => readComposeForm({ file: [] })).toThrow('could not be read')
    expect(() => readComposeForm({ message: '{not json' })).toThrow('could not be read')
  })
})
