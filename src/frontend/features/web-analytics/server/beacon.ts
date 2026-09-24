import { createServerFn } from '@tanstack/react-start'
import { webAnalyticsToken } from '#/shared/web-analytics'

/** The public beacon token when Cloudflare Web Analytics is switched on, else `null`. */
export const fetchBeaconToken = createServerFn({ method: 'GET' }).handler(
  async (): Promise<string | null> => webAnalyticsToken(),
)
