import { createFileRoute } from '@tanstack/react-router'
import { FollowUpsPage } from '#/frontend/pages/dashboard/leads/FollowUpsPage'

/** Every open follow-up, soonest first. `?when=due` narrows to the ones due now. */
export const Route = createFileRoute('/dashboard/leads/follow-ups')({
  validateSearch: (search: Record<string, unknown>): { when?: 'due' | 'upcoming' } => ({
    when: search.when === 'due' || search.when === 'upcoming' ? search.when : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Follow-ups · Leads · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: function FollowUpsRoute() {
    return <FollowUpsPage when={Route.useSearch().when} />
  },
})
