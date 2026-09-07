import { type Language, languages } from '#/frontend/i18n/language'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { cn } from '#/frontend/lib/utils'

const shortLabel: Record<Language, string> = { de: 'DE', en: 'EN', ar: 'AR' }

export function LanguageSwitcher({
  label,
  names,
  className,
}: {
  label: string
  names: Record<Language, string>
  className?: string
}) {
  const { language, setLanguage } = useLanguage()

  return (
    <div
      role="group"
      aria-label={label}
      className={cn('border-border flex items-center rounded-full border p-0.5', className)}
    >
      {languages.map((option) => {
        const isActive = option === language

        return (
          <button
            key={option}
            type="button"
            lang={option}
            aria-current={isActive ? 'true' : undefined}
            aria-label={names[option]}
            title={names[option]}
            onClick={() => setLanguage(option)}
            className={cn(
              'h-7 min-w-9 rounded-full px-2 font-sans text-xs font-medium transition-colors',
              isActive
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {shortLabel[option]}
          </button>
        )
      })}
    </div>
  )
}
