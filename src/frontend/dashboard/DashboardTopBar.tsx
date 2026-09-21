import { Link } from '@tanstack/react-router'
import {
  ChevronDown,
  Handshake,
  Inbox,
  Mail,
  Menu,
  PanelLeft,
  Plus,
  ReceiptEuro,
  Search,
  Settings,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTheme } from '#/frontend/components/theme/theme-provider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '#/frontend/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/frontend/components/ui/dropdown-menu'
import type { ThemePreference } from '#/frontend/components/theme/theme'
import { useDashboardPreferences } from './preferences'
import { sampleFigures } from './sample-data'

/**
 * The bar above the work, and everything it opens.
 *
 * It is deliberately thin: the sidebar control, a way to search, one global
 * `New`, a shortcut to the mailbox, and the account. Nothing here belongs to
 * the page underneath it, which is why the page carries its own actions.
 *
 * There is no notification bell. A badge that is always lit is a badge that
 * stops being read, and the two things that actually need attention — unread
 * mail and overdue money — already say so on the Overview and in the sidebar.
 *
 * Radix puts menus and dialogs in a portal on `body`, outside the shell, so
 * each one carries `data-dashboard` and the surface choice itself. Without
 * them a menu would fall back to the public site's palette, and in the
 * floating theme it would be filled a shade off every panel around it.
 */
export function DashboardTopBar({
  userName,
  userEmail,
  railCollapsed,
  onToggleRail,
  onOpenDrawer,
}: {
  userName: string
  userEmail: string
  railCollapsed: boolean
  onToggleRail: () => void
  onOpenDrawer: () => void
}) {
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <header className="dash-topbar relative z-20 flex h-16 shrink-0 items-center gap-3 border-b border-[var(--dash-shell-edge)] bg-[var(--dash-furniture)] px-4 sm:px-5">
      <button
        type="button"
        aria-label="Open navigation"
        onClick={onOpenDrawer}
        className="dash-btn dash-btn-ghost size-11 shrink-0 p-0 lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <button
        type="button"
        aria-label={railCollapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
        aria-pressed={railCollapsed}
        onClick={onToggleRail}
        className="dash-btn dash-btn-ghost hidden size-9 shrink-0 p-0 lg:inline-flex"
      >
        <PanelLeft className="size-[18px]" />
      </button>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="flex h-9 w-full max-w-[360px] items-center gap-2.5 rounded-[9px] border border-[var(--dash-line)] bg-[var(--dash-input)] px-3 text-left text-[13px] text-[var(--dash-quiet)] hover:bg-[var(--dash-hover)]"
      >
        <Search aria-hidden="true" className="size-4 shrink-0" />
        <span className="hidden flex-1 truncate sm:block">
          Search projects, invoices, messages
        </span>
        <span className="hidden rounded border border-[var(--dash-line)] px-1.5 py-px text-[11px] font-medium sm:block">
          ⌘ K
        </span>
      </button>

      <div className="flex-1" />

      <NewMenu />

      <Link
        to="/dashboard/inbox"
        aria-label={`Open the inbox, ${sampleFigures.unread} unread`}
        className="relative hidden size-9 shrink-0 items-center justify-center rounded-[9px] border border-[var(--dash-line)] bg-[var(--dash-input)] text-[var(--dash-quiet)] hover:bg-[var(--dash-hover)] sm:inline-flex"
      >
        <Mail aria-hidden="true" className="size-[17px]" />
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -right-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-md px-1 text-[10px] font-bold text-white"
          style={{ background: 'var(--dash-brand)' }}
        >
          {sampleFigures.unread}
        </span>
      </Link>

      <AccountMenu userName={userName} userEmail={userEmail} />

      <SearchPanel open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  )
}

/* ── New ──────────────────────────────────────────────────── */

function NewMenu() {
  const { surface } = useDashboardPreferences()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="dash-btn dash-btn-primary h-9 shrink-0 pr-3 pl-2.5">
          <Plus aria-hidden="true" className="size-4" />
          New
          <ChevronDown aria-hidden="true" className="size-[13px]" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        data-dashboard
        data-surface={surface}
        align="end"
        className="w-60 rounded-xl border-[var(--dash-line)] bg-[var(--dash-surface)] p-1.5"
      >
        <MenuLink to="/dashboard/projects" icon={<Plus className="size-4" />}>
          New project
        </MenuLink>
        <MenuLink to="/dashboard/invoices" icon={<ReceiptEuro className="size-4" />}>
          New invoice
        </MenuLink>
        <MenuLink to="/dashboard/blog" icon={<Plus className="size-4" />}>
          New article
        </MenuLink>
        <DropdownMenuSeparator className="my-1.5 bg-[var(--dash-line)]" />
        <MenuLink to="/dashboard/calendar" icon={<Plus className="size-4" />}>
          New booking
        </MenuLink>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MenuLink({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenuItem asChild>
      <Link
        to={to}
        className="dash-menu-item flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-[var(--dash-ink)]"
      >
        <span aria-hidden="true" className="text-[var(--dash-quiet)]">
          {icon}
        </span>
        {children}
      </Link>
    </DropdownMenuItem>
  )
}

/* ── Account ──────────────────────────────────────────────── */

const THEME_CHOICES: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

function AccountMenu({ userName, userEmail }: { userName: string; userEmail: string }) {
  const { preference, setPreference } = useTheme()
  const { surface } = useDashboardPreferences()
  const initials = userName
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-11 shrink-0 items-center gap-2.5 rounded-[9px] pr-2.5 pl-1 hover:bg-[var(--dash-hover)]"
        >
          <span
            aria-hidden="true"
            className="grid size-[34px] shrink-0 place-items-center rounded-[10px] text-xs font-semibold"
            style={{ background: 'var(--dash-slab)', color: 'var(--dash-slab-ink)' }}
          >
            {initials || 'YW'}
          </span>
          <span className="hidden text-left md:block">
            <span className="block text-[13px] font-semibold">{userName}</span>
            <span className="block text-[11px] text-[var(--dash-quiet)]">{userEmail}</span>
          </span>
          <ChevronDown aria-hidden="true" className="size-[13px] text-[var(--dash-quiet)]" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        data-dashboard
        data-surface={surface}
        align="end"
        className="w-[300px] rounded-xl border-[var(--dash-line)] bg-[var(--dash-surface)] p-1.5"
      >
        <div className="flex items-center gap-3 px-3 pt-3 pb-3.5">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-[10px] text-[13px] font-semibold"
            style={{ background: 'var(--dash-slab)', color: 'var(--dash-slab-ink)' }}
          >
            {initials || 'YW'}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">{userName}</span>
            <span className="block truncate text-[11px] text-[var(--dash-quiet)]">{userEmail}</span>
          </span>
        </div>

        <DropdownMenuSeparator className="mb-2 bg-[var(--dash-line)]" />

        {/*
          The theme switch lives here rather than on the bar. It is a setting,
          not an action, and the bar is for things reached constantly.
        */}
        <div
          className="flex items-center gap-2.5 px-3 pb-2.5"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="flex-1 text-[13px]">Appearance</span>
          <span
            role="group"
            aria-label="Appearance"
            className="flex rounded-lg p-0.5"
            style={{ background: 'var(--dash-chip)' }}
          >
            {THEME_CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                aria-pressed={preference === choice.value}
                data-on={preference === choice.value}
                onClick={() => setPreference(choice.value)}
                className="dash-seg h-7 rounded-md px-2.5 text-xs"
              >
                {choice.label}
              </button>
            ))}
          </span>
        </div>

        <MenuLink to="/dashboard/settings" icon={<Settings className="size-4" />}>
          Settings
        </MenuLink>

        <DropdownMenuSeparator className="my-1.5 bg-[var(--dash-line)]" />

        {/* Disabled on purpose: V2 has no session of its own until Backend2. */}
        <DropdownMenuItem
          disabled
          className="flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-[var(--dash-red-ink)]"
        >
          Log out — waiting on Backend2
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ── Search ───────────────────────────────────────────────── */

/**
 * A panel, not a page. It shows what searching should feel like — results
 * grouped by where the thing lives, the first one already selected — without
 * claiming a search behaviour that has not been specified. The results are
 * fixed, and the panel says so at its foot.
 */
function SearchPanel({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { surface } = useDashboardPreferences()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-dashboard
        data-surface={surface}
        className="top-24 w-[min(40rem,calc(100vw-2rem))] translate-y-0 rounded-2xl border-[var(--dash-line)] bg-[var(--dash-surface)] p-0"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          A prototype. The results below are fixed sample data.
        </DialogDescription>

        <div className="flex h-14 items-center gap-3 border-b border-[var(--dash-line)] px-5">
          <Search aria-hidden="true" className="size-[18px] text-[var(--dash-blue)]" />
          <span className="flex-1 text-[15px]">kolb</span>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          <p className="px-5 pt-3.5 pb-2 text-[10px] font-bold tracking-[0.16em] text-[var(--dash-quiet)]">
            INVOICES
          </p>
          <Link
            to="/dashboard/invoices"
            onClick={() => onOpenChange(false)}
            className="flex h-[50px] items-center gap-3 bg-[var(--dash-blue-tint)] px-5"
          >
            <ReceiptEuro aria-hidden="true" className="size-[17px] text-[var(--dash-blue)]" />
            <span className="flex-1 truncate text-[13px] font-semibold">
              INV-2026-038 · Kolb &amp; Sohn
            </span>
            <span className="dash-tone-red flex h-[22px] items-center rounded-md px-2.5 text-[11px] font-semibold">
              22 days late
            </span>
            <span className="dash-num text-[13px] font-semibold">620 €</span>
          </Link>

          <p className="border-t border-[var(--dash-soft)] px-5 pt-3.5 pb-2 text-[10px] font-bold tracking-[0.16em] text-[var(--dash-quiet)]">
            MESSAGES
          </p>
          <Link
            to="/dashboard/inbox"
            onClick={() => onOpenChange(false)}
            className="dash-row flex h-[50px] items-center gap-3 px-5"
          >
            <Inbox aria-hidden="true" className="size-[17px] text-[var(--dash-quiet)]" />
            <span className="flex-1 truncate text-[13px]">
              Kolb &amp; Sohn — Zahlung Rechnung INV-2026-038
            </span>
            <span className="dash-num text-[11px] text-[var(--dash-quiet)]">08:15</span>
          </Link>

          <p className="border-t border-[var(--dash-soft)] px-5 pt-3.5 pb-2 text-[10px] font-bold tracking-[0.16em] text-[var(--dash-quiet)]">
            LEADS
          </p>
          <Link
            to="/dashboard/leads"
            onClick={() => onOpenChange(false)}
            className="dash-row flex h-[50px] items-center gap-3 px-5"
          >
            <Handshake aria-hidden="true" className="size-[17px] text-[var(--dash-quiet)]" />
            <span className="flex-1 truncate text-[13px]">Kolb &amp; Sohn — Wartungsvertrag</span>
            <span className="dash-tone-grey flex h-[22px] items-center rounded-md px-2.5 text-[11px] font-semibold">
              Won
            </span>
          </Link>
        </div>

        <p className="border-t border-[var(--dash-line)] bg-[var(--dash-furniture)] px-5 py-3 text-[11px] text-[var(--dash-quiet)]">
          Prototype — these results are fixed sample data, and what search
          actually covers is not specified yet.
        </p>
      </DialogContent>
    </Dialog>
  )
}
