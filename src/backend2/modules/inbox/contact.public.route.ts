import { Elysia } from 'elysia'
import { requestIdentity } from '../../auth/rate-limit'
import type { PublicContactResponse } from '../../contracts/contact.contract'
import { HttpStatus } from '../../http/status'
import { ownerJson } from '../media/media.http'
import { readContactRequest, submitContact } from './contact.service'

/**
 * `POST /api/v2/public/contact` — the website's Contact form, V2.
 *
 * A visitor route: no account, multipart so one file can travel with the
 * message. The answer is the same `{ received: true }` for a new submission,
 * a repeat of one, and a bot caught by the honeypot — no id, nothing private,
 * and `no-store` so no cache keeps it.
 *
 * This route answers only where a V2 database is configured.
 */

const received = (): Response =>
  ownerJson<PublicContactResponse>({
    data: { received: true },
    message: 'Message received',
    status: HttpStatus.CREATED,
  })

export const publicContactRoutes = new Elysia({ prefix: '/public' }).post(
  '/contact',
  async ({ request }) => {
    const submission = await readContactRequest(request)

    if (submission.kind === 'submission') {
      await submitContact({ input: submission.input, file: submission.file, ip: requestIdentity(request) })
    }

    return received()
  },
  // The body is read here, under its own ceiling — never by the framework first.
  { parse: 'none' },
)
