import * as v from 'valibot'
import { validationFailed } from './error'

/**
 * Parses a payload with a Valibot schema and turns a failure into the standard
 * envelope. Elysia's own validator is not used: its schemas are TypeBox, while
 * the contract Backend2 shares with the Dashboard is Valibot, and one contract
 * in two dialects drifts.
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

  throw validationFailed(issues[0]?.message ?? 'Validation failed', { issues, missing: [] })
}
