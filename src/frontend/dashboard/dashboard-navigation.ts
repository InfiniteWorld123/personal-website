import {
  CalendarRange,
  FileText,
  FolderKanban,
  Handshake,
  Images,
  Inbox,
  LayoutDashboard,
  Newspaper,
  ReceiptEuro,
  Settings,
  Tags,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type DashboardNavItem = {
  label: string
  to: string
  icon: LucideIcon
  /**
   * What the row says when the rail is collapsed to icons. Usually the label.
   * A row that one day carries a real count will say it here too.
   */
  railLabel?: string
  /**
   * A live count beside the label. Blog's is the comments the owner has not
   * seen yet (approved choice 1A, 23 Sep 2026) — `docs/v2/blog.md` makes the
   * Dashboard the only place new comments are announced. Inbox's is the
   * unread conversations (`docs/v2/inbox.md`, approved choice 6A). Leads'
   * is the follow-ups due now — the whole follow-up notification
   * (`docs/v2/leads.md`).
   */
  count?: 'newBlogComments' | 'inboxUnread' | 'leadsDue'
}

/**
 * The order the owner approved. It was the same eight sections the legacy
 * `/admin` carries, which was evidence that the list was right — not that the
 * screens behind it are.
 *
 * Media is the ninth, added on the owner's decision of 22 Sep 2026. It is a
 * place rather than a setting: the shared vault is where folders get tidied,
 * old files get deleted and "what of mine is public right now" gets answered,
 * and none of that has a home inside the picker that other modules open.
 *
 * It sits after Blog and before Invoices because the two sections that use it
 * most — Projects and Blog — are above it, and Invoices ends the list on
 * money, as it did before.
 *
 * Services is the tenth, added on 22 Sep 2026 directly after Projects — the
 * place the owner chose when the Services module was built. It sits beside
 * the portfolio because both are what the public site shows about the work.
 *
 * Clients is the eleventh, added on 23 Sep 2026 directly after Leads — the
 * owner's choice, because a lead that is won becomes a client
 * (`docs/v2/clients.md`).
 *
 * There is no AI item, and there will not be one: the assistant is a
 * visitor-facing feature of the public site.
 */
export const dashboardNavigation: DashboardNavItem[] = [
  { label: 'Overview', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects', to: '/dashboard/projects', icon: FolderKanban },
  { label: 'Services', to: '/dashboard/services', icon: Tags },
  { label: 'Calendar', to: '/dashboard/calendar', icon: CalendarRange },
  { label: 'Inbox', to: '/dashboard/inbox', icon: Inbox, count: 'inboxUnread' },
  { label: 'Leads', to: '/dashboard/leads', icon: Handshake, count: 'leadsDue' },
  { label: 'Clients', to: '/dashboard/clients', icon: Users },
  { label: 'Content', to: '/dashboard/content', icon: FileText },
  { label: 'Blog', to: '/dashboard/blog', icon: Newspaper, count: 'newBlogComments' },
  { label: 'Media', to: '/dashboard/media', icon: Images },
  { label: 'Invoices', to: '/dashboard/invoices', icon: ReceiptEuro },
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
