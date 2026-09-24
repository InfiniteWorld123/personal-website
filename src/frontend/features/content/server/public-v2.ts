import { createServerFn } from '@tanstack/react-start'

/**
 * Whether any public module already reads Backend2 (`PUBLIC_V2_MODULES`).
 * The privacy page uses it to describe what the site actually does.
 */
export const fetchPublicV2Active = createServerFn({ method: 'GET' }).handler(async (): Promise<boolean> => {
  const { publicV2Modules } = await import('#/backend2/public-source')
  const { isDatabaseConfigured } = await import('#/backend2/db/client')

  return publicV2Modules().size > 0 && isDatabaseConfigured()
})
