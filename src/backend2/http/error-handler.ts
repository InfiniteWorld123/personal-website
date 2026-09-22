import { type ApiError, isApiError } from './error'
import { type ResponseFailure, responseFailure } from './response'
import { HttpStatus } from './status'

type Normalized = { status: number; body: ResponseFailure }

const POSTGRES_MESSAGES: Record<string, { status: number; code: string; message: string }> = {
  '23505': { status: HttpStatus.CONFLICT, code: 'CONFLICT', message: 'That value is already taken' },
  '23503': {
    status: HttpStatus.BAD_REQUEST,
    code: 'BAD_REQUEST',
    message: 'Something it refers to was not found',
  },
  '23514': {
    status: HttpStatus.BAD_REQUEST,
    code: 'BAD_REQUEST',
    message: 'That combination of values is not allowed',
  },
  '22P02': {
    status: HttpStatus.BAD_REQUEST,
    code: 'BAD_REQUEST',
    message: 'One of those values has the wrong shape',
  },
}

const findPostgresCode = (error: unknown, seen = new Set<unknown>()): string | undefined => {
  if (!error || typeof error !== 'object' || seen.has(error)) return undefined
  seen.add(error)

  const code = (error as { code?: unknown }).code

  if (typeof code === 'string') return code

  return findPostgresCode((error as { cause?: unknown }).cause, seen)
}

/**
 * Turns anything thrown into the standard envelope.
 *
 * A database message never becomes part of a response: rows can hold a
 * client's name, and an error string is the easiest place for one to escape.
 */
export const normalizeError = (error: unknown): Normalized => {
  if (isApiError(error)) {
    const appError = error as ApiError
    const isServerFault = appError.status >= HttpStatus.INTERNAL_SERVER_ERROR

    if (isServerFault) console.error('Backend2 error', appError.message)

    return {
      status: appError.status,
      body: responseFailure({
        message: isServerFault ? 'An unexpected error occurred' : appError.message,
        code: appError.code,
        details: isServerFault ? undefined : appError.details,
      }),
    }
  }

  const postgresCode = findPostgresCode(error)
  const known = postgresCode ? POSTGRES_MESSAGES[postgresCode] : undefined

  if (known) {
    // The shape, never the values.
    console.error('Backend2 database request failed', { code: postgresCode })

    return {
      status: known.status,
      body: responseFailure({ message: known.message, code: known.code }),
    }
  }

  console.error('Backend2 unhandled error', error)

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: responseFailure({ message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' }),
  }
}
