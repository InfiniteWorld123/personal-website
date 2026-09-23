import { createFileRoute } from '@tanstack/react-router'
import { ClientsPage } from '#/frontend/pages/dashboard/clients/ClientsPage'

/**
 * The Client directory. `docs/v2/clients.md` owns what it does. `?client=`
 * opens one file beside the list, so another screen can link straight to it.
 */
export const Route = createFileRoute('/dashboard/clients/')({
  validateSearch: (search: Record<string, unknown>): { client?: string } => ({
    client: typeof search.client === 'string' && /^[0-9a-f-]{36}$/iu.test(search.client) ? search.client : undefined,
  }),
  head: () => ({
    meta: [{ title: 'Clients · Dashboard' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: function ClientsRoute() {
    return <ClientsPage openId={Route.useSearch().client} />
  },
})
