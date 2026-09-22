import { Link, useRouterState } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '#/frontend/lib/utils'
import { DashboardMark } from './DashboardMark'
import {
  dashboardFooterNavigation,
  dashboardNavigation,
  isSectionActive,
  type DashboardNavItem,
} from './dashboard-navigation'

/**
 * The left rail.
 *
 * Rows are full-bleed and square — no pill, no inset — and the section you are
 * on is marked by a blue bar welded to the sidebar's own edge. That bar is a
 * shape, not a colour: it still says where you are to someone who cannot tell
 * the blue from the grey.
 *
 * Collapsed, the row keeps its icon and loses its text, and the label comes
 * back out on hover *or keyboard focus* as a floating chip. Hover alone would
 * make a collapsed rail unusable without a pointer.
 */
export function DashboardSidebar({
  onNavigate,
  forceExpanded = false,
}: {
  onNavigate?: () => void
  /** The mobile drawer is never a rail, whatever the desktop rail is doing. */
  forceExpanded?: boolean
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  return (
    <div className="dash-side-inner flex h-full flex-col">
      <div className="dash-brand-block flex h-16 shrink-0 items-center gap-3 border-b border-[var(--dash-line)]">
        <DashboardMark />
        <div className={cn('min-w-0', !forceExpanded && 'dash-wordmark')}>
          <p className="text-[10px] font-semibold tracking-[0.15em] text-[var(--dash-quiet)]">
            YAMAN WARDA
          </p>
          <p className="mt-px text-[15px] font-semibold tracking-tight">Dashboard</p>
        </div>
      </div>

      <nav aria-label="Dashboard sections" className="dash-nav-scroll flex flex-1 flex-col py-3.5">
        <p
          className={cn(
            'dash-eyebrow-quiet px-5 pb-2',
            !forceExpanded && 'dash-group-label',
          )}
        >
          MENU
        </p>

        {dashboardNavigation.map((item) => (
          <NavRow key={item.to} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}

        <p
          className={cn(
            'dash-eyebrow-quiet px-5 pt-5 pb-2',
            !forceExpanded && 'dash-group-label',
          )}
        >
          GENERAL
        </p>

        {dashboardFooterNavigation.map((item) => (
          <NavRow key={item.to} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}

        {/*
          Not a `Link`: signing out is an action, and V2 has no session of its
          own yet. Until Backend2 owns authentication this row says so rather
          than pretending to do it.
        */}
        <button
          type="button"
          disabled
          className="dash-nav group relative flex w-full items-center text-left"
          title="Sign-out belongs to Backend2, which does not exist yet"
        >
          <span aria-hidden="true" className="dash-nav-edge" />
          <span className="dash-nav-row flex-1 text-sm opacity-50">
            <LogOut aria-hidden="true" className="dash-nav-icon size-[18px] shrink-0" />
            <span className="dash-nav-text">Log out</span>
          </span>
          <RailLabel>Log out</RailLabel>
        </button>
      </nav>

      <div className={cn('shrink-0 p-3', !forceExpanded && 'dash-promo')}>
        <div className="dash-slab p-4">
          <p className="flex items-center gap-2 text-[10px] font-bold tracking-[0.14em] text-[var(--dash-slab-quiet)]">
            <span
              aria-hidden="true"
              className="size-[7px] rounded-full"
              style={{ background: 'var(--dash-live)' }}
            />
            PUBLIC SITE · LIVE
          </p>
          <p className="mt-2 text-sm font-semibold">yamanwarda.de</p>
          <p className="mt-0.5 text-[11px] text-[var(--dash-slab-quiet)]">
            The site V2 will eventually serve
          </p>
          <a
            href="/"
            className="dash-btn dash-btn-primary mt-3 h-[34px] w-full text-xs"
          >
            Open site
          </a>
        </div>
      </div>
    </div>
  )
}

function NavRow({
  item,
  pathname,
  onNavigate,
}: {
  item: DashboardNavItem
  pathname: string
  onNavigate?: () => void
}) {
  const Icon = item.icon
  const active = isSectionActive(item, pathname)

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      data-active={active}
      aria-current={active ? 'page' : undefined}
      className="dash-nav relative flex items-center"
    >
      <span aria-hidden="true" className="dash-nav-edge" />
      <span className="dash-nav-row flex-1 text-sm">
        <Icon aria-hidden="true" className="dash-nav-icon size-[18px] shrink-0" />
        <span className="dash-nav-text">{item.label}</span>
      </span>

      <RailLabel>{item.railLabel ?? item.label}</RailLabel>
    </Link>
  )
}

/** The chip that slides out of a collapsed rail. Hidden entirely when the
    sidebar is open, so it can never sit on top of the label it duplicates. */
function RailLabel({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="dash-nav-float pointer-events-none absolute top-1/2 left-[62px] z-40 h-8 items-center rounded-lg px-3 text-xs font-semibold whitespace-nowrap"
      style={{
        background: 'var(--dash-slab)',
        color: 'var(--dash-slab-ink)',
        boxShadow: 'var(--dash-shadow)',
      }}
    >
      {children}
    </span>
  )
}
