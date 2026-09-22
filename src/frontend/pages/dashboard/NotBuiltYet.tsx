import { DashboardPage, PageHead, Panel } from '#/frontend/dashboard/primitives'

/**
 * What a section in the navigation shows before it is built.
 *
 * There was a screen here that drew a toolbar, a search box and a list of
 * invented rows behind a "SAMPLE DATA" badge. It is gone. A shape that cannot
 * do anything is not worth the doubt it creates about the screens that can —
 * and every figure on it was made up.
 *
 * What is left says three true things: what the section is for, what still has
 * to be decided before it can exist, and that nothing here is connected to
 * anything. The wording comes from `docs/v2/foundation.md`, so this page
 * cannot drift from the specification it is quoting.
 */

type Module = {
  eyebrow: string
  title: string
  /** The owner's own description, from the foundation document. */
  purpose: string
  /** What the specification explicitly leaves open. */
  undecided: string
}

export const DASHBOARD_MODULES = {
  projects: {
    eyebrow: 'PROJECTS',
    title: 'Projects',
    purpose:
      'Create and edit portfolio projects, and control whether each project is visible on the public website.',
    undecided: 'The backend specification exists; the module is being rebuilt.',
  },
  calendar: {
    eyebrow: 'CALENDAR',
    title: 'Calendar',
    purpose: 'Booking management and its related operational details.',
    undecided: 'Video calls belong to this domain. Their placement is undecided.',
  },
  inbox: {
    eyebrow: 'INBOX',
    title: 'Inbox',
    purpose:
      'A compact real mailbox, not merely lead messages. It sends and receives email and supports attachments.',
    undecided:
      'Providers, folders, threading, storage, search, spam handling and retention are not designed yet.',
  },
  leads: {
    eyebrow: 'LEADS',
    title: 'Leads',
    purpose: 'The customer-lead management system.',
    undecided: 'Its exact workflow is not designed yet.',
  },
  content: {
    eyebrow: 'CONTENT',
    title: 'Content',
    purpose: 'Management of public-site content.',
    undecided: 'A planning specification exists and is waiting for approval.',
  },
  blog: {
    eyebrow: 'BLOG',
    title: 'Blog',
    purpose: 'The article-management system.',
    undecided:
      'Editor, languages, publishing rules, media and workflow are not designed yet.',
  },
  invoices: {
    eyebrow: 'INVOICES',
    title: 'Invoices',
    purpose: 'The invoicing system.',
    undecided: 'Its legal and operational boundary is not designed yet.',
  },
} as const satisfies Record<string, Module>

export type ModuleKey = keyof typeof DASHBOARD_MODULES

export function NotBuiltYet({ module }: { module: ModuleKey }) {
  const { eyebrow, title, purpose, undecided } = DASHBOARD_MODULES[module]

  return (
    <DashboardPage>
      <PageHead eyebrow={eyebrow} title={title} description={purpose} className="dash-rise dash-rise-1" />

      <Panel className="dash-rise dash-rise-2 mt-5 max-w-[68ch] gap-3 p-6">
        <p className="text-sm font-semibold">Not built yet</p>
        <p className="text-[13px] leading-relaxed text-[var(--dash-quiet)]">{undecided}</p>
        <p className="text-[13px] leading-relaxed text-[var(--dash-quiet)]">
          Nothing on this screen reads or writes anything. It will be replaced by the real module,
          not extended into one.
        </p>
      </Panel>
    </DashboardPage>
  )
}
