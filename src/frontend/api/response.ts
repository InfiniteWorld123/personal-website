/**
 * The error every V2 API client throws for a refused or failed call, so a
 * screen can tell one refusal from another by `code` and `status`.
 */

/**
 * A failed API call, carrying what the central error flow returned. `details`
 * holds the field issues, so a form can point at the input that is wrong.
 */
export class ApiRequestError extends Error {
  readonly code: string | null
  readonly status: number
  readonly details: unknown

  constructor({
    message,
    code,
    status,
    details,
  }: {
    message: string
    code?: string | null
    status: number
    details?: unknown
  }) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = code ?? null
    this.status = status
    this.details = details
  }
}
