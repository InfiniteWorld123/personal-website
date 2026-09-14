import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { inboxSettingsQuery, unreadLeadsQuery } from '#/frontend/features/inbox/inbox-queries'
import { cn } from '#/frontend/lib/utils'
import { adminNavigation, type AdminNavigationItem } from './admin-navigation'

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  /**
   * The one number worth carrying on every admin page: a message can arrive
   * while the owner is editing a post, and nothing else would say so.
   */
  const settings = useQuery(inboxSettingsQuery())
  const unread = useQuery({
    ...unreadLeadsQuery(),
    enabled: settings.data?.preferences.unreadCount !== false,
  })
  const unreadCount = settings.data?.preferences.unreadCount === false ? 0 : (unread.data?.unread ?? 0)

  const pathname = useRouterState({ select: (state) => state.location.pathname })

  return (
    <nav aria-label="Admin sections" className="flex h-full flex-col gap-1 p-3">
      <div className="px-3 pt-2 pb-4">
        <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
          Platform
        </p>
        <p className="text-foreground mt-1 text-sm font-semibold">Admin</p>
      </div>

      {adminNavigation.map((item) => (
        <div key={item.to} className="flex flex-col gap-1">
          <NavRow item={item} unreadCount={unreadCount} onNavigate={onNavigate} />

          {/*
            The lenses appear under the section while that section is the one
            being used: one record, read three ways, rather than three entries
            competing in the sidebar.
          */}
          {item.children && pathname.startsWith(item.to) ? (
            <div className="ms-5 flex flex-col gap-0.5 ps-1">
              {item.children.map((child) => (
                <NavRow key={child.to} item={child} unreadCount={0} onNavigate={onNavigate} isLens />
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
  unreadCount,
  onNavigate,
  isLens,
}: {
  item: AdminNavigationItem
  unreadCount: number
  onNavigate?: () => void
  isLens?: boolean
}) {
  const Icon = item.icon
  const size = isLens ? 'px-3 py-1.5 text-[0.82rem]' : 'px-3 py-2 text-sm'

  if (!item.available) {
    return (
      <span
        aria-disabled="true"
        className={cn('text-muted-foreground/50 flex cursor-not-allowed items-center gap-3 rounded-md', size)}
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
      activeOptions={{ exact: item.to === '/admin' || Boolean(item.children) }}
      onClick={onNavigate}
      className={cn(
        'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        'focus-visible:ring-ring flex items-center gap-3 rounded-md',
        'transition-colors focus-visible:ring-2 focus-visible:outline-none',
        size,
      )}
      activeProps={{ className: 'bg-accent text-accent-foreground font-medium' }}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {item.label}
      {item.to === '/admin/inbox' && unreadCount > 0 ? (
        <span className="bg-primary text-primary-foreground ms-auto rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold">
          {unreadCount}
        </span>
      ) : null}
    </Link>
  )
}
