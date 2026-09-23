import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarOff,
  Copy,
  CreditCard,
  Landmark,
  Link2,
  Loader2,
  Pause,
  Pencil,
  Percent,
  Play,
  Square,
  X,
} from 'lucide-react'
import { addDays, berlinToday, firstPeriodOnOrAfter, periodStart } from '#/backend2/contracts/invoice-dates.contract'
import type { OwnerSubscription } from '#/backend2/contracts/invoice.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { StatusChip } from '#/frontend/dashboard/primitives'
import { BlogDialog, DialogActions, DialogAlert, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import {
  addDiscount,
  addFreePeriod,
  cardSetup,
  changePrice,
  endDiscount,
  endSubscription,
  pauseSubscription,
  resumeSubscription,
} from '#/frontend/features/invoices-v2/api'
import { bpToText, formatAmount, formatDate, formatDay, parseMoney, parsePercent } from '#/frontend/features/invoices-v2/money'
import { useInvoices, usePeriods, useSubscription, useSubscriptionMutation } from '#/frontend/features/invoices-v2/queries'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { LoadFailure, Pager } from '../clients/client-parts'
import { FieldError, Hint, Label, Segmented, TestChip, errorId, stripeFailure } from './invoice-parts'
import { SubscriptionChip, subscriptionState } from './subscription-parts'

/**
 * One subscription, beside the list (or alone on a phone). Every change here
 * takes a date on or after today and reaches only periods not yet billed —
 * the server refuses anything else — so the words say "from the next period"
 * and mean it. Nothing is ever cancelled automatically: only End ends it.
 */

type Action = 'pause' | 'resume' | 'end' | 'price' | 'discount' | 'free' | null

const every = (interval: OwnerSubscription['interval']) => (interval === 'monthly' ? 'per month' : 'per year')

/** The first period start after today: what "from the next period" means. */
const nextPeriod = (sub: OwnerSubscription): string =>
  periodStart(sub.startDate, sub.interval, firstPeriodOnOrAfter(sub.startDate, sub.interval, addDays(berlinToday(), 1)))

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--dash-soft)] px-5 py-4 first:border-0">
      <h3 className="inv-sec-title mb-2.5">{title}</h3>
      {children}
    </div>
  )
}

function CardLink({ sub }: { sub: OwnerSubscription }) {
  const [state, setState] = useState<{ url: string; busy: boolean; error: string | null }>({ url: '', busy: false, error: null })
  const mutation = useSubscriptionMutation(() => cardSetup(sub.id), (result) => result.subscription)

  return (
    <span className="mt-2 flex flex-col gap-1.5">
      <span className="flex flex-wrap gap-2">
        <button
          type="button"
          className="dash-btn dash-btn-quiet h-8 text-[12px]"
          disabled={state.busy}
          onClick={async () => {
            setState((current) => ({ ...current, busy: true, error: null }))

            try {
              const result = await mutation.mutateAsync(undefined)

              setState({ url: result.url, busy: false, error: null })
            } catch (caught) {
              setState({ url: '', busy: false, error: stripeFailure(caught) })
            }
          }}
        >
          {state.busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Link2 className="size-3.5" aria-hidden="true" />}
          {sub.card.status === 'none' ? 'Create the card link' : 'Create a new card link'}
        </button>
        {state.url ? (
          <button
            type="button"
            className="dash-btn dash-btn-ghost h-8 text-[12px]"
            onClick={async () => {
              await navigator.clipboard?.writeText(state.url).catch(() => {})
              notify.success('Card link copied — send it to the client')
            }}
          >
            <Copy className="size-3.5" aria-hidden="true" />
            Copy
          </button>
        ) : null}
      </span>
      {state.url ? (
        <span className="break-all text-[12px]">
          Send this to the client — Stripe’s own secure page, where they agree and save a card:{' '}
          <a href={state.url} target="_blank" rel="noopener noreferrer" className="text-[var(--dash-blue-ink)] underline">
            {state.url}
          </a>
        </span>
      ) : null}
      {state.error ? <FieldError id={`card-link-${sub.id}`} message={state.error} /> : null}
    </span>
  )
}

function Collection({ sub }: { sub: OwnerSubscription }) {
  const overdue = useInvoices({ mode: sub.mode, subscriptionId: sub.id, status: 'overdue', pageSize: 3 }, sub.collection === 'automatic_card')
  const late = overdue.data?.items ?? []

  if (sub.collection === 'manual') {
    return (
      <div className="flex gap-2.5 rounded-[10px] border border-[var(--dash-line)] px-3 py-2.5 text-[12.5px] leading-relaxed">
        <Landmark className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <b className="block text-[13px]">You review each period</b>A draft invoice is prepared 7 days before each
          period. You check it, issue it and send it. The client pays by{' '}
          {[sub.allowBank ? 'bank transfer' : '', sub.allowStripe ? 'a one-time Stripe link' : ''].filter(Boolean).join(' or ') ||
            'the way you agree'}
          .
        </span>
      </div>
    )
  }

  if (late.length > 0) {
    return (
      <div className="flex gap-2.5 rounded-[10px] border border-[var(--dash-red)] bg-[var(--dash-red-tint)] px-3 py-2.5 text-[12.5px] leading-relaxed">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--dash-red-ink)]" aria-hidden="true" />
        <span>
          <b className="block text-[13px]">A period is overdue, not paid</b>
          {late.map((invoice) => (
            <Link
              key={invoice.id}
              to="/dashboard/invoices/$invoiceId"
              params={{ invoiceId: invoice.id }}
              className="me-2 font-semibold underline"
            >
              {invoice.number}
            </Link>
          ))}
          <br />
          When a card charge fails, Stripe tries again up to two more times (3 and 7 days later) and the client gets up to three
          reminders over 14 days, prepared in Inbox for you to send. Nothing is cancelled automatically — you decide.
          <CardLink sub={sub} />
        </span>
      </div>
    )
  }

  const card = sub.card

  if (card.status === 'valid') {
    return (
      <div className="flex gap-2.5 rounded-[10px] border border-[var(--dash-line)] px-3 py-2.5 text-[12.5px] leading-relaxed">
        <CreditCard className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <b className="block text-[13px]">Card on file{card.label ? ` · ${card.label}` : ''}</b>
          Each period is charged on its first day, then the invoice is issued and sent without you.
          {card.consentAt ? ` The client agreed on ${formatDay(card.consentAt)}.` : ''}
        </span>
      </div>
    )
  }

  if (card.status === 'invalid') {
    return (
      <div className="flex gap-2.5 rounded-[10px] border border-[var(--dash-red)] bg-[var(--dash-red-tint)] px-3 py-2.5 text-[12.5px] leading-relaxed">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--dash-red-ink)]" aria-hidden="true" />
        <span>
          <b className="block text-[13px]">The saved card cannot be used</b>
          The next charge waits for a new card. Nothing switches to bank transfer and nothing is cancelled — send the client a new
          card link.
          <CardLink sub={sub} />
        </span>
      </div>
    )
  }

  return (
    <div className="flex gap-2.5 rounded-[10px] border border-[var(--dash-line)] px-3 py-2.5 text-[12.5px] leading-relaxed">
      <CreditCard className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        <b className="block text-[13px]">{card.status === 'pending' ? 'Waiting for the client’s card' : 'No card yet'}</b>
        The client saves a card on Stripe’s secure page and agrees to {formatAmount(sub.currentAmountMinor, sub.currency)}{' '}
        {every(sub.interval)}. After a free start they are reminded 7 days before the first charge. Until a card is saved, a
        due charge waits — nothing switches to bank transfer.
        <CardLink sub={sub} />
      </span>
    </div>
  )
}

/* ------------------------------------------------------------ the dialogs */

function DateDialog({
  sub,
  action,
  onClose,
}: {
  sub: OwnerSubscription
  action: 'pause' | 'resume' | 'end'
  onClose: () => void
}) {
  const today = berlinToday()
  const defaultEnd = sub.nextPeriodStart ? addDays(nextPeriod(sub), -1) : today
  const [failure, setFailure] = useState<string | null>(null)
  const run = useSubscriptionMutation(
    (date: string | null) =>
      action === 'pause' ? pauseSubscription(sub.id, date) : action === 'resume' ? resumeSubscription(sub.id, date) : endSubscription(sub.id, date),
    (result) => result,
  )
  const form = useForm({
    defaultValues: { date: action === 'end' ? defaultEnd : today },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(value.date)) return { fields: { date: 'Choose a date' } }
        if (value.date < today) return { fields: { date: 'Choose today or a later day — past periods are not rewritten' } }

        return undefined
      },
    },
    onSubmitInvalid: () => window.requestAnimationFrame(() => document.getElementById('sub-date')?.focus()),
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        await run.mutateAsync(value.date)
        notify.success(
          action === 'pause'
            ? 'Paused — no drafts or charges for periods that start while paused'
            : action === 'resume'
              ? `Resumed from ${formatDate(value.date)}`
              : `Ends after ${formatDate(value.date)}`,
        )
        onClose()
      } catch (caught) {
        setFailure(caught instanceof Error ? caught.message : 'Nothing was changed. Try again.')
      }
    },
  })
  const submitting = useStore(form.store, (state) => state.isSubmitting)
  const words = {
    pause: { title: 'Pause this subscription', text: 'Periods that start while it is paused are skipped — not billed later.', label: 'Pause from', button: 'Pause' },
    resume: { title: 'Resume this subscription', text: 'Billing continues with the first period that starts on or after this day.', label: 'Resume on', button: 'Resume' },
    end: {
      title: 'End this subscription',
      text: 'The last day of service. Periods after it are not billed. Invoices already made stay as they are. Only you can end a subscription.',
      label: 'Last day',
      button: 'End subscription',
    },
  }[action]

  return (
    <BlogDialog labelledBy="sub-date-title" onClose={onClose} role={action === 'end' ? 'alertdialog' : 'dialog'} size="sm">
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <DialogTitle id="sub-date-title">{words.title}</DialogTitle>
        <p className="text-[13px] text-[var(--dash-quiet)]">{words.text}</p>
        <form.Field name="date">
          {(api) => {
            const error = api.state.meta.errors[0] as string | undefined

            return (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sub-date">{words.label}</Label>
                <input
                  id="sub-date"
                  type="date"
                  min={today}
                  className="dash-field h-10 px-2.5 text-[13px]"
                  value={api.state.value}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId('sub-date') : undefined}
                  onChange={(event) => api.handleChange(event.target.value)}
                />
                <FieldError id="sub-date" message={error} />
                {action === 'end' ? <Hint>Suggested: the day before the next period, so the current one runs out.</Hint> : null}
              </div>
            )
          }}
        </form.Field>
        {failure ? <DialogAlert>{failure}</DialogAlert> : null}
        <DialogActions>
          <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={cn('dash-btn', action === 'end' ? 'dash-tone-red' : 'dash-btn-primary')} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {words.button}
          </button>
        </DialogActions>
      </form>
    </BlogDialog>
  )
}

function PriceDialog({ sub, onClose }: { sub: OwnerSubscription; onClose: () => void }) {
  const from = nextPeriod(sub)
  const [failure, setFailure] = useState<string | null>(null)
  const run = useSubscriptionMutation(
    (input: { amountMinor: number; note: string }) =>
      changePrice(sub.id, { amountMinor: input.amountMinor, effectiveFrom: null, note: input.note, fx: null }),
    (result) => result,
  )
  const form = useForm({
    defaultValues: { amount: '', note: '' },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const amount = parseMoney(value.amount)

        if (amount === null || amount <= 0) return { fields: { amount: 'Enter the new price, like 59 or 59.90' } }

        return undefined
      },
    },
    onSubmitInvalid: () => window.requestAnimationFrame(() => document.getElementById('sub-price')?.focus()),
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        await run.mutateAsync({ amountMinor: parseMoney(value.amount) ?? 0, note: value.note.trim() })
        notify.success(`New price takes effect from ${formatDate(from)}`)
        onClose()
      } catch (caught) {
        setFailure(caught instanceof Error ? caught.message : 'Nothing was changed. Try again.')
      }
    },
  })
  const submitting = useStore(form.store, (state) => state.isSubmitting)

  return (
    <BlogDialog labelledBy="sub-price-title" onClose={onClose} size="sm">
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <DialogTitle id="sub-price-title">Change the price from the next period</DialogTitle>
        <p className="text-[13px] text-[var(--dash-quiet)]">
          Now {formatAmount(sub.currentAmountMinor, sub.currency)} {every(sub.interval)}. The new price starts on {formatDate(from)};
          periods already billed keep their price. Record that the client agreed.
        </p>
        <form.Field name="amount">
          {(api) => {
            const error = api.state.meta.errors[0] as string | undefined

            return (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sub-price">New price ({sub.currency})</Label>
                <input
                  id="sub-price"
                  inputMode="decimal"
                  className="dash-field dash-num h-10 px-3 text-[13px]"
                  value={api.state.value}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId('sub-price') : undefined}
                  onChange={(event) => api.handleChange(event.target.value)}
                />
                <FieldError id="sub-price" message={error} />
              </div>
            )
          }}
        </form.Field>
        <form.Field name="note">
          {(api) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sub-price-note" optional>
                Note
              </Label>
              <input
                id="sub-price-note"
                className="dash-field h-10 px-3 text-[13px]"
                placeholder="e.g. Agreed by email on 24 Sep"
                value={api.state.value}
                onChange={(event) => api.handleChange(event.target.value)}
              />
            </div>
          )}
        </form.Field>
        {failure ? <DialogAlert>{failure}</DialogAlert> : null}
        <DialogActions>
          <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Change price
          </button>
        </DialogActions>
      </form>
    </BlogDialog>
  )
}

type DiscountValues = { type: 'percent' | 'fixed'; value: string; length: 'one' | 'some' | 'always'; periods: string; note: string }

function DiscountDialog({ sub, onClose }: { sub: OwnerSubscription; onClose: () => void }) {
  const from = nextPeriod(sub)
  const [failure, setFailure] = useState<string | null>(null)
  const run = useSubscriptionMutation(
    (input: Parameters<typeof addDiscount>[1]) => addDiscount(sub.id, input),
    (result) => result,
  )
  const form = useForm({
    defaultValues: { type: 'percent', value: '', length: 'one', periods: '3', note: '' } as DiscountValues,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Partial<Record<keyof DiscountValues, string>> = {}
        const amount = value.type === 'percent' ? parsePercent(value.value) : parseMoney(value.value)

        if (amount === null || amount <= 0) fields.value = value.type === 'percent' ? 'Write it like 10 or 12.5' : 'Write it like 10 or 9.90'
        else if (value.type === 'percent' && amount > 10_000) fields.value = 'A discount cannot be more than 100 %'
        if (value.length === 'some') {
          const count = Number(value.periods)

          if (!/^\d{1,3}$/u.test(value.periods) || count < 1 || count > 120) fields.periods = 'Between 1 and 120 periods'
        }

        return Object.keys(fields).length === 0 ? undefined : { fields }
      },
    },
    onSubmitInvalid: () => window.requestAnimationFrame(() => document.querySelector<HTMLElement>('#discount-form [aria-invalid="true"]')?.focus()),
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        await run.mutateAsync({
          discountType: value.type,
          value: (value.type === 'percent' ? parsePercent(value.value) : parseMoney(value.value)) ?? 0,
          periods: value.length === 'one' ? 1 : value.length === 'some' ? Number(value.periods) : null,
          startsOn: null,
          note: value.note.trim(),
        })
        notify.success(`Discount added from ${formatDate(from)}`)
        onClose()
      } catch (caught) {
        setFailure(caught instanceof Error ? caught.message : 'Nothing was changed. Try again.')
      }
    },
  })
  const values = useStore(form.store, (state) => state.values)
  const submitting = useStore(form.store, (state) => state.isSubmitting)

  return (
    <BlogDialog labelledBy="discount-title" onClose={onClose} size="sm">
      <form
        id="discount-form"
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <DialogTitle id="discount-title">Add a discount</DialogTitle>
        <p className="text-[13px] text-[var(--dash-quiet)]">
          From the next billed period ({formatDate(from)}). Free periods do not use it up.
        </p>
        <div className="flex flex-wrap items-start gap-2">
          <form.Field name="type">
            {(api) => (
              <Segmented label="Kind of discount" value={api.state.value} onChange={(next) => api.handleChange(next)} options={[['percent', 'Percent'], ['fixed', 'Amount']]} />
            )}
          </form.Field>
          <form.Field name="value">
            {(api) => {
              const error = api.state.meta.errors[0] as string | undefined

              return (
                <span className="flex flex-col gap-1">
                  <label htmlFor="discount-value" className="sr-only">
                    Discount {values.type === 'percent' ? 'in percent' : `in ${sub.currency}`}
                  </label>
                  <span className="flex items-center gap-1.5">
                    <input
                      id="discount-value"
                      inputMode="decimal"
                      className="dash-field dash-num h-9 w-28 px-2.5 text-[13px]"
                      value={api.state.value}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId('discount-value') : undefined}
                      onChange={(event) => api.handleChange(event.target.value)}
                    />
                    <span className="text-[12.5px] text-[var(--dash-quiet)]">{values.type === 'percent' ? '%' : sub.currency}</span>
                  </span>
                  <FieldError id="discount-value" message={error} />
                </span>
              )
            }}
          </form.Field>
        </div>
        <form.Field name="length">
          {(api) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="discount-length">For how long</Label>
              <select
                id="discount-length"
                className="dash-field h-10 px-2.5 text-[13px]"
                value={api.state.value}
                onChange={(event) => api.handleChange(event.target.value as DiscountValues['length'])}
              >
                <option value="one">For 1 period</option>
                <option value="some">For a number of periods</option>
                <option value="always">Always</option>
              </select>
            </div>
          )}
        </form.Field>
        {values.length === 'some' ? (
          <form.Field name="periods">
            {(api) => {
              const error = api.state.meta.errors[0] as string | undefined

              return (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="discount-periods">Number of billed periods</Label>
                  <input
                    id="discount-periods"
                    inputMode="numeric"
                    className="dash-field dash-num h-10 w-24 px-3 text-[13px]"
                    value={api.state.value}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId('discount-periods') : undefined}
                    onChange={(event) => api.handleChange(event.target.value)}
                  />
                  <FieldError id="discount-periods" message={error} />
                </div>
              )
            }}
          </form.Field>
        ) : null}
        {failure ? <DialogAlert>{failure}</DialogAlert> : null}
        <DialogActions>
          <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Add discount
          </button>
        </DialogActions>
      </form>
    </BlogDialog>
  )
}

function FreeDialog({ sub, onClose }: { sub: OwnerSubscription; onClose: () => void }) {
  const from = nextPeriod(sub)
  const [failure, setFailure] = useState<string | null>(null)
  const run = useSubscriptionMutation(
    (input: { startsOn: string; endsOn: string | null }) => addFreePeriod(sub.id, { ...input, note: '' }),
    (result) => result,
  )
  const form = useForm({
    defaultValues: { startsOn: from, endsOn: '' },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Record<string, string> = {}

        if (!/^\d{4}-\d{2}-\d{2}$/u.test(value.startsOn)) fields.startsOn = 'Choose the first free day'
        else if (value.startsOn < berlinToday()) fields.startsOn = 'Choose today or later'
        if (value.endsOn && value.endsOn < value.startsOn) fields.endsOn = 'It cannot end before it starts'

        return Object.keys(fields).length === 0 ? undefined : { fields }
      },
    },
    onSubmitInvalid: () => window.requestAnimationFrame(() => document.querySelector<HTMLElement>('#free-form [aria-invalid="true"]')?.focus()),
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        await run.mutateAsync({ startsOn: value.startsOn, endsOn: value.endsOn || null })
        notify.success('Free period added — no invoice is made for it')
        onClose()
      } catch (caught) {
        setFailure(caught instanceof Error ? caught.message : 'Nothing was changed. Try again.')
      }
    },
  })
  const submitting = useStore(form.store, (state) => state.isSubmitting)

  return (
    <BlogDialog labelledBy="free-title" onClose={onClose} size="sm">
      <form
        id="free-form"
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <DialogTitle id="free-title">Add a free period</DialogTitle>
        <p className="text-[13px] text-[var(--dash-quiet)]">Periods that start inside it are free: no invoice is made for them.</p>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ['startsOn', 'From'],
              ['endsOn', 'Until (empty = indefinitely)'],
            ] as const
          ).map(([name, label]) => (
            <form.Field key={name} name={name}>
              {(api) => {
                const error = api.state.meta.errors[0] as string | undefined
                const id = `free-${name}`

                return (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={id}>{label}</Label>
                    <input
                      id={id}
                      type="date"
                      min={berlinToday()}
                      className="dash-field h-10 px-2.5 text-[13px]"
                      value={api.state.value}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId(id) : undefined}
                      onChange={(event) => api.handleChange(event.target.value)}
                    />
                    <FieldError id={id} message={error} />
                  </div>
                )
              }}
            </form.Field>
          ))}
        </div>
        {failure ? <DialogAlert>{failure}</DialogAlert> : null}
        <DialogActions>
          <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Add free period
          </button>
        </DialogActions>
      </form>
    </BlogDialog>
  )
}

/* --------------------------------------------------------------- the file */

const OUTCOME: Record<string, string> = {
  invoiced: 'invoiced',
  free: 'free — no invoice',
  paused: 'paused — skipped',
  after_end: 'after the end',
}

function Periods({ sub }: { sub: OwnerSubscription }) {
  const [page, setPage] = useState(1)
  const periods = usePeriods(sub.id, page)

  if (periods.isError) {
    return <LoadFailure title="Periods could not be loaded" message="Nothing has been changed." onRetry={() => void periods.refetch()} />
  }

  if (!periods.data) return <span className="dash-skeleton block h-10 w-full rounded" />

  if (periods.data.items.length === 0) {
    return (
      <p className="text-[12.5px] text-[var(--dash-quiet)]">
        No period has started yet{sub.nextPeriodStart ? ` — the first starts on ${formatDate(sub.nextPeriodStart)}` : ''}.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="inv-timeline">
        {periods.data.items.map((period) => (
          <li key={period.index}>
            <span className="inv-dot" data-tone={period.outcome === 'invoiced' ? 'ok' : undefined} />
            <span className="min-w-0">
              {formatDate(period.periodStart)} – {formatDate(period.periodEnd)}
              <small className="block text-[12px] text-[var(--dash-quiet)]">
                {OUTCOME[period.outcome] ?? period.outcome}
                {period.discountMinor > 0 ? ` · ${formatAmount(period.discountMinor, sub.currency)} discount` : ''}
                {period.invoiceId ? (
                  <>
                    {' · '}
                    <Link to="/dashboard/invoices/$invoiceId" params={{ invoiceId: period.invoiceId }} className="font-semibold text-[var(--dash-blue-ink)] hover:underline">
                      open the invoice
                    </Link>
                  </>
                ) : null}
              </small>
            </span>
            <span className="dash-num font-semibold">{period.outcome === 'invoiced' ? formatAmount(period.amountMinor, sub.currency) : '—'}</span>
          </li>
        ))}
      </ul>
      <Pager page={periods.data.page} pageCount={periods.data.pageCount} total={periods.data.total} noun={['period', 'periods']} onPage={setPage} />
    </div>
  )
}

export function SubscriptionFile({
  subscriptionId,
  mode,
  onClose,
}: {
  subscriptionId: string
  mode: 'panel' | 'page'
  onClose: () => void
}) {
  const query = useSubscription(subscriptionId)
  const [action, setAction] = useState<Action>(null)
  const endDiscountMutation = useSubscriptionMutation(
    (discountId: string) => endDiscount(subscriptionId, discountId),
    (result) => result,
  )

  if (query.isError) {
    const missing = query.error instanceof ApiRequestError && (query.error.status === 404 || query.error.status === 422)

    return (
      <section className="dash-panel">
        {missing ? (
          <div className="flex flex-col items-start gap-3 p-8">
            <h2 className="text-sm font-semibold">That subscription does not exist</h2>
            <button type="button" className="dash-btn dash-btn-quiet" onClick={onClose}>
              All subscriptions
            </button>
          </div>
        ) : (
          <LoadFailure title="This subscription could not be loaded" message="Nothing has been changed." onRetry={() => void query.refetch()} />
        )}
      </section>
    )
  }

  if (!query.data) {
    return (
      <section className="dash-panel flex flex-col gap-3 p-6" aria-busy="true" aria-label="Loading subscription">
        <span className="dash-skeleton h-12 w-full rounded" />
        <span className="dash-skeleton h-32 w-full rounded" />
      </section>
    )
  }

  const sub = query.data
  const ended = sub.status === 'ended'
  const anchor = Number(sub.startDate.slice(8, 10))
  const today = berlinToday()
  const upcoming = sub.terms.filter((term) => term.effectiveFrom > today)
  const origin = sub.service
    ? `The service “${sub.service.name}”${sub.service.priceMinor !== null ? ` at ${formatAmount(sub.service.priceMinor, 'EUR')}` : ''}, copied on ${formatDay(sub.createdAt)}`
    : `A custom price agreed on ${formatDay(sub.createdAt)}`

  return (
    <section className="dash-panel" aria-labelledby="sub-file-title">
      <div className="flex flex-col gap-3 border-b border-[var(--dash-line)] px-5 py-4.5">
        {mode === 'page' ? (
          <button type="button" className="dash-btn dash-btn-ghost -ms-2 h-8 self-start px-2 text-[12.5px]" onClick={onClose}>
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            All subscriptions
          </button>
        ) : null}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="sub-file-title" className="dash-title text-[24px] [overflow-wrap:anywhere]">
              {sub.client.displayName}
            </h2>
            <p className="mt-1 text-[12.5px] text-[var(--dash-quiet)]">
              {sub.description} · {formatAmount(sub.currentAmountMinor, sub.currency)} {every(sub.interval)} · collected on day {anchor}
              {anchor > 28 ? ' (or the month’s last day)' : ''}
            </p>
          </div>
          {mode === 'panel' ? (
            <button type="button" className="dash-btn dash-btn-ghost h-8 w-8 px-0" aria-label="Close" onClick={onClose}>
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <TestChip mode={sub.mode} />
          <SubscriptionChip state={subscriptionState(sub)} />
          <StatusChip tone="outline">{sub.collection === 'automatic_card' ? 'Card, automatic' : 'You review each draft'}</StatusChip>
        </div>
        {ended ? (
          <p className="text-[12.5px] text-[var(--dash-quiet)]">Ended{sub.endsOn ? ` — the last day of service is ${formatDate(sub.endsOn)}` : ''}. Nothing more is billed.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sub.status === 'paused' ? (
              <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12.5px]" onClick={() => setAction('resume')}>
                <Play className="size-3.5" aria-hidden="true" />
                Resume
              </button>
            ) : (
              <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12.5px]" onClick={() => setAction('pause')}>
                <Pause className="size-3.5" aria-hidden="true" />
                Pause
              </button>
            )}
            <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12.5px]" onClick={() => setAction('price')}>
              <Pencil className="size-3.5" aria-hidden="true" />
              Change price from next period
            </button>
            <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12.5px]" onClick={() => setAction('discount')}>
              <Percent className="size-3.5" aria-hidden="true" />
              Discount
            </button>
            <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12.5px]" onClick={() => setAction('free')}>
              <CalendarOff className="size-3.5" aria-hidden="true" />
              Free period
            </button>
            <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12.5px] text-[var(--dash-red-ink)]" onClick={() => setAction('end')}>
              <Square className="size-3.5" aria-hidden="true" />
              End
            </button>
          </div>
        )}
      </div>

      <Section title="HOW IT IS COLLECTED">
        <Collection sub={sub} />
      </Section>

      <Section title="AGREED TERMS">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-y-2.5">
          <dt className="text-[var(--dash-quiet)]">Price</dt>
          <dd className="mb-2 sm:mb-0">
            {formatAmount(sub.currentAmountMinor, sub.currency)} {every(sub.interval)}
            {upcoming.map((term) => (
              <span key={term.effectiveFrom} className="block text-[12px] text-[var(--dash-quiet)]">
                {formatAmount(term.amountMinor, sub.currency)} from {formatDate(term.effectiveFrom)}
                {term.note ? ` · ${term.note}` : ''}
              </span>
            ))}
          </dd>
          <dt className="text-[var(--dash-quiet)]">Came from</dt>
          <dd className="mb-2 sm:mb-0">
            {origin}
            {sub.fx ? (
              <span className="block text-[12px] text-[var(--dash-quiet)]">
                Converted at 1 EUR = {sub.fx.rate} USD ({sub.fx.source === 'ecb' ? 'European Central Bank' : 'your rate'},{' '}
                {formatDate(sub.fx.rateDate)}). The dollar price stays fixed until you change it.
              </span>
            ) : null}
          </dd>
          <dt className="text-[var(--dash-quiet)]">Discounts</dt>
          <dd className="mb-2 flex flex-col gap-1 sm:mb-0">
            {sub.discounts.length === 0
              ? 'None'
              : sub.discounts.map((discount) => {
                  const done = discount.endedAt !== null || (discount.periods !== null && discount.appliedCount >= discount.periods)

                  return (
                    <span key={discount.id} className={cn('flex flex-wrap items-center gap-2', done && 'text-[var(--dash-quiet)]')}>
                      {discount.discountType === 'percent' ? `${bpToText(discount.value)} %` : formatAmount(discount.value, sub.currency)} off
                      {discount.periods === null ? ', always' : `, ${discount.periods} ${discount.periods === 1 ? 'period' : 'periods'}`}
                      {` from ${formatDate(discount.startsOn)} · used ${discount.appliedCount}`}
                      {done ? ' · finished' : null}
                      {!done && !ended ? (
                        <button
                          type="button"
                          className="dash-btn dash-btn-ghost h-7 px-2 text-[12px]"
                          disabled={endDiscountMutation.isPending}
                          onClick={async () => {
                            try {
                              await endDiscountMutation.mutateAsync(discount.id)
                              notify.success('Discount ended — later periods are billed in full')
                            } catch {
                              // The mutation cache already said why.
                            }
                          }}
                        >
                          End discount
                        </button>
                      ) : null}
                    </span>
                  )
                })}
          </dd>
          <dt className="text-[var(--dash-quiet)]">Free</dt>
          <dd className="mb-2 sm:mb-0">
            {sub.freePeriods.length === 0
              ? 'No free periods'
              : sub.freePeriods.map((range) => (
                  <span key={range.id} className="block">
                    {range.endsOn ? `${formatDate(range.startsOn)} – ${formatDate(range.endsOn)}` : `From ${formatDate(range.startsOn)}, indefinitely`}
                  </span>
                ))}
          </dd>
          {sub.pauses.length > 0 ? (
            <>
              <dt className="text-[var(--dash-quiet)]">Paused</dt>
              <dd className="mb-2 sm:mb-0">
                {sub.pauses.map((pause) => (
                  <span key={pause.startsOn} className="block">
                    {pause.endsOn ? `${formatDate(pause.startsOn)} – ${formatDate(pause.endsOn)}` : `Since ${formatDate(pause.startsOn)}`}
                  </span>
                ))}
              </dd>
            </>
          ) : null}
          <dt className="text-[var(--dash-quiet)]">Next period</dt>
          <dd>{sub.nextPeriodStart ? formatDate(sub.nextPeriodStart) : 'None — it has ended'}</dd>
        </dl>
        <p className="mt-2.5 text-[12px] text-[var(--dash-quiet)]">
          Editing the service later never changes this price. Your own changes start with the next period.
        </p>
      </Section>

      <Section title="PERIODS">
        <Periods sub={sub} />
      </Section>

      {action === 'pause' || action === 'resume' || action === 'end' ? (
        <DateDialog sub={sub} action={action} onClose={() => setAction(null)} />
      ) : null}
      {action === 'price' ? <PriceDialog sub={sub} onClose={() => setAction(null)} /> : null}
      {action === 'discount' ? <DiscountDialog sub={sub} onClose={() => setAction(null)} /> : null}
      {action === 'free' ? <FreeDialog sub={sub} onClose={() => setAction(null)} /> : null}
    </section>
  )
}
