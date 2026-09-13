import {
  CalendarClock,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Newspaper,
  Inbox,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type AdminNavigationItem = {
  label: string
  to: string
  icon: LucideIcon
  /** Sections whose block has not been built yet are shown but disabled. */
  available: boolean
}

export const adminNavigation: AdminNavigationItem[] = [
  { label: 'Overview', to: '/admin', icon: LayoutDashboard, available: true },
  { label: 'Projects', to: '/admin/projects', icon: FolderKanban, available: true },
  { label: 'Inbox', to: '/admin/inbox', icon: Inbox, available: true },
  { label: 'Bookings', to: '/admin/bookings', icon: CalendarClock, available: true },
  { label: 'Content', to: '/admin/content', icon: FileText, available: false },
  { label: 'Blog', to: '/admin/blog', icon: Newspaper, available: true },
  { label: 'Revenue', to: '/admin/revenue', icon: Wallet, available: false },
]
