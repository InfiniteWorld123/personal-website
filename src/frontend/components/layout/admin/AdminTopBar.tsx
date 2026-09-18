import { useRouter } from '@tanstack/react-router'
import { LogOut, Menu, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { signOut } from '#/frontend/api/auth.api'
import { Panel } from '#/frontend/components/admin/Panel'
import { useTheme } from '#/frontend/components/theme/theme-provider'
import { Button } from '#/frontend/components/ui/button'
import type { AuthUser } from '#/frontend/api/auth.api'

/**
 * Who is signed in, and the two switches that belong to the session rather
 * than to any page.
 *
 * A floating capsule rather than a bar welded to the top of the window: it is
 * one more thing on the desk, and it keeps the ground visible above it so the
 * page never reads as a frame with content poured into it.
 */
export function AdminTopBar({ user, onOpenMenu }: { user: AuthUser; onOpenMenu: () => void }) {
  const router = useRouter()
  const { resolvedTheme, toggle } = useTheme()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const handleSignOut = async () => {
    setIsSigningOut(true)

    try {
      await signOut()
      await router.navigate({ to: '/admin/login' })
      await router.invalidate()
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <Panel asChild>
      <header className="sticky top-4 z-20 flex h-16 items-center gap-3 px-3 backdrop-blur lg:top-5">
        <Button
          aria-label="Open navigation"
          className="lg:hidden"
          onClick={onOpenMenu}
          size="icon"
          variant="ghost"
        >
          <Menu className="size-4" />
        </Button>

        <div className="ms-2 min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="text-muted-foreground truncate text-xs">{user.email}</p>
        </div>

        <Button
          aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="rounded-full"
          onClick={toggle}
          size="icon"
          variant="ghost"
        >
          {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>

        <Button
          className="rounded-full"
          disabled={isSigningOut}
          onClick={handleSignOut}
          size="sm"
          variant="outline"
        >
          <LogOut className="size-4" />
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </header>
    </Panel>
  )
}
