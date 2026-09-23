import { Elysia } from 'elysia'
import { requestIdentity } from '../../auth/rate-limit'
import { AskSchema, StatusQuerySchema } from '../../contracts/assistant.contract'
import { readLimited } from '../../http/body'
import { badRequest } from '../../http/error'
import { responseOk } from '../../http/response'
import { HttpStatus } from '../../http/status'
import { parseInput } from '../../http/validate'
import { askAssistant, readStatus } from './assistant.service'

/**
 * The visitor's half of the assistant (`docs/v2/ai-assistant.md`).
 *
 * Mounted only where the V2 database is configured, like every other public
 * V2 route: production has no `DATABASE_URL_V2` yet, so none of this answers
 * there, and the live widget keeps the legacy chat until an approved cutover.
 * Even where it is mounted it answers nothing until the owner switches the
 * assistant on (off by default).
 *
 * Nothing here is cached: an answer belongs to one conversation, and the
 * status must reflect the owner's switch at once. `src/start.ts` already
 * refuses any `/api` write whose `Origin` is not this site.
 */

const NO_STORE = 'no-store'

const publicJson = <T>(data: T, message: string): Response =>
  new Response(JSON.stringify(responseOk({ data, message })), {
    status: HttpStatus.OK,
    headers: {
      'content-type': 'application/json',
      'cache-control': NO_STORE,
      'x-content-type-options': 'nosniff',
    },
  })

/** A question is at most 1000 characters; its request has no reason to be larger. */
const MAX_ASK_BODY_BYTES = 8 * 1024

const readAskBody = async (request: Request): Promise<unknown> => {
  const bytes = await readLimited(request, MAX_ASK_BODY_BYTES)

  if (bytes.byteLength === 0) return {}

  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw badRequest('The request body is not valid JSON')
  }
}

export const publicAssistantRoutes = new Elysia({ prefix: '/assistant' })
  /**
   * Whether the widget should offer the assistant, which mode answers, and
   * the notice the visitor must see first: a machine answers, and the
   * conversation may be saved, with the privacy link.
   */
  .get('/status', async ({ query }) => {
    const { language } = parseInput(StatusQuerySchema, query)

    return publicJson(await readStatus(language), 'Assistant status')
  })

  /** One question. The answer follows the question's language, not the page's. */
  .post('/ask', async ({ request }) => {
    const ask = parseInput(AskSchema, await readAskBody(request))

    return publicJson(await askAssistant({ ask, identity: requestIdentity(request) }), 'Answered')
  })
