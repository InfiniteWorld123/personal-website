import {
  CalendarClock,
  CalendarRange,
  FileText,
  FolderKanban,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  Newspaper,
  Settings2,
  Sun,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type AdminNavigationItem = {
  label: string
  to: string
  icon: LucideIcon
  /** Sections whose block has not been built yet are shown but disabled. */
  available: boolean
  /**
   * Lenses on the same records, shown under the section while it is open.
   * One person is one lead; the inbox reads the conversation, the pipeline
   * reads the stages, and today reads what is owed today.
   */
  children?: AdminNavigationItem[]
}

export const adminNavigation: AdminNavigationItem[] = [
  { label: 'Overview', to: '/admin', icon: LayoutDashboard, available: true },
  { label: 'Projects', to: '/admin/projects', icon: FolderKanban, available: true },
  {
    /**
     * One section for the people, five lenses on the same records.
     *
     * The calls list moved in here because a booked call is something that
     * happened to a lead, not a separate calendar app. What did not move is
     * the calendar's own configuration — availability and call types are
     * settings for the hours, not for the people, and they stay under
     * Calendar, where the lead settings page links to them.
     */
    label: 'Leads',
    to: '/admin/inbox',
    icon: Users,
    available: true,
    children: [
      { label: 'Inbox', to: '/admin/inbox', icon: Inbox, available: true },
      { label: 'Pipeline', to: '/admin/leads/pipeline', icon: KanbanSquare, available: true },
      { label: 'Today', to: '/admin/leads/today', icon: Sun, available: true },
      { label: 'Calls', to: '/admin/leads/calls', icon: CalendarClock, available: true },
      { label: 'All leads', to: '/admin/leads/all', icon: ListChecks, available: true },
      { label: 'Settings', to: '/admin/leads/settings', icon: Settings2, available: true },
    ],
  },
  /**
   * Named for what is left in it. The booked calls themselves are read under
   * Leads, beside the people who booked them; what stays here is the calendar
   * — the owner's hours, and the kinds of call that may be booked in them.
   * The route is unchanged: this is the label, not the section.
   */
  { label: 'Calendar', to: '/admin/bookings', icon: CalendarRange, available: true },
  { label: 'Content', to: '/admin/content', icon: FileText, available: false },
  { label: 'Blog', to: '/admin/blog', icon: Newspaper, available: true },
  { label: 'Revenue', to: '/admin/revenue', icon: Wallet, available: false },
]
