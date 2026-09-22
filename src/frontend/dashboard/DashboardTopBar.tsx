import { Link } from '@tanstack/react-router'
import {
  ChevronDown,
  Menu,
  PanelLeft,
  Settings,
  ShieldCheck,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTheme } from '#/frontend/components/theme/theme-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/frontend/components/ui/dropdown-menu'
import type { ThemePreference } from '#/frontend/components/theme/theme'
import { signOut } from '#/frontend/features/auth-v2/api'
import { useDashboardPreferences } from './preferences'

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
  sessionKind,
  railCollapsed,
  onToggleRail,
  onOpenDrawer,
}: {
  userName: string
  userEmail: string
  sessionKind: 'legacy' | 'v2'
  railCollapsed: boolean
  onToggleRail: () => void
  onOpenDrawer: () => void
}) {
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

      <div className="flex-1" />

      <AccountMenu userName={userName} userEmail={userEmail} sessionKind={sessionKind} />
    </header>
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

function AccountMenu({
  userName,
  userEmail,
  sessionKind,
}: {
  userName: string
  userEmail: string
  sessionKind: 'legacy' | 'v2'
}) {
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

        <MenuLink to="/dashboard/settings/security" icon={<ShieldCheck className="size-4" />}>
          Security
        </MenuLink>

        <DropdownMenuSeparator className="my-1.5 bg-[var(--dash-line)]" />

        {/*
          Enabled only where it would tell the truth. Under the V2 session it
          ends that session and returns to the V2 sign-in; while the legacy
          guard is still the boundary, ending the V2 session would leave the
          Dashboard open and look like a log-out that did nothing.
        */}
        {sessionKind === 'v2' ? (
          <DropdownMenuItem
            className="flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-[var(--dash-red-ink)]"
            onSelect={async () => {
              await signOut().catch(() => {})
              window.location.assign('/dashboard/login')
            }}
          >
            Log out
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled
            className="flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-[var(--dash-red-ink)]"
          >
            Log out — sign out from /admin for now
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

