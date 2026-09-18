import * as v from 'valibot'

/**
 * The contract for the lead system.
 *
 * Two rules from the lab run through all of it:
 *
 * - **The person is not the deal.** Identity and mailbox state stay in
 *   `inbox.validation.ts`; everything that moves is here.
 * - **The two kinds of money never meet.** A build price is paid once; a
 *   subscription does not stop. They are two fields everywhere — in the
 *   database, on the wire, and on the screen.
 */

/* -------------------------------------------------------------------------- */
/* Stages                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Four stages ending in won or lost — his answer, word for word.
 *
 * `PROPOSAL` is not decoration: an offer that was sent and never answered
 * needs a different move than a conversation that never got that far, and
 * without the stage the two look identical in a list.
 */
export const DEAL_STAGES = ['NEW', 'TALKING', 'PROPOSAL', 'WON', 'LOST'] as const

export type DealStage = (typeof DEAL_STAGES)[number]

/** The board's columns, in the order a deal travels through them. */
export const OPEN_STAGES = ['NEW', 'TALKING', 'PROPOSAL'] as const

export const isOpenStage = (stage: DealStage): boolean => stage !== 'WON' && stage !== 'LOST'

export const STAGE_LABEL: Record<DealStage, string> = {
  NEW: 'New',
  TALKING: 'Talking',
  PROPOSAL: 'Proposal sent',
  WON: 'Won',
  LOST: 'Lost',
}

/**
 * Six reasons, not free text.
 *
 * Six codes can be counted, and "most common reason" is the one number in the
 * system that tells him something about his own offer rather than about his
 * week. The sentence he wants to add anyway rides along in `lostNote`.
 */
export const LOST_REASONS = [
  'TOO_EXPENSIVE',
  'CHOSE_OTHER',
  'POSTPONED',
  'NO_ANSWER',
  'NOT_A_FIT',
  'OTHER',
] as const

export type LostReason = (typeof LOST_REASONS)[number]

export const LOST_REASON_LABEL: Record<LostReason, string> = {
  TOO_EXPENSIVE: 'Too expensive',
  CHOSE_OTHER: 'Chose someone else',
  POSTPONED: 'Postponed it',
  NO_ANSWER: 'Never answered',
  NOT_A_FIT: 'Not a fit for me',
  OTHER: 'Something else',
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

const trimmed = (message: string, max: number) =>
  v.pipe(v.string(message), v.trim(), v.nonEmpty(message), v.maxLength(max, 'That text is too long'))

const optionalText = (max: number) =>
  v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(max, 'That text is too long'))

export const IdSchema = v.pipe(v.string(), v.uuid('That is not a valid id'))

/**
 * Money arrives as whole euros from a number input and is stored in cents.
 *
 * The form is the only place euros exist: everything behind it counts cents,
 * so no rounding ever happens twice.
 */
const euros = v.pipe(
  v.optional(v.union([v.string(), v.number()]), 0),
  v.transform((value) => Math.round(Number(value) * 100)),
  v.number('That is not a number'),
  v.integer(),
  v.minValue(0, 'A price cannot be negative'),
  v.maxValue(100_000_000, 'That is more than a hundred thousand euros'),
)

/** `YYYY-MM-DD`, or nothing at all. A date he chose, never one inferred. */
const followUp = v.nullish(
  v.pipe(
    v.string(),
    v.trim(),
    v.regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  ),
)

/* -------------------------------------------------------------------------- */
/* The list                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One filter, not two.
 *
 * A stage picklist and a set of tabs would ask the same question twice and
 * could contradict each other on screen — the kind of small dishonesty that
 * makes a panel untrustworthy. `NONE` is a real answer here: people who wrote
 * but have no deal are the largest group in his list.
 */
export const LeadQuerySchema = v.object({
  stage: v.optional(v.union([v.picklist(DEAL_STAGES), v.literal('ALL'), v.literal('NONE')]), 'ALL'),
  search: optionalText(120),
  limit: v.pipe(
    v.optional(v.union([v.string(), v.number()]), 200),
    v.transform((value) => Number(value)),
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(500),
  ),
})

export type LeadQueryInput = v.InferOutput<typeof LeadQuerySchema>

/* -------------------------------------------------------------------------- */
/* The deal                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Opening a deal, and editing what it holds.
 *
 * The stage is *not* here. Moving a deal is its own act with its own rules —
 * losing asks a reason in the same breath, winning stops the follow-up — and
 * folding it into a general save is how a stage once changed without anything
 * recording that it had.
 */
export const DealWriteSchema = v.object({
  title: trimmed('Give it a name', 160),
  buildEuros: euros,
  monthlyEuros: euros,
  nextStep: optionalText(200),
  followUpOn: followUp,
})

export type DealWriteInput = v.InferOutput<typeof DealWriteSchema>

/**
 * A move between stages.
 *
 * `lostReason` is required when — and only when — the move is to `LOST`; the
 * database enforces the same pair, so the two cannot drift apart.
 */
export const DealMoveSchema = v.pipe(
  v.object({
    stage: v.picklist(DEAL_STAGES),
    lostReason: v.nullish(v.picklist(LOST_REASONS)),
    lostNote: optionalText(400),
  }),
  v.forward(
    v.check(
      (input) => input.stage !== 'LOST' || Boolean(input.lostReason),
      'Say why it was lost',
    ),
    ['lostReason'],
  ),
)

export type DealMoveInput = v.InferOutput<typeof DealMoveSchema>

/* -------------------------------------------------------------------------- */
/* The history                                                                */
/* -------------------------------------------------------------------------- */

/** A line in his own words. The system writes the rest by itself. */
export const EventNoteSchema = v.object({
  body: trimmed('Write what happened', 500),
  dealId: v.nullish(IdSchema),
})

export type EventNoteInput = v.InferOutput<typeof EventNoteSchema>
