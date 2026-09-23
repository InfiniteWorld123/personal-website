import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, RotateCcw } from 'lucide-react'
import { LEAD_PAGE_SIZE, type OwnerLeadListItem } from '#/backend2/contracts/lead.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage, Initials } from '#/frontend/dashboard/primitives'
import { ConfirmDialog } from '#/frontend/features/blog-v2/BlogDialog'
import { formatDay, initialsOf } from '#/frontend/features/leads-v2/lead-form'
import { leadKeys, useDeleteLead, useLeads, useRestoreLead } from '#/frontend/features/leads-v2/queries'
import { notify } from '#/frontend/lib/notify'
import { EmptyState, LeadsHead, LeadsTabs, LoadFailure, Pager, RowSkeleton, StageChip } from './lead-parts'

/**
 * Leads moved to Trash by mistake. Restore brings one back exactly as it was,
 * in the stage it left. Permanent deletion asks for the same tick as Clients
 * (approved in the Leads Design Lab, 23 Sep 2026) and takes the lead's notes
 * and follow-ups with it — never the Client it became. Nothing empties on its own.
 */

function DeleteDialog({ lead, onClose }: { lead: OwnerLeadListItem; onClose: () => void }) {
  const remove = useDeleteLead()
  const client = useQueryClient()
  const [understood, setUnderstood] = useState(false)

  return (
    <ConfirmDialog
      title={`Delete ${lead.name} permanently?`}
      confirmLabel="Delete permanently"
      busyLabel="Deleting…"
      danger
      disabled={!understood}
      onClose={onClose}
      onConfirm={async () => {
        try {
          await remove.mutateAsync(lead.id)
        } catch (caught) {
          // Already deleted, or restored meanwhile: the server's sentence says
          // which; the list behind the dialog is re-read so it matches.
          if (caught instanceof ApiRequestError && caught.status < 500) {
            void client.invalidateQueries({ queryKey: leadKeys.all })
          }

          throw caught
        }

        notify.success(`${lead.name} deleted permanently`)
        onClose()
      }}
    >
      <p>The lead, its notes and follow-ups are gone for good. A client it became is not deleted.</p>
      <label className="flex items-start gap-2 text-[var(--dash-ink)]">
        <input
          type="checkbox"
          className="mt-0.5 accent-[var(--dash-red)]"
          checked={understood}
          onChange={(event) => setUnderstood(event.target.checked)}
        />
        I understand this cannot be undone.
      </label>
    </ConfirmDialog>
  )
}

export function LeadTrashPage() {
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState<OwnerLeadListItem | null>(null)
  const trash = useLeads({ view: 'trash', page, pageSize: LEAD_PAGE_SIZE.default })
  const restore = useRestoreLead()
  const items = trash.data?.items ?? []

  // The server clamps a page past the end (its last lead was just restored or
  // deleted); follow it. Placeholder data is the previous page's, not an answer.
  useEffect(() => {
    if (trash.data && !trash.isPlaceholderData && trash.data.page !== page) setPage(trash.data.page)
  }, [trash.data, trash.isPlaceholderData, page])

  return (
    <DashboardPage className="gap-5">
      <LeadsHead />
      <LeadsTabs tab="trash" />

      <section className="dash-panel overflow-hidden" aria-label="Leads in Trash">
        {trash.isError ? (
          <LoadFailure
            title="Trash could not be loaded"
            message="The server did not answer. Nothing has been changed."
            onRetry={() => void trash.refetch()}
          />
        ) : trash.isPending ? (
          <ul aria-busy="true">
            {Array.from({ length: 3 }, (_, index) => (
              <RowSkeleton key={index} />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <EmptyState title="Trash is empty">
            Leads you move to Trash wait here until you restore or delete them.
          </EmptyState>
        ) : (
          <ul aria-busy={trash.isFetching}>
            {items.map((lead) => {
              const restoring = restore.isPending && restore.variables === lead.id

              return (
                <li
                  key={lead.id}
                  className="flex flex-wrap items-center gap-3 border-t border-[var(--dash-soft)] px-4 py-3 first:border-0 sm:px-5"
                >
                  <Initials className="size-8">{initialsOf(lead.name)}</Initials>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[13.5px]">{lead.name}</strong>
                    <span className="block truncate text-[12px] text-[var(--dash-quiet)]">
                      {lead.email} · trashed {lead.trashedAt ? formatDay(lead.trashedAt) : ''}
                    </span>
                  </span>
                  <StageChip kind={lead.stage.kind} name={lead.stage.name} />
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className="dash-btn dash-btn-quiet h-8 text-[12.5px]"
                      disabled={restore.isPending}
                      onClick={() =>
                        restore.mutate(lead.id, { onSuccess: () => notify.success(`${lead.name} restored`) })
                      }
                    >
                      {restoring ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <RotateCcw className="size-3.5" aria-hidden="true" />
                      )}
                      Restore
                      <span className="sr-only"> {lead.name}</span>
                    </button>
                    <button
                      type="button"
                      className="dash-btn dash-btn-quiet h-8 text-[12.5px] text-[var(--dash-red-ink)]"
                      disabled={restoring}
                      onClick={() => setDeleting(lead)}
                    >
                      Delete permanently
                      <span className="sr-only"> {lead.name}</span>
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {trash.data ? (
        <Pager
          page={trash.data.page}
          pageCount={trash.data.pageCount}
          total={trash.data.total}
          noun={['lead', 'leads']}
          onPage={setPage}
        />
      ) : null}

      {deleting ? <DeleteDialog lead={deleting} onClose={() => setDeleting(null)} /> : null}
    </DashboardPage>
  )
}
