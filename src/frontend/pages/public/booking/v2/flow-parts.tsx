import { Check } from 'lucide-react'
import { useMemo } from 'react'
import { getBookingCopy } from '#/frontend/features/booking/booking-copy'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { cn } from '#/frontend/lib/utils'

/** The booking flow's step rail and time-zone picker. */

export type Step = 'time' | 'details' | 'done'

export function StepRail({ step }: { step: Step }) {
  const { language } = useLanguage()
  const copy = getBookingCopy(language).steps
  const order: Step[] = ['time', 'details', 'done']
  const current = order.indexOf(step)

  return (
    <ol className="flex flex-wrap items-center gap-3">
      {order.map((name, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo'

        return (
          <li
            key={name}
            data-state={state}
            className="booking-step text-foreground/60 flex items-center gap-2 text-sm"
          >
            <span
              className={cn(
                'booking-step-dot tabular flex size-6 items-center justify-center',
                'rounded-full text-xs font-semibold',
              )}
            >
              {state === 'done' ? <Check aria-hidden="true" className="size-3.5" /> : index + 1}
            </span>
            <span className={cn(state === 'current' && 'text-foreground font-semibold')}>
              {copy[name]}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Zones come from the browser's own list where it has one. Where it does not,
 * the detected zone is still shown — it is right far more often than not, and
 * a visitor who needs to change it can still read what it currently says.
 */
export function TimezoneSelect({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
  const { language } = useLanguage()
  const copy = getBookingCopy(language).timezone

  const zones = useMemo(() => {
    try {
      const supported = Intl.supportedValuesOf?.('timeZone') ?? []

      return supported.includes(value) ? supported : [value, ...supported]
    } catch {
      return [value]
    }
  }, [value])

  return (
    <label className="surface-card flex flex-col gap-2 rounded-[1.4rem] px-5 py-4 text-sm">
      <span className="text-foreground/45 text-[0.7rem] font-semibold tracking-[0.18em] uppercase rtl:tracking-normal">
        {copy.label}
      </span>
      <select
        dir="ltr"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="text-foreground w-full bg-transparent text-sm font-semibold focus:outline-none"
      >
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </select>
    </label>
  )
}
