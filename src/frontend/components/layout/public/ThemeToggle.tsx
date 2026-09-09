import { Monitor, Moon, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTheme } from '#/frontend/components/theme/theme-provider'
import type { ThemePreference } from '#/frontend/components/theme/theme'
import { Button } from '#/frontend/components/ui/button'
import { cn } from '#/frontend/lib/utils'

export function ThemeToggle({
  labels,
}: {
  labels: { light: string; dark: string; system: string; label: string }
}) {
  const { preference, setPreference } = useTheme()

  const options: Array<{ value: ThemePreference; label: string; icon: ReactNode }> = [
    { value: 'light', label: labels.light, icon: <Sun /> },
    { value: 'dark', label: labels.dark, icon: <Moon /> },
    { value: 'system', label: labels.system, icon: <Monitor /> },
  ]

  return (
    <div
      className="theme-toggle grid grid-cols-3 rounded-full border border-border/60 bg-muted/45 p-1 shadow-sm"
      aria-label={labels.label}
      role="tablist"
    >
      {options.map((option) => {
        const isActive = preference === option.value

        return (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              'btn-glow-theme rounded-full text-foreground/58 shadow-none hover:bg-card/70 hover:text-foreground [&_svg]:size-4',
              isActive && 'theme-tab-active',
            )}
            aria-label={option.label}
            aria-selected={isActive}
            role="tab"
            suppressHydrationWarning
            title={option.label}
            onClick={() => setPreference(option.value)}
          >
            {option.icon}
          </Button>
        )
      })}
    </div>
  )
}
