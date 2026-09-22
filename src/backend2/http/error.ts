import { HttpStatus } from './status'

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'STEP_UP_REQUIRED'
  | 'ENROLLMENT_REQUIRED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BODY_TOO_LARGE'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'STORAGE_UNAVAILABLE'

/**
 * Every failure Backend2 reports on purpose. Anything that is not one of
 * these reaches the client as a bare `INTERNAL_ERROR`, so a database message
 * can never become part of a response body.
 */
export class ApiError extends Error {
  readonly status: HttpStatus
  readonly code: ApiErrorCode
  readonly details?: unknown

  constructor(options: {
    status: HttpStatus
    code: ApiErrorCode
    message: string
    details?: unknown
  }) {
    super(options.message)
    this.name = 'ApiError'
    this.status = options.status
    this.code = options.code
    this.details = options.details
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError

const make =
  (status: HttpStatus, code: ApiErrorCode, fallback: string) =>
  (message: string = fallback, details?: unknown) =>
    new ApiError({ status, code, message, details })

export const badRequest = make(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'Bad request')

/**
 * Also the answer an owner route gives when the local-only guard refuses.
 * Never 401 or 403: those confirm that a private API is there
 * (`docs/v2/projects-backend.md` §9.3).
 */
export const notFound = make(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Resource not found')

/**
 * No usable owner session. Distinct from `notFound` on purpose: by the time
 * this can be thrown the caller has already passed the deployment fence, so
 * the existence of the owner API is not news to them.
 */
export const unauthorized = make(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Sign in to continue')

/** A valid session that has not proved itself again for this specific action. */
export const stepUpRequired = make(
  HttpStatus.FORBIDDEN,
  'STEP_UP_REQUIRED',
  'Confirm it is you before changing this',
)

/** Signed in only far enough to finish enrollment. Not access. */
export const enrollmentRequired = make(
  HttpStatus.FORBIDDEN,
  'ENROLLMENT_REQUIRED',
  'Finish setting up two-factor authentication first',
)

export const rateLimited = make(
  HttpStatus.TOO_MANY_REQUESTS,
  'RATE_LIMITED',
  'Too many attempts. Try again later',
)
export const conflict = make(HttpStatus.CONFLICT, 'CONFLICT', 'Conflict')
export const bodyTooLarge = make(
  HttpStatus.PAYLOAD_TOO_LARGE,
  'BODY_TOO_LARGE',
  'Request body is too large',
)
export const validationFailed = make(
  HttpStatus.UNPROCESSABLE_ENTITY,
  'VALIDATION_ERROR',
  'Validation failed',
)
export const internalError = make(
  HttpStatus.INTERNAL_SERVER_ERROR,
  'INTERNAL_ERROR',
  'An unexpected error occurred',
)
export const storageUnavailable = make(
  HttpStatus.SERVICE_UNAVAILABLE,
  'STORAGE_UNAVAILABLE',
  'Image storage is not available in this environment',
)
