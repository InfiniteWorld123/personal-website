import { withTransaction } from '../../db/client'
import type { OwnerLead, StageChange } from '../../contracts/lead.contract'
import { leadInTrash, notFound, validationFailed } from '../../http/error'
import { clientForLead, convertLeadToClient } from '../clients/client.won'
import * as choices from './lead-choice.repo'
import * as repo from './lead.repo'
import { getLead } from './lead.service'

/**
 * Moving a Lead to another stage. The List and the Board both call this, so
 * the rules are the same wherever the move starts (`docs/v2/leads.md`).
 *
 * - **Lost** needs exactly one reason (a typed one for `Other`) and cancels
 *   the open follow-up — recorded as cancelled because of the loss, never as
 *   done work.
 * - **Won** creates or links the Client in the same transaction
 *   (`docs/v2/clients.md`), then closes the open follow-up as no longer
 *   needed. If the Client step fails, the Lead stays where it was.
 * - Anything else just moves. Reopening a Lost Lead keeps its old reason as
 *   history and does not bring back an old follow-up; a Won Lead moved back
 *   keeps its Client untouched.
 */

const fieldError = (field: string, message: string) =>
  validationFailed(message, { issues: [{ field, message }], missing: [] })

export const changeStage = async (input: {
  leadId: string
  change: StageChange
}): Promise<OwnerLead> => {
  await withTransaction(async () => {
    await choices.ensureDefaults()

    const lead = await repo.lockLead(input.leadId)

    if (!lead) throw notFound('That lead does not exist')
    if (lead.trashed_at) throw leadInTrash('Restore this lead from Trash before moving it')

    const target = await choices.findStage(input.change.stageId)

    if (!target) throw fieldError('stageId', 'That stage does not exist')
    if (target.id === lead.stage_id) return

    const open = await repo.openFollowUp(lead.id)

    if (target.kind === 'lost') {
      const lost = input.change.lost

      if (!lost) throw fieldError('lost.reasonId', 'Choose why this lead was lost')

      const reason = await choices.findChoice('reasons', lost.reasonId)

      if (!reason)
        throw fieldError('lost.reasonId', 'That reason no longer exists. Choose another.')
      if (reason.hidden) throw fieldError('lost.reasonId', 'That reason is hidden. Choose another.')
      if (reason.locked && lost.reasonText === '')
        throw fieldError('lost.reasonText', 'Write the reason')

      if (open) await repo.closeFollowUp(open.id, 'lost')

      await repo.writeStage(lead.id, {
        stageId: target.id,
        lost: {
          reasonId: reason.id,
          reasonText: reason.locked ? lost.reasonText : '',
          notes: lost.notes,
        },
      })

      return
    }

    if (target.kind === 'won') {
      const already = await clientForLead(lead.id)
      const choice = input.change.won ?? (already ? { mode: 'create' as const } : null)

      if (!choice)
        throw fieldError('won', 'Choose whether to create a new client or link an existing one')

      await convertLeadToClient({
        lead: {
          id: lead.id,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          country: lead.country_code,
          company: lead.company,
          nicheId: lead.niche_id,
          notes: lead.notes,
        },
        choice,
      })

      if (open) await repo.closeFollowUp(open.id, 'won')

      await repo.writeStage(lead.id, { stageId: target.id, won: true })

      return
    }

    await repo.writeStage(lead.id, { stageId: target.id })
  })

  return getLead(input.leadId)
}
