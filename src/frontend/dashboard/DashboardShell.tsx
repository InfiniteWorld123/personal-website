import { useState } from 'react'
import type { ReactNode } from 'react'
import { Toaster } from '#/frontend/components/feedback/Toaster'
import { Sheet, SheetContent, SheetTitle } from '#/frontend/components/ui/sheet'
import { DashboardSidebar } from './DashboardSidebar'
import { DashboardTopBar } from './DashboardTopBar'
import { DashboardPreferencesProvider, useDashboardPreferences } from './preferences'

/**
 * The workbench.
 *
 * Four attributes on one element carry the whole shell state, and CSS reads
 * them rather than the components re-rendering around them:
 *
 *  - `data-dashboard` is the scope every token in `dashboard.css` hangs off, so
 *    nothing in here can reach the public site or `/admin`, and nothing there
 *    reaches in.
 *  - `data-surface` chooses how the surface is built: one flat plane divided
 *    by hairlines, panels lifted off a ground, the whole thing as a rounded
 *    object, or the three parts held apart. Settings switches it.
 *  - `data-nav` chooses how the section you are on is marked: a bar welded to
 *    the sidebar's edge, or a filled pill inset from it.
 *  - `data-rail` is the collapsed sidebar, which is why the width animates
 *    instead of the tree being rebuilt.
 */
export function DashboardShell({
  userName,
  userEmail,
  sessionKind,
  children,
}: {
  userName: string
  userEmail: string
  sessionKind: 'legacy' | 'v2'
  children: ReactNode
}) {
  return (
    <DashboardPreferencesProvider>
      <Workbench userName={userName} userEmail={userEmail} sessionKind={sessionKind}>
        {children}
      </Workbench>
    </DashboardPreferencesProvider>
  )
}

function Workbench({
  userName,
  userEmail,
  sessionKind,
  children,
}: {
  userName: string
  userEmail: string
  sessionKind: 'legacy' | 'v2'
  children: ReactNode
}) {
  const { surface, navShape, rail, toggleRail } = useDashboardPreferences()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div
      data-dashboard
      data-surface={surface}
      data-nav={navShape}
      data-rail={rail}
      className="dash-root"
    >
      {/*
        The frame. Flush against the window for two of the three surfaces — you
        cannot tell it is there — and a rounded object resting on the page for
        the third. It is the same markup either way; only the padding, radius
        and shadow tokens differ.

        It also owns the scrolling: the frame stays put and `main` scrolls
        inside it, which is what keeps the rail and the bar in place without
        `position: sticky`, and what lets a frame stay a frame.
      */}
      <div className="dash-frame flex">
        {/*
          The sidebar's overflow is decided in the stylesheet, not here: it has
          to stay visible while collapsed, so the label sliding out of the rail
          is not cut off at 72px, and clip while open so the contents can be
          laid out at full width before the box has finished widening.
        */}
        <aside className="dash-side z-30 hidden h-full shrink-0 border-r border-[var(--dash-shell-edge)] bg-[var(--dash-furniture)] lg:block">
          <DashboardSidebar />
        </aside>

        <div className="dash-shell-column flex min-w-0 flex-1 flex-col">
          <DashboardTopBar
            userName={userName}
            userEmail={userEmail}
            sessionKind={sessionKind}
            railCollapsed={rail}
            onToggleRail={toggleRail}
            onOpenDrawer={() => setDrawerOpen(true)}
          />

          <main className="dash-main min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>

      {/* Below `lg` the rail becomes a drawer, which is the pattern the owner
          chose over a rail or a bottom bar. Radix gives it the focus trap and
          the escape key; it portals to `body`, so it carries the scope and the
          surface choice itself. */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          data-dashboard
          data-surface={surface}
          data-nav={navShape}
          side="left"
          className="w-[300px] border-[var(--dash-line)] bg-[var(--dash-furniture)] p-0"
        >
          <SheetTitle className="sr-only">Dashboard sections</SheetTitle>
          <DashboardSidebar forceExpanded onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Outside the frame, so a notice is never clipped by its rounded
          corner and never scrolls away with the work. */}
      <Toaster />
    </div>
  )
}
