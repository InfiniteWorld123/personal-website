import { Check, ChevronDown, Languages } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '#/frontend/components/ui/dropdown-menu'
import { type Language, isLanguage, languages } from '#/frontend/i18n/language'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { cn } from '#/frontend/lib/utils'

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={label}
          className={cn(
            'h-10 rounded-full border-border/60 bg-card px-3.5 text-foreground/72 shadow-sm hover:border-primary/30 hover:bg-primary/5 hover:text-primary',
            className,
          )}
        >
          <Languages className="size-4" />
          <span className="hidden text-sm font-bold sm:inline">{names[language]}</span>
          <ChevronDown className="size-4 transition-transform group-aria-expanded/button:rotate-180" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={9}
        className="language-menu min-w-44 overflow-hidden rounded-2xl border border-border/70 p-1.5 text-foreground shadow-[0_18px_50px_rgba(8,17,38,0.18)]"
      >
        <DropdownMenuRadioGroup
          value={language}
          onValueChange={(value) => {
            if (isLanguage(value)) setLanguage(value)
          }}
        >
          {languages.map((option) => {
            const isSelected = language === option

            return (
              <DropdownMenuRadioItem
                key={option}
                value={option}
                lang={option}
                className={cn(
                  'flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-foreground/64 transition-colors focus:bg-primary/8 focus:text-primary',
                  isSelected && 'bg-primary text-primary-foreground focus:bg-primary focus:text-primary-foreground',
                )}
              >
                <span>{names[option]}</span>
                <Check className={cn('size-4 opacity-0', isSelected && 'opacity-100')} />
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
