import {
  CalendarClock,
  FileText,
  FolderKanban,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Newspaper,
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
    label: 'Leads',
    to: '/admin/inbox',
    icon: Users,
    available: true,
    children: [
      { label: 'Inbox', to: '/admin/inbox', icon: Inbox, available: true },
      { label: 'Pipeline', to: '/admin/leads/pipeline', icon: KanbanSquare, available: false },
      { label: 'Today', to: '/admin/leads/today', icon: Sun, available: false },
    ],
  },
  { label: 'Bookings', to: '/admin/bookings', icon: CalendarClock, available: true },
  { label: 'Content', to: '/admin/content', icon: FileText, available: false },
  { label: 'Blog', to: '/admin/blog', icon: Newspaper, available: true },
  { label: 'Revenue', to: '/admin/revenue', icon: Wallet, available: false },
]
