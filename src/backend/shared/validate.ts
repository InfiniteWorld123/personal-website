import * as v from 'valibot'
import { validationError } from './error'

/**
 * Parses a request payload with a Valibot schema and turns a failure into the
 * standard error envelope. Elysia's own validator is not used: its schemas are
 * TypeBox, while the contract this application shares with the frontend is
 * written in Valibot, and one contract in two dialects drifts.
 */
export const parseInput = <TSchema extends v.GenericSchema>(
  schema: TSchema,
  value: unknown,
): v.InferOutput<TSchema> => {
  const result = v.safeParse(schema, value)

  if (result.success) return result.output

  const issues = result.issues.map((issue) => ({
    field: v.getDotPath(issue) ?? undefined,
    message: issue.message,
  }))

  throw validationError(issues[0]?.message ?? 'Validation failed', { issues })
}
