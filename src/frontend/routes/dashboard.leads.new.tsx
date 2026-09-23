import { createFileRoute } from '@tanstack/react-router'
import { NewLeadPage } from '#/frontend/pages/dashboard/leads/LeadFormPage'
import type { LeadPrefill } from '#/frontend/features/leads-v2/lead-form'

const text = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, max) : undefined

/**
 * A new Lead. An owner-clicked "Create lead" in Inbox or Booking links here
 * with the details it has, for the owner to check and save — nothing is saved
 * by the link itself.
 */
export const Route = createFileRoute('/dashboard/leads/new')({
  validateSearch: (search: Record<string, unknown>): LeadPrefill => ({
    name: text(search.name, 160),
    email: text(search.email, 254),
    phone: text(search.phone, 40),
    company: text(search.company, 200),
  }),
  head: () => ({
    meta: [
      { title: 'New lead · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: function NewLeadRoute() {
    return <NewLeadPage prefill={Route.useSearch()} />
  },
})
