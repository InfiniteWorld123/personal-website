import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  ConversationListQuerySchema,
  SettingsPatchSchema,
  UsageQuerySchema,
} from '../../contracts/assistant.contract'
import { readJsonBody } from '../../http/body'
import { parseInput } from '../../http/validate'
import { ownerGuard } from '../../security/owner-guard'
import { ownerJson } from '../media/media.http'
import {
  deleteConversation,
  listConversations,
  readConversation,
  readSettings,
  readUsage,
  updateSettings,
} from './assistant.service'

/**
 * The owner's transcript viewer and the assistant's switches, over HTTP.
 *
 * A transcript-management surface, **not** a Dashboard AI assistant
 * (`AGENTS.md`). Thin: parse, delegate, respond, behind the owner fence, with
 * `no-store` on every reply. Off-local these routes answer 404 — the fence
 * never says a private API is there.
 */

const IdSchema = v.pipe(v.string(), v.uuid('That is not a valid id'))

export const ownerAssistantRoutes = new Elysia({ prefix: '/assistant' })
  .use(ownerGuard)

  /** One page of conversations, most recent activity first. */
  .get('/conversations', async ({ query }) =>
    ownerJson({
      data: await listConversations(parseInput(ConversationListQuerySchema, query)),
      message: 'Conversations loaded',
    }),
  )

  .get('/conversations/:id', async ({ params }) =>
    ownerJson({ data: await readConversation(parseInput(IdSchema, params.id)), message: 'Conversation loaded' }),
  )

  /** Permanent: the conversation and every message in it. */
  .delete('/conversations/:id', async ({ params }) =>
    ownerJson({ data: await deleteConversation(parseInput(IdSchema, params.id)), message: 'Conversation deleted' }),
  )

  /** Daily counts, provider calls against the cap, and the estimated cost (always 0). */
  .get('/usage', async ({ query }) => {
    const { days } = parseInput(UsageQuerySchema, query)

    return ownerJson({ data: await readUsage(days), message: 'Usage loaded' })
  })

  .get('/settings', async () => ownerJson({ data: await readSettings(), message: 'Settings loaded' }))

  /** On/off, and transcript retention: `manual` (default) or delete after N days. */
  .patch('/settings', async ({ request }) =>
    ownerJson({
      data: await updateSettings(parseInput(SettingsPatchSchema, await readJsonBody(request))),
      message: 'Settings saved',
    }),
  )

const ID = '11111111-1111-4111-8111-111111111111'

/** Every owner route, for the fence tests. */
export const ownerAssistantPaths = [
  { method: 'GET', path: '/api/v2/owner/assistant/conversations' },
  { method: 'GET', path: `/api/v2/owner/assistant/conversations/${ID}` },
  { method: 'DELETE', path: `/api/v2/owner/assistant/conversations/${ID}` },
  { method: 'GET', path: '/api/v2/owner/assistant/usage' },
  { method: 'GET', path: '/api/v2/owner/assistant/settings' },
  { method: 'PATCH', path: '/api/v2/owner/assistant/settings' },
] as const
