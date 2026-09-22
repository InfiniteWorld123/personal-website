import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SecurityOverview, SessionPage } from '#/backend2/contracts/auth.contract'
import { listSessions, readSecurity } from './api'

/**
 * What Security Settings reads.
 *
 * One key prefix, because every write on that page can change more than the
 * panel it was clicked in — replacing the authenticator issues new recovery
 * codes, changing the password ends every session — and a narrow invalidation
 * would leave the rest of the page describing a state that no longer exists.
 */
export const securityKeys = {
  all: ['backend2', 'security'] as const,
  overview: () => [...securityKeys.all, 'overview'] as const,
  sessions: (page: number) => [...securityKeys.all, 'sessions', page] as const,
}

export const useSecurityOverview = () =>
  useQuery<SecurityOverview>({
    queryKey: securityKeys.overview(),
    queryFn: readSecurity,
    // The page is a statement about right now; a stale factor list is worse
    // than a moment's wait.
    staleTime: 0,
  })

/**
 * Sessions beyond the first page.
 *
 * Page one rides along with the overview, so this stays disabled until the
 * owner actually pages — one request instead of two on every visit.
 */
export const useSessionPage = (page: number, enabled: boolean) =>
  useQuery<SessionPage>({
    queryKey: securityKeys.sessions(page),
    queryFn: () => listSessions(page),
    enabled,
    placeholderData: (previous) => previous,
  })

export const useRefreshSecurity = () => {
  const client = useQueryClient()

  return () => client.invalidateQueries({ queryKey: securityKeys.all })
}
