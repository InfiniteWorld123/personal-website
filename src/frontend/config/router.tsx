import { MutationCache, QueryClient } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { getGlobalStartContext } from '@tanstack/react-start'
import { messageFromError, notify } from '#/frontend/lib/notify'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const globalContext = getGlobalStartContext() as { nonce?: string } | undefined
  /**
   * One client per router, so a server render never shares a cache between
   * two visitors. Admin data is refetched on focus by default; the retry is
   * dropped because the admin would rather see the error than wait for three
   * attempts at a request that is failing for a reason.
   */
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
    /**
     * Every failed write says so, once, from here.
     *
     * Put on the cache rather than in `defaultOptions.mutations` deliberately:
     * this handler runs for *every* mutation, and a `useMutation` that adds
     * its own `onError` — a form marking a field, say — still gets this one
     * too, instead of replacing it. So a page cannot go quiet by accident,
     * which is the whole failure this fixes.
     */
    mutationCache: new MutationCache({
      onError: (error) => notify.error(messageFromError(error)),
    }),
  })

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    context: { queryClient },
    ssr: globalContext?.nonce ? { nonce: globalContext.nonce } : undefined,
  })

  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
