import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import { ArrowLeft, Building2, Info, Loader2, Lock, Plus, User } from 'lucide-react'
import type { OwnerServiceListItem } from '#/backend2/contracts/service.contract'
import { berlinToday } from '#/backend2/contracts/invoice-dates.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage, PageHead } from '#/frontend/dashboard/primitives'
import { addDiscount, createSubscription, proposeRate } from '#/frontend/features/invoices-v2/api'
import { ClientPicker } from '#/frontend/features/invoices-v2/ClientPicker'
import { toUsd } from '#/frontend/features/invoices-v2/invoice-form'
import { useInvoiceMode } from '#/frontend/features/invoices-v2/mode'
import { formatAmount, formatDate, minorToText, parseMoney } from '#/frontend/features/invoices-v2/money'
import { useSubscriptionMutation } from '#/frontend/features/invoices-v2/queries'
import { ServiceDialog } from '#/frontend/features/invoices-v2/ServiceDialog'
import {
  type SubscriptionFormValues,
  discountOfForm,
  emptySubscriptionForm,
  formToSubscription,
  subscriptionErrors,
} from '#/frontend/features/invoices-v2/subscription-form'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { Banner, FieldError, Hint, Label, SectionNav, Segmented, TestBar, errorId } from './invoice-parts'

/**
 * Starting a subscription, approved in the Invoices Design Lab (24 Sep 2026):
 * four short groups instead of one long form. Choosing a service copies its
 * name and price once; the owner can overwrite both, and later catalogue
 * changes never reach this agreement. Only the owner starts one — there is no
 * public sign-up.
 */

const focusFirstInvalid = () =>
  window.requestAnimationFrame(() => document.querySelector<HTMLElement>('#subscription-form [aria-invalid="true"]')?.focus())

function Legend({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <legend className="dash-eyebrow-quiet mb-3">
      {children}
      {optional ? <span className="font-normal tracking-normal"> · optional</span> : null}
    </legend>
  )
}

export function NewSubscriptionPage() {
  const navigate = useNavigate()
  const today = berlinToday()
  const { mode, settings } = useInvoiceMode()
  const [client, setClient] = useState<{ name: string; detail: string; kind: 'person' | 'company' } | null>(null)
  const [service, setService] = useState<{ name: string; priceMinor: number | null } | null>(null)
  const [picking, setPicking] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [rate, setRate] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  const create = useSubscriptionMutation(createSubscription, (result) => result)
  const [initial] = useState(() => emptySubscriptionForm(today, settings.data?.defaultLanguage))

  const form = useForm({
    defaultValues: initial,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields = subscriptionErrors(value, today)

        return Object.keys(fields).length === 0 ? undefined : { fields }
      },
    },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        const created = await create.mutateAsync(formToSubscription(value, mode))
        const discount = discountOfForm(value)

        if (discount) {
          try {
            await addDiscount(created.id, { ...discount, startsOn: value.startDate, note: 'Agreed at the start' })
          } catch (caught) {
            notify.error(`The subscription started, but the discount was not added: ${caught instanceof Error ? caught.message : 'try again in its file'}`)
          }
        }

        notify.success('Subscription started')
        void navigate({ to: '/dashboard/invoices/subscriptions', search: { sub: created.id } })
      } catch (caught) {
        setFailure(caught instanceof ApiRequestError ? caught.message : 'The subscription could not be started. Nothing was saved.')
      }
    },
  })

  const values = useStore(form.store, (state) => state.values)
  const submitting = useStore(form.store, (state) => state.isSubmitting)
  const anchor = Number(values.startDate.slice(8, 10))

  const convert = async (to: 'EUR' | 'USD', rateText?: string) => {
    form.setFieldValue('currency', to)

    if (to === 'EUR') {
      const eur = form.getFieldValue('eurMinor')

      if (eur !== null) form.setFieldValue('amount', minorToText(eur))
      form.setFieldValue('eurMinor', null)
      form.setFieldValue('fx', null)
      setRate({ busy: false, error: null })

      return
    }

    setRate({ busy: true, error: null })

    try {
      const proposal = await proposeRate({ amountMinor: 100, ...(rateText ? { rate: rateText } : {}) })
      const eur = form.getFieldValue('eurMinor') ?? parseMoney(form.getFieldValue('amount'))

      form.setFieldValue('fx', { rateId: proposal.rateId, rate: proposal.rate, rateDate: proposal.rateDate, source: proposal.source })

      if (eur !== null) {
        form.setFieldValue('eurMinor', eur)
        form.setFieldValue('amount', minorToText(toUsd(eur, proposal.rate) ?? eur))
      }

      setRate({ busy: false, error: null })
    } catch (caught) {
      setRate({
        busy: false,
        error:
          caught instanceof ApiRequestError && caught.code === 'FX_UNAVAILABLE'
            ? 'No recent rate from the European Central Bank. Type the agreed dollar price yourself.'
            : caught instanceof Error
              ? caught.message
              : 'The rate could not be checked.',
      })
    }
  }

  const applyService = (picked: OwnerServiceListItem) => {
    const eur = picked.price.amountCents
    const fx = form.getFieldValue('fx')

    setService({ name: picked.displayName, priceMinor: eur })
    form.setFieldValue('serviceId', picked.id)
    if (!form.getFieldValue('description').trim()) form.setFieldValue('description', picked.displayName)

    if (eur !== null) {
      if (form.getFieldValue('currency') === 'USD' && fx) {
        form.setFieldValue('eurMinor', eur)
        form.setFieldValue('amount', minorToText(toUsd(eur, fx.rate) ?? eur))
      } else {
        form.setFieldValue('amount', minorToText(eur))
      }
    }

    if (picked.price.period === 'yearly') form.setFieldValue('interval', 'yearly')
    if (picked.price.period === 'monthly') form.setFieldValue('interval', 'monthly')
    setPicking(false)
  }

  const errorOf = (errors: unknown[]) => errors[0] as string | undefined

  return (
    <DashboardPage className="inv mx-auto max-w-[60rem] gap-4">
      <PageHead
        eyebrow="MONEY · NEW SUBSCRIPTION"
        title="New subscription"
        description="For something you agreed with the client. Only you can start, change or end it."
        actions={
          <Link to="/dashboard/invoices/subscriptions" className="dash-btn dash-btn-ghost">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Subscriptions
          </Link>
        }
      />
      <TestBar mode={mode} />
      <SectionNav current="subscriptions" />

      <form
        id="subscription-form"
        noValidate
        className="dash-panel flex flex-col gap-6 p-5 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        {failure ? (
          <p role="alert" className="dash-tone-red rounded-lg px-3.5 py-2.5 text-[12.5px]">
            {failure}
          </p>
        ) : null}

        <fieldset className="flex flex-col gap-3.5">
          <Legend>WHO AND WHAT</Legend>
          <form.Field name="clientId">
            {(api) => {
              const error = errorOf(api.state.meta.errors)

              return client ? (
                <div className="flex items-center gap-3 rounded-[10px] border border-[var(--dash-line)] px-3 py-2.5">
                  <span
                    aria-hidden="true"
                    className={cn('grid size-8 shrink-0 place-items-center rounded-[9px]', client.kind === 'company' ? 'dash-tone-blue rounded-[7px]' : 'dash-tone-grey')}
                  >
                    {client.kind === 'company' ? <Building2 className="size-4" /> : <User className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1 text-[12.5px] text-[var(--dash-quiet)]">
                    <strong className="block truncate text-[13.5px] text-[var(--dash-ink)]">{client.name}</strong>
                    {client.detail}
                  </span>
                  <button
                    type="button"
                    className="dash-btn dash-btn-ghost h-8 text-[12.5px]"
                    onClick={() => {
                      setClient(null)
                      api.handleChange('')
                    }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sub-client">Client</Label>
                  <ClientPicker
                    id="sub-client"
                    invalid={Boolean(error)}
                    describedBy={error ? errorId('sub-client') : undefined}
                    onPick={(picked) => {
                      setClient({
                        name: picked.displayName,
                        kind: picked.kind,
                        detail: [picked.country.name, picked.email].join(' · '),
                      })
                      api.handleChange(picked.id)
                    }}
                  />
                  <FieldError id="sub-client" message={error} />
                  <Hint>
                    Not a client yet?{' '}
                    <Link to="/dashboard/clients/new" className="font-semibold text-[var(--dash-blue-ink)] hover:underline">
                      Add them in Clients
                    </Link>{' '}
                    first — the billing address is taken from their last invoice.
                  </Hint>
                </div>
              )
            }}
          </form.Field>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold">
              Start from a service <span className="font-normal text-[var(--dash-quiet)]">(optional)</span>
            </span>
            {service ? (
              <span className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <Lock className="size-3.5 text-[var(--dash-quiet)]" aria-hidden="true" />
                “{service.name}”{service.priceMinor !== null ? `, ${formatAmount(service.priceMinor, 'EUR')}` : ''} — copied now; later
                catalogue changes do not touch this subscription.
                <button
                  type="button"
                  className="dash-btn dash-btn-ghost h-7 px-2 text-[12px]"
                  onClick={() => {
                    setService(null)
                    form.setFieldValue('serviceId', null)
                  }}
                >
                  Custom agreement instead
                </button>
              </span>
            ) : (
              <button type="button" className="dash-btn dash-btn-quiet h-9 self-start text-[12.5px]" onClick={() => setPicking(true)}>
                <Plus className="size-3.5" aria-hidden="true" />
                Choose a service
              </button>
            )}
          </div>

          <div className="inv-grid2">
            <form.Field name="description">
              {(api) => {
                const error = errorOf(api.state.meta.errors)

                return (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="sub-description">Name on the invoice</Label>
                    <input
                      id="sub-description"
                      className="dash-field h-10 px-3 text-[13px]"
                      placeholder="Website care"
                      value={api.state.value}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId('sub-description') : undefined}
                      onChange={(event) => api.handleChange(event.target.value)}
                      onBlur={api.handleBlur}
                    />
                    <FieldError id="sub-description" message={error} />
                  </div>
                )
              }}
            </form.Field>
            <form.Field name="amount">
              {(api) => {
                const error = errorOf(api.state.meta.errors)

                return (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="sub-amount">Agreed price, net</Label>
                    <span className="flex items-center gap-2">
                      <input
                        id="sub-amount"
                        inputMode="decimal"
                        className="dash-field dash-num h-10 min-w-0 flex-1 px-3 text-[13px]"
                        placeholder="49.00"
                        value={api.state.value}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? errorId('sub-amount') : undefined}
                        onChange={(event) => {
                          api.handleChange(event.target.value)
                          form.setFieldValue('eurMinor', null)
                        }}
                        onBlur={api.handleBlur}
                      />
                      <Segmented label="Currency" value={values.currency} onChange={(next) => void convert(next)} options={[['EUR', 'EUR'], ['USD', 'USD']]} />
                    </span>
                    <FieldError id="sub-amount" message={error} />
                  </div>
                )
              }}
            </form.Field>
          </div>
          {values.currency === 'USD' ? (
            <Banner tone="info" icon={rate.busy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Info className="size-4 shrink-0" aria-hidden="true" />}>
              {rate.error
                ? rate.error
                : values.fx
                  ? `Proposed from euros at 1 EUR = ${values.fx.rate} USD (${values.fx.source === 'ecb' ? 'European Central Bank' : 'your rate'}, ${formatDate(values.fx.rateDate)}). Change the price if you agreed another — the dollar price then stays fixed until you change it.`
                  : 'Checking the rate…'}
            </Banner>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-3.5">
          <Legend>WHEN</Legend>
          <div className="inv-grid2">
            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold">Every</span>
              <form.Field name="interval">
                {(api) => (
                  <Segmented label="Billing period" value={api.state.value} onChange={(next) => api.handleChange(next)} options={[['monthly', 'Month'], ['yearly', 'Year']]} />
                )}
              </form.Field>
            </div>
            <form.Field name="startDate">
              {(api) => {
                const error = errorOf(api.state.meta.errors)

                return (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="sub-start">First collection date</Label>
                    <input
                      id="sub-start"
                      type="date"
                      min={today}
                      className="dash-field h-10 px-2.5 text-[13px]"
                      value={api.state.value}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={cn(error && errorId('sub-start'), 'sub-start-hint')}
                      onChange={(event) => api.handleChange(event.target.value)}
                    />
                    <FieldError id="sub-start" message={error} />
                    <Hint id="sub-start-hint">
                      {anchor > 28 ? `On the ${anchor}th: shorter months use their last day.` : 'Each period starts on this day of the month.'}
                    </Hint>
                  </div>
                )
              }}
            </form.Field>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <Legend>HOW IT IS COLLECTED</Legend>
          <form.Field name="collection">
            {(api) => (
              <div role="radiogroup" aria-label="Collection" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <label className="inv-choice">
                  <input type="radio" name="collection" checked={api.state.value === 'manual'} onChange={() => api.handleChange('manual')} />
                  <span>
                    <b className="block">I review each period</b>
                    <small className="text-[12px] text-[var(--dash-quiet)]">
                      A draft is prepared 7 days before each period; you issue and send it. Bank transfer or a one-time Stripe link.
                    </small>
                  </span>
                </label>
                <label className="inv-choice">
                  <input
                    type="radio"
                    name="collection"
                    checked={api.state.value === 'automatic_card'}
                    onChange={() => api.handleChange('automatic_card')}
                  />
                  <span>
                    <b className="block">Card, automatic</b>
                    <small className="text-[12px] text-[var(--dash-quiet)]">
                      The client saves a card with Stripe and agrees. Each period is charged, issued and sent without you.
                    </small>
                  </span>
                </label>
              </div>
            )}
          </form.Field>
          {values.collection === 'manual' ? (
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
              <form.Field name="allowBank">
                {(api) => (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="accent-[var(--dash-brand)]" checked={api.state.value} onChange={(event) => api.handleChange(event.target.checked)} />
                    Bank transfer
                  </label>
                )}
              </form.Field>
              <form.Field name="allowStripe">
                {(api) => (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="accent-[var(--dash-brand)]" checked={api.state.value} onChange={(event) => api.handleChange(event.target.checked)} />
                    One-time Stripe link
                  </label>
                )}
              </form.Field>
            </div>
          ) : (
            <Hint>After starting it, create the secure card link in its file and send it to the client.</Hint>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-semibold">Invoice language</span>
            <form.Field name="language">
              {(api) => (
                <Segmented label="Invoice language" value={api.state.value} onChange={(next) => api.handleChange(next)} options={[['de', 'German'], ['en', 'English']]} />
              )}
            </form.Field>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3.5">
          <Legend optional>DISCOUNT OR FREE START</Legend>
          <div className="inv-grid2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="sub-discount-type">Discount</Label>
              <span className="flex flex-wrap gap-2">
                <form.Field name="discountType">
                  {(api) => (
                    <select
                      id="sub-discount-type"
                      className="dash-field h-10 min-w-0 flex-1 px-2.5 text-[13px]"
                      value={api.state.value}
                      onChange={(event) => api.handleChange(event.target.value as SubscriptionFormValues['discountType'])}
                    >
                      <option value="none">None</option>
                      <option value="percent">Percent</option>
                      <option value="fixed">Fixed amount</option>
                    </select>
                  )}
                </form.Field>
                {values.discountType !== 'none' ? (
                  <form.Field name="discountLength">
                    {(api) => (
                      <select
                        aria-label="For how long"
                        className="dash-field h-10 min-w-0 flex-1 px-2.5 text-[13px]"
                        value={api.state.value}
                        onChange={(event) => api.handleChange(event.target.value as SubscriptionFormValues['discountLength'])}
                      >
                        <option value="one">For 1 period</option>
                        <option value="some">For a number of periods</option>
                        <option value="always">Always</option>
                      </select>
                    )}
                  </form.Field>
                ) : null}
              </span>
              {values.discountType !== 'none' ? (
                <span className="flex flex-wrap items-start gap-2">
                  <form.Field name="discountValue">
                    {(api) => {
                      const error = errorOf(api.state.meta.errors)

                      return (
                        <span className="flex flex-col gap-1">
                          <span className="flex items-center gap-1.5">
                            <input
                              aria-label={values.discountType === 'percent' ? 'Discount in percent' : `Discount in ${values.currency}`}
                              id="sub-discount-value"
                              inputMode="decimal"
                              className="dash-field dash-num h-9 w-24 px-2.5 text-[13px]"
                              value={api.state.value}
                              aria-invalid={error ? true : undefined}
                              aria-describedby={error ? errorId('sub-discount-value') : undefined}
                              onChange={(event) => api.handleChange(event.target.value)}
                            />
                            <span className="text-[12.5px] text-[var(--dash-quiet)]">{values.discountType === 'percent' ? '%' : values.currency}</span>
                          </span>
                          <FieldError id="sub-discount-value" message={error} />
                        </span>
                      )
                    }}
                  </form.Field>
                  {values.discountLength === 'some' ? (
                    <form.Field name="discountPeriods">
                      {(api) => {
                        const error = errorOf(api.state.meta.errors)

                        return (
                          <span className="flex flex-col gap-1">
                            <span className="flex items-center gap-1.5">
                              <input
                                aria-label="Number of billed periods"
                                id="sub-discount-periods"
                                inputMode="numeric"
                                className="dash-field dash-num h-9 w-16 px-2.5 text-[13px]"
                                value={api.state.value}
                                aria-invalid={error ? true : undefined}
                                aria-describedby={error ? errorId('sub-discount-periods') : undefined}
                                onChange={(event) => api.handleChange(event.target.value)}
                              />
                              <span className="text-[12.5px] text-[var(--dash-quiet)]">periods</span>
                            </span>
                            <FieldError id="sub-discount-periods" message={error} />
                          </span>
                        )
                      }}
                    </form.Field>
                  ) : null}
                </span>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="sub-free">Free start</Label>
              <span className="flex flex-wrap items-start gap-2">
                <form.Field name="free">
                  {(api) => (
                    <select
                      id="sub-free"
                      className="dash-field h-10 min-w-0 flex-1 px-2.5 text-[13px]"
                      value={api.state.value}
                      onChange={(event) => api.handleChange(event.target.value as SubscriptionFormValues['free'])}
                    >
                      <option value="none">No free periods</option>
                      <option value="some">The first periods are free</option>
                      <option value="always">Free, indefinitely</option>
                    </select>
                  )}
                </form.Field>
                {values.free === 'some' ? (
                  <form.Field name="freeCount">
                    {(api) => {
                      const error = errorOf(api.state.meta.errors)

                      return (
                        <span className="flex flex-col gap-1">
                          <span className="flex items-center gap-1.5">
                            <input
                              aria-label="How many free periods"
                              id="sub-free-count"
                              inputMode="numeric"
                              className="dash-field dash-num h-10 w-16 px-2.5 text-[13px]"
                              value={api.state.value}
                              aria-invalid={error ? true : undefined}
                              aria-describedby={error ? errorId('sub-free-count') : undefined}
                              onChange={(event) => api.handleChange(event.target.value)}
                            />
                            <span className="text-[12.5px] text-[var(--dash-quiet)]">periods</span>
                          </span>
                          <FieldError id="sub-free-count" message={error} />
                        </span>
                      )
                    }}
                  </form.Field>
                ) : null}
              </span>
              <Hint>No invoice is made for free periods.</Hint>
            </div>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--dash-line)] pt-4">
          <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {submitting ? 'Starting…' : 'Start subscription'}
          </button>
          <Link to="/dashboard/invoices/subscriptions" className="dash-btn dash-btn-ghost">
            Cancel
          </Link>
        </div>
      </form>

      {picking ? <ServiceDialog title="Start from a service" period="recurring" onPick={applyService} onClose={() => setPicking(false)} /> : null}
    </DashboardPage>
  )
}
