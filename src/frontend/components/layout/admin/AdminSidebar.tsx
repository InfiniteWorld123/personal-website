import { Link, useRouterState } from '@tanstack/react-router'
import { LeadsOverdueBadge } from '#/frontend/features/leads/LeadsOverdueBadge'
import { usePrefetch } from '#/frontend/lib/prefetch'
import { cn } from '#/frontend/lib/utils'
import { adminNavigation, type AdminNavigationItem } from './admin-navigation'
import { queriesFor } from './admin-prefetch'

/**
 * Is this section the one being used?
 *
 * True for the section's own path and for every lens under it, so walking
 * between lenses never collapses the list that offers them.
 */
const isInSection = (item: AdminNavigationItem, pathname: string): boolean =>
  pathname.startsWith(item.to) ||
  (item.children ?? []).some((child) => pathname.startsWith(child.to))

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  return (
    <nav aria-label="Admin sections" className="flex h-full flex-col gap-1 p-3">
      <div className="px-3 pt-3 pb-5">
        <p className="text-muted-foreground text-[0.68rem] font-medium tracking-[0.18em] uppercase">
          Platform
        </p>
        <p className="font-heading text-foreground mt-1 text-base font-semibold">Admin</p>
      </div>

      {adminNavigation.map((item) => (
        <div key={item.to} className="flex flex-col gap-1">
          <NavRow
            item={item}
            onNavigate={onNavigate}
            isOpenSection={isInSection(item, pathname)}
          />

          {/*
            The lenses appear under the section while that section is the one
            being used: one record, read several ways, rather than several
            entries competing in the sidebar.

            A section counts as open when the page is the section's own landing
            *or any of its lenses*. Matching only the section's own path folded
            the list away the moment a lens was opened — the lenses closed the
            menu that led to them.
          */}
          {item.children && isInSection(item, pathname) ? (
            <div className="ms-5 flex flex-col gap-0.5 ps-1">
              {item.children.map((child) => (
                <NavRow key={child.to} item={child} onNavigate={onNavigate} isLens />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  )
}

function NavRow({
  item,
  onNavigate,
  isLens,
  isOpenSection,
}: {
  item: AdminNavigationItem
  onNavigate?: () => void
  isLens?: boolean
  /** The section holding the open page, even when a lens rather than it is active. */
  isOpenSection?: boolean
}) {
  const prefetch = usePrefetch()
  const Icon = item.icon
  const size = isLens ? 'px-3 py-1.5 text-[0.82rem]' : 'px-3 py-2.5 text-sm'

  if (!item.available) {
    return (
      <span
        aria-disabled="true"
        className={cn(
          'text-muted-foreground/50 flex cursor-not-allowed items-center gap-3 rounded-xl',
          size,
        )}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {item.label}
        <span className="border-border text-muted-foreground/70 ms-auto rounded border px-1.5 py-0.5 text-[10px]">
          soon
        </span>
      </span>
    )
  }

  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.exact || item.to === '/admin' || Boolean(item.children) }}
      onClick={onNavigate}
      // Pointing at a section starts the request it will make, so the click
      // usually lands on data that is already here.
      {...prefetch(...queriesFor(item.to))}
      className={cn(
        'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        // Its lenses are showing but a lens, not it, is the active page. It
        // still names where you are, so it reads as present rather than as
        // one more thing you are not on.
        isOpenSection && !isLens && 'text-foreground font-medium',
        'focus-visible:ring-ring flex items-center gap-3 rounded-xl',
        'motion-safe:transition-colors focus-visible:ring-2 focus-visible:outline-none',
        size,
      )}
      activeProps={{ className: 'bg-primary/10 text-primary font-medium' }}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {item.label}
      {item.badge === 'leadsOverdue' ? <LeadsOverdueBadge /> : null}
    </Link>
  )
}
