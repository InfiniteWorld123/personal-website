import { useRouter } from '@tanstack/react-router'
import { LogOut, Menu, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { signOut } from '#/frontend/api/auth.api'
import { useTheme } from '#/frontend/components/theme/theme-provider'
import { Button } from '#/frontend/components/ui/button'
import type { AuthUser } from '#/frontend/api/auth.api'

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
    <header className="border-border bg-background/80 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 backdrop-blur">
      <Button
        aria-label="Open navigation"
        className="lg:hidden"
        onClick={onOpenMenu}
        size="icon"
        variant="ghost"
      >
        <Menu className="size-4" />
      </Button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="text-muted-foreground truncate text-xs">{user.email}</p>
      </div>

      <Button
        aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={toggle}
        size="icon"
        variant="ghost"
      >
        {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>

      <Button disabled={isSigningOut} onClick={handleSignOut} size="sm" variant="outline">
        <LogOut className="size-4" />
        {isSigningOut ? 'Signing out…' : 'Sign out'}
      </Button>
    </header>
  )
}
