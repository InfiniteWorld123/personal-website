import { Moon, Sun } from 'lucide-react'
import { useTheme } from '#/frontend/components/theme/theme-provider'
import { Button } from '#/frontend/components/ui/button'

export function ThemeToggle({ light, dark }: { light: string; dark: string }) {
  const { resolvedTheme, toggle } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <Button
      aria-label={isDark ? light : dark}
      title={isDark ? light : dark}
      onClick={toggle}
      size="icon"
      variant="ghost"
      className="rounded-full"
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}
