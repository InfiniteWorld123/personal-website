import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelBody, PanelHeader, PanelNote, PanelTitle } from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import { Switch } from '#/frontend/components/ui/switch'
import { Textarea } from '#/frontend/components/ui/textarea'
import {
  adminBookingTypeQuery,
  adminBookingTypesQuery,
  useCreateBookingType,
  useUpdateBookingType,
} from '#/frontend/features/booking/booking-queries'
import { usePrefetch } from '#/frontend/lib/prefetch'
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

/** A native select dressed like the Input beside it, inside a panel. */
const SELECT_CLASS = 'border-input h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm'

/** The way back, above the title, on both the new and the edit route. */
function BackToTypes() {
  const prefetch = usePrefetch()

  return (
    <Button asChild variant="ghost" size="sm" className="-ms-2 w-fit rounded-full">
      <Link to="/admin/bookings/types" {...prefetch(adminBookingTypesQuery())}>
        <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
        Call types
      </Link>
    </Button>
  )
}

export function BookingTypeEditPage({ id }: { id?: string }) {
  const navigate = useNavigate()
  const prefetch = usePrefetch()
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

  const header = (
    <PageHeader
      back={<BackToTypes />}
      title={id ? 'Edit call type' : 'New call type'}
      description={
        <>
          The slug reaches the public URL as{' '}
          <code className="text-xs">/booking/&lt;slug&gt;</code>.
        </>
      }
    />
  )

  if (id && existing.isPending) {
    return (
      <AdminPage width="narrow">
        {header}
        <FormSkeleton />
      </AdminPage>
    )
  }

  /*
    Said rather than swallowed.
    The page used to fall through to an empty form when the request failed,
    which looked exactly like a new call type — and saving it would have
    written those defaults over the real one.
  */
  if (id && existing.isError) {
    return (
      <AdminPage width="narrow">
        {header}
        <Panel>
          <PanelNote tone="error">
            <div>
              <p className="font-medium">This call type could not be loaded.</p>
              <p className="text-muted-foreground mt-1">
                {(existing.error as Error).message}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void existing.refetch()}
            >
              Try again
            </Button>
          </PanelNote>
        </Panel>
      </AdminPage>
    )
  }

  return (
    <AdminPage width="narrow">
      {header}

      <Panel>
        <PanelHeader>
          <PanelTitle>Basics</PanelTitle>
        </PanelHeader>

        <PanelBody className="grid gap-4 sm:grid-cols-2">
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
                set({
                  locationKind: event.currentTarget.value as BookingTypeWriteInput['locationKind'],
                })
              }
              className={SELECT_CLASS}
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
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <div>
            <PanelTitle>Rules</PanelTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              Buffers are held on your calendar around the call and are never shown to the visitor.
            </p>
          </div>
        </PanelHeader>

        <PanelBody className="flex flex-col gap-5">
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
                    maxPerDay:
                      event.currentTarget.value === '' ? null : Number(event.currentTarget.value),
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
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <div>
            <PanelTitle>Name and description</PanelTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              All three languages are required, as they are for posts and projects.
            </p>
          </div>
        </PanelHeader>

        <PanelBody className="flex flex-col gap-4">
          {BOOKING_LANGUAGES.map((language) => (
            <div
              key={language}
              className="border-border/60 flex flex-col gap-3 rounded-xl border p-4"
            >
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
                      [language]: {
                        ...form.translations[language],
                        name: event.currentTarget.value,
                      },
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
        </PanelBody>
      </Panel>

      {mutation.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {(mutation.error as Error).message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" className="rounded-full" disabled={mutation.isPending} onClick={save}>
          {mutation.isPending ? 'Saving…' : 'Save call type'}
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/admin/bookings/types" {...prefetch(adminBookingTypesQuery())}>
            Cancel
          </Link>
        </Button>
      </div>
    </AdminPage>
  )
}

/** The three panels at the heights the real form has. */
function FormSkeleton() {
  return (
    <SkeletonScreen className="contents" label="Loading call type">
      {[5, 6, 0].map((fields, index) => (
        <Panel key={index}>
          <PanelHeader>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              {index > 0 ? <Skeleton className="h-3 w-72" /> : null}
            </div>
          </PanelHeader>

          <PanelBody className={fields > 0 ? 'grid gap-4 sm:grid-cols-2' : 'flex flex-col gap-4'}>
            {fields > 0
              ? Array.from({ length: fields }, (_, field) => (
                  <div className="flex flex-col gap-2" key={field}>
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ))
              : Array.from({ length: 3 }, (_, block) => (
                  <div
                    className="border-border/60 flex flex-col gap-3 rounded-xl border p-4"
                    key={block}
                  >
                    <Skeleton className="h-2.5 w-16" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ))}
          </PanelBody>
        </Panel>
      ))}
    </SkeletonScreen>
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
        {hint ? <span className="text-muted-foreground ms-2 text-xs font-normal">{hint}</span> : null}
      </Label>
      {children}
    </div>
  )
}
