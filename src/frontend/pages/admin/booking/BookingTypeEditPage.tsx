import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { Switch } from '#/frontend/components/ui/switch'
import { Textarea } from '#/frontend/components/ui/textarea'
import {
  adminBookingTypeQuery,
  useCreateBookingType,
  useUpdateBookingType,
} from '#/frontend/features/booking/booking-queries'
import { BOOKING_LANGUAGES, type BookingTypeWriteInput } from '#/shared/validation/booking.validation'

const EMPTY: BookingTypeWriteInput = {
  slug: '',
  durationMinutes: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 15,
  minimumNoticeMinutes: 720,
  bookingWindowDays: 60,
  slotIntervalMinutes: 30,
  maxPerDay: 3,
  locationKind: 'VIDEO',
  locationValue: '',
  priceCents: 0,
  currency: 'EUR',
  isActive: true,
  sortOrder: 0,
  translations: {
    de: { name: '', description: '' },
    en: { name: '', description: '' },
    ar: { name: '', description: '' },
  },
}

const LANGUAGE_LABELS = { de: 'German', en: 'English', ar: 'Arabic' } as const

export function BookingTypeEditPage({ id }: { id?: string }) {
  const navigate = useNavigate()
  const existing = useQuery({ ...adminBookingTypeQuery(id ?? ''), enabled: Boolean(id) })
  const create = useCreateBookingType()
  const update = useUpdateBookingType(id ?? '')

  const [form, setForm] = useState<BookingTypeWriteInput>(EMPTY)
  const [isSeeded, setIsSeeded] = useState(!id)

  useEffect(() => {
    if (!existing.data || isSeeded) return

    const type = existing.data

    setForm({
      slug: type.slug,
      durationMinutes: type.durationMinutes,
      bufferBeforeMinutes: type.bufferBeforeMinutes,
      bufferAfterMinutes: type.bufferAfterMinutes,
      minimumNoticeMinutes: type.minimumNoticeMinutes,
      bookingWindowDays: type.bookingWindowDays,
      slotIntervalMinutes: type.slotIntervalMinutes,
      maxPerDay: type.maxPerDay,
      locationKind: type.locationKind,
      locationValue: type.locationValue ?? '',
      priceCents: type.priceCents,
      currency: type.currency,
      isActive: type.isActive,
      sortOrder: type.sortOrder,
      translations: type.translations,
    })
    setIsSeeded(true)
  }, [existing.data, isSeeded])

  const mutation = id ? update : create
  const set = (patch: Partial<BookingTypeWriteInput>) => setForm({ ...form, ...patch })

  const save = () =>
    mutation.mutate(form, {
      onSuccess: () => void navigate({ to: '/admin/bookings/types' }),
    })

  if (id && existing.isPending) {
    return <p className="text-muted-foreground py-12 text-center text-sm">Loading call type…</p>
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/admin/bookings/types">
          <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
          Call types
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {id ? 'Edit call type' : 'New call type'}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The slug reaches the public URL as <code className="text-xs">/booking/&lt;slug&gt;</code>.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Basics</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="slug" label="Slug">
            <Input
              id="slug"
              value={form.slug}
              dir="ltr"
              onChange={(event) => set({ slug: event.currentTarget.value })}
            />
          </Field>

          <Field id="duration" label="Length (minutes)">
            <Input
              id="duration"
              type="number"
              className="tabular"
              value={form.durationMinutes}
              onChange={(event) => set({ durationMinutes: Number(event.currentTarget.value) })}
            />
          </Field>

          <Field
            id="interval"
            label="Offered every (minutes)"
            hint="The length has to divide by this."
          >
            <Input
              id="interval"
              type="number"
              className="tabular"
              value={form.slotIntervalMinutes}
              onChange={(event) => set({ slotIntervalMinutes: Number(event.currentTarget.value) })}
            />
          </Field>

          <Field id="location-kind" label="Where">
            <select
              id="location-kind"
              value={form.locationKind}
              onChange={(event) =>
                set({ locationKind: event.currentTarget.value as BookingTypeWriteInput['locationKind'] })
              }
              className="border-border bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="VIDEO">Video call</option>
              <option value="PHONE">Phone</option>
              <option value="IN_PERSON">In person</option>
            </select>
          </Field>

          <Field
            id="location-value"
            label="Link, number, or address"
            hint="Sent with every confirmation."
          >
            <Input
              id="location-value"
              dir="ltr"
              value={form.locationValue ?? ''}
              onChange={(event) => set({ locationValue: event.currentTarget.value })}
            />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold">Rules</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Buffers are held on your calendar around the call and are never shown to the visitor.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="buffer-before" label="Buffer before (minutes)">
            <Input
              id="buffer-before"
              type="number"
              className="tabular"
              value={form.bufferBeforeMinutes}
              onChange={(event) => set({ bufferBeforeMinutes: Number(event.currentTarget.value) })}
            />
          </Field>

          <Field id="buffer-after" label="Buffer after (minutes)">
            <Input
              id="buffer-after"
              type="number"
              className="tabular"
              value={form.bufferAfterMinutes}
              onChange={(event) => set({ bufferAfterMinutes: Number(event.currentTarget.value) })}
            />
          </Field>

          <Field id="notice" label="Minimum notice (minutes)" hint="720 is half a day.">
            <Input
              id="notice"
              type="number"
              className="tabular"
              value={form.minimumNoticeMinutes}
              onChange={(event) => set({ minimumNoticeMinutes: Number(event.currentTarget.value) })}
            />
          </Field>

          <Field id="window" label="Open how many days ahead">
            <Input
              id="window"
              type="number"
              className="tabular"
              value={form.bookingWindowDays}
              onChange={(event) => set({ bookingWindowDays: Number(event.currentTarget.value) })}
            />
          </Field>

          <Field id="max-per-day" label="Most per day" hint="Empty means no limit.">
            <Input
              id="max-per-day"
              type="number"
              className="tabular"
              value={form.maxPerDay ?? ''}
              onChange={(event) =>
                set({
                  maxPerDay: event.currentTarget.value === '' ? null : Number(event.currentTarget.value),
                })
              }
            />
          </Field>

          <Field id="price" label="Price (cents)" hint="0 is free.">
            <Input
              id="price"
              type="number"
              className="tabular"
              value={form.priceCents}
              onChange={(event) => set({ priceCents: Number(event.currentTarget.value) })}
            />
          </Field>
        </div>

        <label className="flex w-fit items-center gap-3 text-sm">
          <Switch checked={form.isActive} onCheckedChange={(next) => set({ isActive: next })} />
          Offered on the public page
        </label>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold">Name and description</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            All three languages are required, as they are for posts and projects.
          </p>
        </div>

        {BOOKING_LANGUAGES.map((language) => (
          <div key={language} className="border-border flex flex-col gap-3 rounded-lg border p-4">
            <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
              {LANGUAGE_LABELS[language]}
            </p>

            <Input
              placeholder="Name"
              dir={language === 'ar' ? 'rtl' : 'ltr'}
              value={form.translations[language].name}
              onChange={(event) =>
                set({
                  translations: {
                    ...form.translations,
                    [language]: { ...form.translations[language], name: event.currentTarget.value },
                  },
                })
              }
            />

            <Textarea
              rows={3}
              placeholder="Description"
              dir={language === 'ar' ? 'rtl' : 'ltr'}
              value={form.translations[language].description}
              onChange={(event) =>
                set({
                  translations: {
                    ...form.translations,
                    [language]: {
                      ...form.translations[language],
                      description: event.currentTarget.value,
                    },
                  },
                })
              }
            />
          </div>
        ))}
      </section>

      {mutation.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {(mutation.error as Error).message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" disabled={mutation.isPending} onClick={save}>
          {mutation.isPending ? 'Saving…' : 'Save call type'}
        </Button>
        <Button asChild variant="outline">
          <Link to="/admin/bookings/types">Cancel</Link>
        </Button>
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {hint ? (
          <span className="text-muted-foreground ms-2 text-xs font-normal">{hint}</span>
        ) : null}
      </Label>
      {children}
    </div>
  )
}
