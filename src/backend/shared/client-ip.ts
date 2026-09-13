import { isWorkerRuntime } from '../db/client'

/**
 * Cloudflare removes a visitor-supplied CF-Connecting-IP and writes its own.
 * Outside the Worker we deliberately return no address instead of trusting a
 * spoofable forwarding header.
 */
export const getTrustedClientIp = (request: Request): string | undefined =>
  isWorkerRuntime() ? request.headers.get('CF-Connecting-IP')?.trim() || undefined : undefined
