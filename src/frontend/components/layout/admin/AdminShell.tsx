import { useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthUser } from '#/frontend/api/auth.api'
import { Panel } from '#/frontend/components/admin/Panel'
import { Toaster } from '#/frontend/components/feedback/Toaster'
import { Sheet, SheetContent, SheetTitle } from '#/frontend/components/ui/sheet'
import { AdminSidebar } from './AdminSidebar'
import { AdminTopBar } from './AdminTopBar'

/**
 * The desk.
 *
 * The page itself is a soft ground, and everything on it — the sidebar, the
 * bar across the top, every panel a page puts in `main` — floats above it with
 * air around it. The old shell was the opposite: white throughout, with hairline
 * borders dividing it into regions, so the eye had to read the rules to find
 * the edges.
 *
 * The sidebar floats rather than being pinned to the window edge, which is
 * what gives the whole section its shape: nothing here is a frame around
 * content, it is all things laid out on a surface.
 */
export function AdminShell({ user, children }: { user: AuthUser; children: ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <div className="bg-canvas text-foreground min-h-screen lg:grid lg:grid-cols-[17rem_1fr] lg:gap-5 lg:p-5">
      <aside className="hidden lg:block">
        <Panel className="sticky top-5 max-h-[calc(100vh-2.5rem)] overflow-y-auto">
          <AdminSidebar />
        </Panel>
      </aside>

      <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <SheetContent side="left" className="bg-panel w-72 p-0">
          <SheetTitle className="sr-only">Admin navigation</SheetTitle>
          <AdminSidebar onNavigate={() => setIsMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col gap-5 p-4 lg:p-0">
        <AdminTopBar user={user} onOpenMenu={() => setIsMenuOpen(true)} />
        <main className="min-w-0 flex-1 pb-6">{children}</main>
      </div>

      {/*
        Outside `main`, so a page that fills the whole viewport cannot scroll
        its own notices out of sight or clip them at its edge.
      */}
      <Toaster />
    </div>
  )
}
