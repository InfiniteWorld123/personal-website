import {
  CalendarRange,
  FileText,
  FolderKanban,
  Handshake,
  Inbox,
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
   * competing in the sidebar. Leads is what it was kept for: one set of
   * people, read as a conversation, as a board, or as a list of what is due.
   */
  children?: AdminNavigationItem[]
  /**
   * A live count drawn on the row, named rather than passed as a component so
   * this file stays what it is: the description of the menu, not part of it.
   */
  badge?: 'leadsOverdue'
  /**
   * Highlight this row only on its own path.
   *
   * A section's landing page and its first lens share a URL — the inbox *is*
   * `/admin/leads` — and without this the inbox lens stays lit while the
   * pipeline is open, so the sidebar says you are in two places at once.
   */
  exact?: boolean
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
  /** Everyone who has written, and everything written back. */
  { label: 'Inbox', to: '/admin/inbox', icon: Inbox, available: true },
  /** Everyone worth selling to, and every deal open with them. */
  { label: 'Leads', to: '/admin/leads', icon: Handshake, available: true, badge: 'leadsOverdue' },
  { label: 'Content', to: '/admin/content', icon: FileText, available: true },
  { label: 'Blog', to: '/admin/blog', icon: Newspaper, available: true },
  { label: 'Revenue', to: '/admin/revenue', icon: Wallet, available: false },
]
