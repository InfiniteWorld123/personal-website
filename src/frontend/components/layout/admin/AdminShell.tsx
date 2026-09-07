import { useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthUser } from '#/frontend/api/auth.api'
import { Sheet, SheetContent, SheetTitle } from '#/frontend/components/ui/sheet'
import { AdminSidebar } from './AdminSidebar'
import { AdminTopBar } from './AdminTopBar'

export function AdminShell({ user, children }: { user: AuthUser; children: ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <div className="bg-background text-foreground min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="border-border hidden border-r lg:block">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <AdminSidebar />
        </div>
      </aside>

      <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Admin navigation</SheetTitle>
          <AdminSidebar onNavigate={() => setIsMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col">
        <AdminTopBar user={user} onOpenMenu={() => setIsMenuOpen(true)} />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
