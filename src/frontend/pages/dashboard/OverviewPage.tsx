import { Link } from '@tanstack/react-router'
import { DashboardPage, PageHead, Panel } from '#/frontend/dashboard/primitives'
import { DASHBOARD_MODULES, type ModuleKey } from './NotBuiltYet'

/**
 * What `/dashboard` opens on.
 *
 * It used to be four metric cards, a chart and a list of recent activity, all
 * invented, all labelled "SAMPLE DATA". An overview whose figures are made up
 * is worse than no overview: it trains you to read numbers that mean nothing,
 * and the day a real one appears you have no way to tell which kind you are
 * looking at.
 *
 * So it says what is actually true right now — which modules exist and which
 * do not — and nothing else. It grows a real figure the day a module can count
 * one.
 */

const BUILT = [
  {
    title: 'Security',
    to: '/dashboard/settings/security',
    detail: 'Passkeys, your authenticator, recovery codes and the devices you are signed in on.',
  },
  {
    title: 'Appearance',
    to: '/dashboard/settings',
    detail: 'How this dashboard looks. Saved in this browser.',
  },
] as const

const PLANNED = Object.keys(DASHBOARD_MODULES) as ModuleKey[]

export function OverviewPage() {
  return (
    <DashboardPage>
      <PageHead
        eyebrow="OVERVIEW"
        title="Dashboard"
        description="Being rebuilt one module at a time. This page shows what is finished and what is not — it does not show figures, because nothing here counts anything yet."
        className="dash-rise dash-rise-1"
      />

      <Panel className="dash-rise dash-rise-2 mt-5 overflow-hidden">
        <div className="px-5 pt-4.5 pb-3">
          <p className="dash-eyebrow">WORKING</p>
        </div>
        {BUILT.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-4 border-t border-[var(--dash-line)] px-5 py-4 hover:bg-[var(--dash-hover)]"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{item.title}</span>
              <span className="mt-0.5 block text-[12.5px] text-[var(--dash-quiet)]">
                {item.detail}
              </span>
            </span>
          </Link>
        ))}
      </Panel>

      <Panel className="dash-rise dash-rise-3 mt-5 overflow-hidden">
        <div className="px-5 pt-4.5 pb-3">
          <p className="dash-eyebrow-quiet">NOT BUILT YET</p>
        </div>
        {PLANNED.map((key) => (
          <div
            key={key}
            className="flex items-center gap-4 border-t border-[var(--dash-line)] px-5 py-3.5"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-[var(--dash-quiet)]">
                {DASHBOARD_MODULES[key].title}
              </span>
              <span className="mt-0.5 block text-[12px] text-[var(--dash-quiet)] opacity-80">
                {DASHBOARD_MODULES[key].purpose}
              </span>
            </span>
          </div>
        ))}
      </Panel>
    </DashboardPage>
  )
}
