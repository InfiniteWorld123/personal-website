import { createFileRoute } from '@tanstack/react-router'
import { EditLeadPage } from '#/frontend/pages/dashboard/leads/LeadFormPage'

/** One Lead's details. The stage, follow-up and notes also change in the file itself. */
export const Route = createFileRoute('/dashboard/leads/$leadId/edit')({
  head: () => ({
    meta: [
      { title: 'Edit lead · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: function EditLeadRoute() {
    return <EditLeadPage leadId={Route.useParams().leadId} />
  },
})
