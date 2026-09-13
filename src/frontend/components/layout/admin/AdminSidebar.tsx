import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { inboxSettingsQuery, unreadLeadsQuery } from '#/frontend/features/inbox/inbox-queries'
import { cn } from '#/frontend/lib/utils'
import { adminNavigation } from './admin-navigation'

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

  return (
    <nav aria-label="Admin sections" className="flex h-full flex-col gap-1 p-3">
      <div className="px-3 pt-2 pb-4">
        <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
          Platform
        </p>
        <p className="text-foreground mt-1 text-sm font-semibold">Admin</p>
      </div>

      {adminNavigation.map((item) => {
        const Icon = item.icon

        if (!item.available) {
          return (
            <span
              key={item.to}
              aria-disabled="true"
              className="text-muted-foreground/50 flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm"
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {item.label}
              <span className="border-border text-muted-foreground/70 ml-auto rounded border px-1.5 py-0.5 text-[10px]">
                soon
              </span>
            </span>
          )
        }

        return (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === '/admin' }}
            onClick={onNavigate}
            className={cn(
              'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              'focus-visible:ring-ring flex items-center gap-3 rounded-md px-3 py-2 text-sm',
              'transition-colors focus-visible:ring-2 focus-visible:outline-none',
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
      })}
    </nav>
  )
}
