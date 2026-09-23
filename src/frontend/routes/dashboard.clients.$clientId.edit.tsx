import { createFileRoute } from '@tanstack/react-router'
import { EditClientPage } from '#/frontend/pages/dashboard/clients/ClientFormPage'

/** One Client's details, type included. The notes are also editable in the file itself. */
export const Route = createFileRoute('/dashboard/clients/$clientId/edit')({
  head: () => ({
    meta: [{ title: 'Edit client · Dashboard' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: function EditClientRoute() {
    return <EditClientPage clientId={Route.useParams().clientId} />
  },
})
