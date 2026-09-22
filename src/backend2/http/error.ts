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
  /*
   * Media (`docs/v2/media.md`): "Use typed responses and stable error codes for
   * unsupported type, oversize file, missing file/folder, storage unavailable,
   * upload failure, forbidden access, and deletion blocked by references." They
   * sit in the same union rather than inside `details` so the Dashboard
   * switches on one field for every failure Backend2 can report.
   */
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'UPLOAD_FAILED'
  | 'DELETE_BLOCKED_BY_REFERENCES'
  | 'FOLDER_NOT_EMPTY'
  | 'FOLDER_CYCLE'
  | 'FOLDER_DEPTH_EXCEEDED'
  | 'NAME_TAKEN'

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

/* ---------------------------------------------------------------- the vault */

export const unsupportedFileType = make(
  HttpStatus.UNPROCESSABLE_ENTITY,
  'UNSUPPORTED_FILE_TYPE',
  'That file type is not accepted',
)
export const fileTooLarge = make(
  HttpStatus.PAYLOAD_TOO_LARGE,
  'FILE_TOO_LARGE',
  'That file is too large',
)
export const uploadFailed = make(
  HttpStatus.BAD_REQUEST,
  'UPLOAD_FAILED',
  'That upload did not finish. Nothing was added to the library.',
)

/**
 * A file that something still uses. The `details` carry the uses themselves,
 * because a refusal the owner cannot act on is not much better than a failure.
 */
export const deleteBlockedByReferences = make(
  HttpStatus.CONFLICT,
  'DELETE_BLOCKED_BY_REFERENCES',
  'That file is still in use',
)
export const folderNotEmpty = make(
  HttpStatus.CONFLICT,
  'FOLDER_NOT_EMPTY',
  'Empty the folder before deleting it',
)
export const folderCycle = make(
  HttpStatus.CONFLICT,
  'FOLDER_CYCLE',
  'A folder cannot be moved inside itself',
)
export const folderDepthExceeded = make(
  HttpStatus.CONFLICT,
  'FOLDER_DEPTH_EXCEEDED',
  'That would nest folders too deeply',
)
export const nameTaken = make(
  HttpStatus.CONFLICT,
  'NAME_TAKEN',
  'Something with that name is already here',
)
