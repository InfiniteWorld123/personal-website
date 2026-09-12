import { APIError } from 'better-auth/api'
import type { ErrorHandler } from 'elysia'
import { type AppError, isAppError } from './error'
import { HttpStatusCode } from './http'
import { type ResponseError, responseError } from './response'

type PostgresErrorShape = Error & {
  code?: string
  constraint?: string
  table?: string
  cause?: unknown
}

type NormalizedError = { status: number; body: ResponseError }

const findPostgresError = (
  error: unknown,
  seen = new Set<unknown>(),
): PostgresErrorShape | null => {
  if (!error || typeof error !== 'object' || seen.has(error)) return null
  seen.add(error)

  if ('code' in error && typeof (error as PostgresErrorShape).code === 'string') {
    return error as PostgresErrorShape
  }

  return findPostgresError((error as PostgresErrorShape).cause, seen)
}

const normalized = ({
  status,
  message,
  code,
  details,
}: {
  status: number
  message: string
  code: string
  details?: unknown
}): NormalizedError => ({ status, body: responseError({ message, code, details }) })

const toResponseError = (error: unknown): NormalizedError => {
  if (isAppError(error)) {
    const isServerError = error.status >= HttpStatusCode.INTERNAL_SERVER_ERROR

    if (isServerError) console.error('Application error', error)

    return normalized({
      status: error.status,
      message: isServerError ? 'An unexpected error occurred' : error.message,
      code: error.code,
      details: isServerError ? undefined : error.details,
    })
  }

  if (error instanceof APIError) {
    return normalized({
      status: error.statusCode,
      message: error.body?.message || error.message || 'Authentication error',
      code: error.body?.code || 'AUTH_ERROR',
    })
  }

  if (error instanceof Error) {
    const postgresError = findPostgresError(error)

    if (postgresError) {
      // Log the shape, never the values — rows may contain client data.
      console.error('Database request failed', {
        code: postgresError.code,
        constraint: postgresError.constraint,
        table: postgresError.table,
      })
    }

    if (postgresError?.code === '23505') {
      return normalized({
        status: HttpStatusCode.CONFLICT,
        message: 'Resource already exists',
        code: 'CONFLICT',
      })
    }

    if (postgresError?.code === '23503') {
      return normalized({
        status: HttpStatusCode.BAD_REQUEST,
        message: 'Referenced resource was not found',
        code: 'BAD_REQUEST',
      })
    }

    if (postgresError?.code === '23502' || postgresError?.code === '22P02') {
      return normalized({
        status: HttpStatusCode.BAD_REQUEST,
        message: 'Invalid database value',
        code: 'BAD_REQUEST',
      })
    }

    console.error('Unhandled request error', error)
  } else {
    console.error('Unknown request error', error)
  }

  return normalized({
    status: HttpStatusCode.INTERNAL_SERVER_ERROR,
    message: 'An unexpected error occurred',
    code: 'INTERNAL_ERROR',
  })
}

export const handleError: ErrorHandler<{ AppError: AppError }> = ({ code, error, status }) => {
  // Answered first on purpose. Elysia derives `code` from the error's own
  // `code` field, and ours uses `NOT_FOUND` — the same name Elysia gives an
  // unmatched route. Checked in the other order, every "that post does not
  // exist" reached the client as "Route not found" instead.
  if (isAppError(error)) {
    const appResponse = toResponseError(error)

    return status(appResponse.status, appResponse.body)
  }

  if (code === 'VALIDATION') {
    const issues = error.all.map(({ message, summary }) => ({
      message: message ?? summary ?? 'Invalid value',
    }))

    return status(
      HttpStatusCode.UNPROCESSABLE_ENTITY,
      responseError({
        message: issues[0]?.message ?? 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: issues,
      }),
    )
  }

  if (code === 'NOT_FOUND') {
    return status(
      HttpStatusCode.NOT_FOUND,
      responseError({ message: 'Route not found', code: 'NOT_FOUND' }),
    )
  }

  const response = toResponseError(error)

  return status(response.status, response.body)
}
