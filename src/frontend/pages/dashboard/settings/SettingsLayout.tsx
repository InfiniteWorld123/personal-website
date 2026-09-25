import { Link, Outlet } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { DashboardPage, PageHead } from '#/frontend/dashboard/primitives'
import { cn } from '#/frontend/lib/utils'

/**
 * Settings, as a place rather than a page.
 *
 * A list down the side and one section at a time beside it — the shape every
 * settings screen worth using has, and the one the owner asked for. It earns
 * itself here for a reason beyond habit: Security alone is five panels, and a
 * single scrolling page would bury Appearance under it.
 *
 * Each module keeps its own settings where the work happens — signatures in
 * the Inbox, seller details in Invoices. The second list only points at them,
 * so the owner finds every setting from here without any of it living twice.
 */

const SECTIONS = [
  {
    to: '/dashboard/settings',
    label: 'Appearance',
    note: 'How the dashboard looks',
  },
  {
    to: '/dashboard/settings/security',
    label: 'Security',
    note: 'Passkeys, password, sessions',
  },
] as const

/** Settings that live inside their module. Each link opens them in place. */
const ELSEWHERE = [
  { to: '/dashboard/inbox', search: { settings: true }, label: 'Inbox', note: 'Signatures & ready replies' },
  { to: '/dashboard/invoices/settings', search: {}, label: 'Invoices', note: 'Seller, tax, bank, test mode' },
  { to: '/dashboard/calendar', search: { tab: 'hours' }, label: 'Calendar', note: 'Hours & booking limits' },
  { to: '/dashboard/assistant/settings', search: {}, label: 'Assistant', note: 'On/off, how long chats are kept' },
] as const

export function SettingsLayout() {
  return (
    <DashboardPage>
      <PageHead
        eyebrow="SETTINGS"
        title="Settings"
        description="How the dashboard looks, how you sign in, and where each section keeps its own settings."
        className="dash-rise dash-rise-1"
      />

      <div className="dash-rise dash-rise-2 mt-5 flex flex-col gap-5 lg:flex-row lg:gap-7">
        <nav aria-label="Settings sections" className="shrink-0 lg:w-[208px]">
          {/*
            Horizontal on a phone, vertical from `lg`. A 208px column beside a
            360px-wide screen leaves nothing for the section itself.
          */}
          <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-5 lg:flex-col lg:overflow-visible lg:pb-0">
            {SECTIONS.map((section) => (
              <li key={section.to} className="shrink-0">
                <Link
                  to={section.to}
                  // `exact` on Appearance only: without it the parent path
                  // stays highlighted while Security is open.
                  activeOptions={{ exact: section.to === '/dashboard/settings' }}
                  className="flex flex-col rounded-[9px] px-3 py-2 text-[13px] font-semibold text-[var(--dash-quiet)] hover:bg-[var(--dash-hover)] hover:text-[var(--dash-ink)]"
                  activeProps={{
                    className:
                      'bg-[var(--dash-blue-tint)] text-[var(--dash-blue-ink)] hover:bg-[var(--dash-blue-tint)] hover:text-[var(--dash-blue-ink)]',
                    'aria-current': 'page',
                  }}
                >
                  {section.label}
                  <span className="hidden text-[11px] font-normal opacity-70 lg:block">
                    {section.note}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <p className="dash-eyebrow-quiet mt-4 px-3 lg:mt-6">IN EACH SECTION</p>
          <ul className="mt-2 flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {ELSEWHERE.map((section) => (
              <li key={section.to} className="shrink-0">
                <Link
                  to={section.to}
                  search={section.search}
                  className="flex flex-col rounded-[9px] px-3 py-2 text-[13px] font-semibold text-[var(--dash-quiet)] hover:bg-[var(--dash-hover)] hover:text-[var(--dash-ink)]"
                >
                  <span className="flex items-center gap-1.5">
                    {section.label}
                    <ArrowUpRight className="size-3.5 opacity-60" aria-hidden="true" />
                  </span>
                  <span className="hidden text-[11px] font-normal opacity-70 lg:block">
                    {section.note}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </DashboardPage>
  )
}

/** The heading each section opens with, under the shared page title. */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className={cn('flex flex-col gap-4')}>
      <div className="flex flex-col gap-1">
        <h2 className="dash-title text-[21px]">{title}</h2>
        {description ? (
          <p className="max-w-[68ch] text-[13px] leading-relaxed text-[var(--dash-quiet)]">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  )
}
