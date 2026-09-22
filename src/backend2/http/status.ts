/**
 * The HTTP codes Backend2 answers with.
 *
 * A copy rather than an import from `src/backend/shared/http.ts`: V2 owns its
 * own transport layer so that deleting the legacy backend at cutover cannot
 * break it (`docs/v2/projects-backend.md` §11).
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NOT_MODIFIED: 304,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const

export type HttpStatus = (typeof HttpStatus)[keyof typeof HttpStatus]
