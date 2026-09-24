import { MutationCache, QueryClient } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { getGlobalStartContext } from '@tanstack/react-start'
import { RouteError } from '#/frontend/components/feedback/RouteError'
import { messageFromError, notify } from '#/frontend/lib/notify'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const globalContext = getGlobalStartContext() as { nonce?: string } | undefined
  /**
   * One client per router, so a server render never shares a cache between
   * two visitors. Dashboard data is refetched on focus by default; the retry is
   * dropped because the owner would rather see the error than wait for three
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
    /*
     * The router's own default, stated rather than inherited.
     *
     * It used to be 0, which marked preloaded data stale the moment it landed:
     * hovering a link ran the route's loader — `fetchPublishedContent()`, a
     * server-function round trip and a Neon query — and then threw the answer
     * away, so the navigation fetched it again, and so did the next hover of
     * the same link. Moving the pointer across the public nav bar cost one
     * loader per link and reused none of them. Thirty seconds is shorter than
     * anything on this site changes in, and it is what makes `preload: 'intent'`
     * do the thing it exists to do. Dashboard freshness is React Query's business,
     * not the router's, and it keeps its own `staleTime`.
     */
    defaultPreloadStaleTime: 30_000,
    /*
     * The screen a route falls back to when it throws, in place of the
     * router's own. It exists for one failure in particular: the route's
     * JavaScript file not arriving, which no route can do anything about and
     * a reload almost always fixes.
     */
    defaultErrorComponent: RouteError,
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
