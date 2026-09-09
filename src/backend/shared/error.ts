import { HttpStatusCode, type HttpStatusCode as HttpStatusCodeType } from './http'

export type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'

type AppErrorOptions = {
  status: HttpStatusCodeType
  code: AppErrorCode
  message: string
  details?: unknown
}

export class AppError extends Error {
  readonly status: HttpStatusCodeType
  readonly code: AppErrorCode
  readonly details?: unknown

  constructor({ status, code, message, details }: AppErrorOptions) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError

const make =
  (status: HttpStatusCodeType, code: AppErrorCode, fallback: string) =>
  (message = fallback, details?: unknown) =>
    new AppError({ status, code, message, details })

export const unauthorizedError = make(HttpStatusCode.UNAUTHORIZED, 'UNAUTHORIZED', 'Unauthorized')
export const forbiddenError = make(HttpStatusCode.FORBIDDEN, 'FORBIDDEN', 'Forbidden')
export const notFoundError = make(HttpStatusCode.NOT_FOUND, 'NOT_FOUND', 'Resource not found')
export const conflictError = make(HttpStatusCode.CONFLICT, 'CONFLICT', 'Conflict')
export const validationError = make(
  HttpStatusCode.UNPROCESSABLE_ENTITY,
  'VALIDATION_ERROR',
  'Validation failed',
)
export const badRequestError = make(HttpStatusCode.BAD_REQUEST, 'BAD_REQUEST', 'Bad request')
export const rateLimitedError = make(
  HttpStatusCode.TOO_MANY_REQUESTS,
  'RATE_LIMITED',
  'Too many requests',
)
export const internalError = make(
  HttpStatusCode.INTERNAL_SERVER_ERROR,
  'INTERNAL_ERROR',
  'Internal server error',
)
