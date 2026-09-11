import { auth } from '#/backend/shared/auth'

/**
 * Better Auth owns the whole `/api/auth` surface. Sign-up is disabled in the
 * Better Auth configuration, so only the seeded administrator can sign in.
 *
 * This module deliberately does not mount an Elysia instance. Better Auth
 * reads the request body itself, and anything that inspects the body first
 * leaves the stream consumed — on Cloudflare Workers `better-call` then fails
 * with `This ReadableStream is currently locked to a reader`, and every
 * sign-in answers 500. Elysia's route-level `parse: 'none'` does not prevent
 * it once ahead-of-time compilation is off, which it must be on Workers.
 *
 * So the untouched `Request` goes straight to the handler. Nothing is lost:
 * the frontend talks to this surface through `better-auth/client`, never
 * through the Eden Treaty client, so it was never part of the typed contract.
 */
export const AUTH_PATH_PREFIX = '/api/auth'

export const isAuthRequest = (pathname: string) =>
  pathname === AUTH_PATH_PREFIX || pathname.startsWith(`${AUTH_PATH_PREFIX}/`)

export const handleAuthRequest = (request: Request) => auth.handler(request)
