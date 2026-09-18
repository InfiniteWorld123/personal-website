import { Elysia } from 'elysia'
import { getTrustedClientIp } from '#/backend/shared/client-ip'
import { responseOk } from '#/backend/shared/response'
import { parseInput } from '#/backend/shared/validate'
import { ChatAskSchema, ChatLanguageSchema } from '#/shared/validation/chat.validation'
import { ask, getIntro } from './chat.service'

/**
 * The assistant's two public endpoints (D34).
 *
 * Public in full and deliberately so: there is nothing here an admin session
 * would unlock, because the assistant only ever repeats what the site already
 * publishes. The ceilings in the service are what stands in for a login.
 */
export const publicChatRoutes = new Elysia({ prefix: '/chat' })
  /**
   * What to render before anyone types. A `GET`, and the only cacheable thing
   * in this module — it is the same answer for every visitor in a language.
   */
  .get('/intro/:language', ({ params }) =>
    responseOk({
      data: getIntro(parseInput(ChatLanguageSchema, params.language)),
      message: 'Assistant ready',
    }),
  )
  .post('/ask', async ({ body, request }) =>
    responseOk({
      data: await ask(parseInput(ChatAskSchema, body), {
        // Absent outside a Worker on purpose: the helper refuses to trust a
        // forwarding header a visitor could write. The per-conversation
        // ceiling still applies, so the endpoint is never unguarded.
        clientIp: getTrustedClientIp(request),
      }),
      message: 'Answered',
    }),
  )
