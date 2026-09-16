import {
  CalendarRange,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Newspaper,
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
   * Lenses on the same records, shown under the section while it is open —
   * one set of records read several ways, rather than several entries
   * competing in the sidebar. Nothing uses this at the moment; it is kept
   * because the sidebar still renders it and the next section that needs
   * lenses gets them for free.
   */
  children?: AdminNavigationItem[]
}

export const adminNavigation: AdminNavigationItem[] = [
  { label: 'Overview', to: '/admin', icon: LayoutDashboard, available: true },
  { label: 'Projects', to: '/admin/projects', icon: FolderKanban, available: true },
  /**
   * Named for what is left in it: the owner's hours, and the kinds of call that
   * may be booked in them. The route is unchanged — this is the label, not the
   * section.
   */
  { label: 'Calendar', to: '/admin/bookings', icon: CalendarRange, available: true },
  { label: 'Content', to: '/admin/content', icon: FileText, available: true },
  { label: 'Blog', to: '/admin/blog', icon: Newspaper, available: true },
  { label: 'Revenue', to: '/admin/revenue', icon: Wallet, available: false },
]
