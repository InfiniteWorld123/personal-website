import {
  CalendarRange,
  FileText,
  FolderKanban,
  Handshake,
  Inbox,
  LayoutDashboard,
  Newspaper,
  ReceiptEuro,
  Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type DashboardNavItem = {
  label: string
  to: string
  icon: LucideIcon
  /**
   * What the row says when the rail is collapsed to icons. Usually the label,
   * but a row carrying a count says the count too — collapsed, the badge is
   * gone, and "Inbox" alone would hide the only thing worth knowing about it.
   */
  railLabel?: string
  /** A live figure drawn on the row. Named, not passed, so this file stays a
      description of the menu rather than a piece of it. */
  badge?: 'unread' | 'overdue'
}

/**
 * The order the owner approved. It is the same eight sections the legacy
 * `/admin` carries, which is evidence that the list is right — not that the
 * screens behind it are.
 *
 * There is no AI item, and there will not be one: the assistant is a
 * visitor-facing feature of the public site.
 */
export const dashboardNavigation: DashboardNavItem[] = [
  { label: 'Overview', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects', to: '/dashboard/projects', icon: FolderKanban },
  { label: 'Calendar', to: '/dashboard/calendar', icon: CalendarRange },
  { label: 'Inbox', to: '/dashboard/inbox', icon: Inbox, badge: 'unread', railLabel: 'Inbox · 7 unread' },
  { label: 'Leads', to: '/dashboard/leads', icon: Handshake },
  { label: 'Content', to: '/dashboard/content', icon: FileText },
  { label: 'Blog', to: '/dashboard/blog', icon: Newspaper },
  { label: 'Invoices', to: '/dashboard/invoices', icon: ReceiptEuro, badge: 'overdue', railLabel: 'Invoices · 3 overdue' },
]

/** Kept apart in the sidebar footer: these are the session, not the work. */
export const dashboardFooterNavigation: DashboardNavItem[] = [
  { label: 'Settings', to: '/dashboard/settings', icon: Settings },
]

/**
 * Is this row the section being used?
 *
 * `/dashboard` is a prefix of every other route, so it only matches its own
 * path; without that, Overview stays lit on every screen.
 */
export const isSectionActive = (item: DashboardNavItem, pathname: string) =>
  item.to === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.to)
