/**
 * What every typed API call shares: the error type a failed call throws, and
 * the unwrapping of the standard response envelope. Lifted out of
 * `project.api.ts` when the blog became the second module to need it.
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

type ErrorBody = { message?: string; code?: string; details?: unknown }

/**
 * The shape every Eden Treaty call returns. `error.status` is widened to
 * `unknown` on purpose: Treaty types it that way for routes whose error
 * responses are not declared in an Elysia schema, and this application
 * validates with Valibot instead.
 */
export type TreatyResponse = {
  data: unknown
  error: { status?: unknown; value?: unknown } | null
  status: number
}

/** Unwraps the shared response envelope, or throws what the server reported. */
export const unwrap = <TData>(response: TreatyResponse): TData => {
  if (response.error) {
    const body = (response.error.value ?? {}) as ErrorBody

    throw new ApiRequestError({
      message: body.message ?? 'The request failed',
      code: body.code,
      status: typeof response.error.status === 'number' ? response.error.status : response.status,
      details: body.details,
    })
  }

  return (response.data as { data: TData }).data
}

/** The field issues a form can render, whatever shape the server sent them in. */
export const toFieldIssues = (error: ApiRequestError): string[] => {
  const details = error.details as
    | { missing?: string[]; issues?: Array<{ field?: string; message: string }> }
    | undefined

  return (
    details?.missing ??
    details?.issues?.map((issue) => (issue.field ? `${issue.field}: ${issue.message}` : issue.message)) ??
    []
  )
}
