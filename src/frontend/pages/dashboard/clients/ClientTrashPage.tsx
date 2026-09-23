import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Info, RotateCcw } from 'lucide-react'
import type { OwnerClientListItem } from '#/backend2/contracts/client.contract'
import { CLIENT_PAGE_SIZE } from '#/backend2/contracts/client.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage, PageHead } from '#/frontend/dashboard/primitives'
import { ConfirmDialog } from '#/frontend/features/blog-v2/BlogDialog'
import { formatDay } from '#/frontend/features/clients/client-form'
import { useClients, useDeleteClient, useRestoreClient } from '#/frontend/features/clients/queries'
import { notify } from '#/frontend/lib/notify'
import { ClientMark, EmptyState, LoadFailure, Pager, RowSkeleton } from './client-parts'

/**
 * Clients moved to Trash by mistake. Restore brings one back exactly as it
 * was; permanent deletion asks for a tick first (approved in the Design Lab,
 * 23 Sep 2026) and takes nothing else with it. Nothing empties on its own.
 */

function DeleteDialog({ client, onClose }: { client: OwnerClientListItem; onClose: () => void }) {
  const remove = useDeleteClient()
  const [understood, setUnderstood] = useState(false)

  return (
    <ConfirmDialog
      title={`Delete ${client.displayName} permanently?`}
      confirmLabel="Delete permanently"
      busyLabel="Deleting…"
      danger
      disabled={!understood}
      onClose={onClose}
      onConfirm={async () => {
        try {
          await remove.mutateAsync(client.id)
        } catch (caught) {
          if (caught instanceof ApiRequestError && caught.code === 'CLIENT_DELETE_BLOCKED') {
            throw new Error(
              'This client has invoices, so it cannot be deleted. Restore it and mark it inactive instead.',
            )
          }

          throw caught
        }

        notify.success(`${client.displayName} deleted permanently`)
        onClose()
      }}
    >
      <p>
        The client file and its private notes are gone for good. Nothing else is deleted: no lead, email, appointment,
        project, file or invoice.
      </p>
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

export function ClientTrashPage() {
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState<OwnerClientListItem | null>(null)
  const trash = useClients({ view: 'trash', page, pageSize: CLIENT_PAGE_SIZE.default })
  const restore = useRestoreClient()
  const items = trash.data?.items ?? []

  return (
    <DashboardPage className="gap-5">
      <PageHead
        eyebrow="PEOPLE · CLIENTS"
        title="Trash"
        description="Clients moved here by mistake. Restore brings a client back exactly as it was. Nothing is emptied automatically."
        actions={
          <Link to="/dashboard/clients" className="dash-btn dash-btn-quiet">
            <ArrowLeft className="size-4" aria-hidden="true" />
            All clients
          </Link>
        }
      />

      <p className="dash-tone-blue flex items-start gap-2.5 rounded-[10px] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--dash-ink)]">
        <Info className="mt-0.5 size-4 shrink-0 text-[var(--dash-blue-ink)]" aria-hidden="true" />
        <span>
          <strong className="block text-[13px]">Inactive is not Trash</strong>
          Inactive keeps a real past client out of the everyday list but searchable. Trash is for clients that should
          not exist.
        </span>
      </p>

      <section className="dash-panel overflow-hidden" aria-label="Clients in Trash">
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
            Clients you move to Trash wait here until you restore or delete them.
          </EmptyState>
        ) : (
          <ul aria-busy={trash.isFetching}>
            {items.map((client) => (
              <li
                key={client.id}
                className="flex flex-wrap items-center gap-3 border-t border-[var(--dash-soft)] px-4 py-3 first:border-0 sm:px-5"
              >
                <ClientMark kind={client.kind} name={client.displayName} />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-[13.5px]">{client.displayName}</strong>
                  <span className="block truncate text-[12px] text-[var(--dash-quiet)]">
                    {client.email} · trashed {client.trashedAt ? formatDay(client.trashedAt) : ''}
                  </span>
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    className="dash-btn dash-btn-quiet h-8 text-[12.5px]"
                    disabled={restore.isPending}
                    onClick={() =>
                      restore.mutate(client.id, { onSuccess: () => notify.success(`${client.displayName} restored`) })
                    }
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    Restore
                  </button>
                  <button
                    type="button"
                    className="dash-btn dash-btn-quiet h-8 text-[12.5px] text-[var(--dash-red-ink)]"
                    onClick={() => setDeleting(client)}
                  >
                    Delete permanently
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {trash.data ? (
        <Pager
          page={trash.data.page}
          pageCount={trash.data.pageCount}
          total={trash.data.total}
          noun={['client', 'clients']}
          onPage={setPage}
        />
      ) : null}

      {deleting ? <DeleteDialog client={deleting} onClose={() => setDeleting(null)} /> : null}
    </DashboardPage>
  )
}
