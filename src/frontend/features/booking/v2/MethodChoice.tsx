import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { MapPin, Phone, Video } from 'lucide-react'
import type { BookingMethod } from '#/backend2/contracts/booking.contract'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { cn } from '#/frontend/lib/utils'
import { getBookingV2Copy } from './booking-v2-copy'

export const METHOD_ICONS = { video: Video, in_person: MapPin, phone: Phone } as const

/**
 * "How would you like to meet?" — asked before the time (approved choice
 * 1A), with video chosen for the visitor when the type allows it. A radio
 * group: arrow keys move between the ways, as in any list of choices.
 */
export function MethodChoice({
  methods,
  value,
  onChange,
}: {
  methods: BookingMethod[]
  value: BookingMethod
  onChange: (method: BookingMethod) => void
}) {
  const { language, isRtl } = useLanguage()
  const copy = getBookingV2Copy(language)
  const group = useRef<HTMLDivElement>(null)

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const forward = isRtl ? 'ArrowLeft' : 'ArrowRight'
    const backward = isRtl ? 'ArrowRight' : 'ArrowLeft'
    const step = event.key === forward || event.key === 'ArrowDown' ? 1 : event.key === backward || event.key === 'ArrowUp' ? -1 : 0

    if (step === 0) return

    event.preventDefault()
    const next = methods[(index + step + methods.length) % methods.length]!

    onChange(next)
    group.current?.querySelector<HTMLButtonElement>(`[data-method="${next}"]`)?.focus()
  }

  return (
    <div className="flex flex-col gap-3">
      <p id="booking-how" className="text-foreground text-base font-semibold">
        {copy.how}
      </p>
      <div ref={group} role="radiogroup" aria-labelledby="booking-how" className="flex flex-wrap gap-2.5">
        {methods.map((method, index) => {
          const Icon = METHOD_ICONS[method]
          const checked = method === value

          return (
            <button
              key={method}
              type="button"
              role="radio"
              data-method={method}
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => onChange(method)}
              onKeyDown={(event) => move(event, index)}
              className={cn('time-chip inline-flex w-auto items-center gap-2 px-5', checked && 'is-selected')}
            >
              <Icon aria-hidden="true" className="size-4" />
              {copy.methods[method]}
            </button>
          )
        })}
      </div>
      <p className="text-foreground/55 m-0 text-sm">{copy.methodNotes[value]}</p>
    </div>
  )
}
