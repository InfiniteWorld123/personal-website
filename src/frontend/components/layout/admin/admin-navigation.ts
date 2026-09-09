import {
  CalendarClock,
  FileText,
  LayoutDashboard,
  Newspaper,
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
}

export const adminNavigation: AdminNavigationItem[] = [
  { label: 'Overview', to: '/admin', icon: LayoutDashboard, available: true },
  { label: 'Leads', to: '/admin/leads', icon: Users, available: false },
  { label: 'Bookings', to: '/admin/bookings', icon: CalendarClock, available: false },
  { label: 'Content', to: '/admin/content', icon: FileText, available: false },
  { label: 'Blog', to: '/admin/blog', icon: Newspaper, available: false },
  { label: 'Revenue', to: '/admin/revenue', icon: Wallet, available: false },
]
