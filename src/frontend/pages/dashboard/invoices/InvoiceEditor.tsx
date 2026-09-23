import { useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CreditCard,
  Info,
  Landmark,
  Loader2,
  Lock,
  Plus,
  Trash2,
  User,
} from 'lucide-react'
import type { OwnerServiceListItem } from '#/backend2/contracts/service.contract'
import { addDays, berlinToday } from '#/backend2/contracts/invoice-dates.contract'
import type { InvoiceMode, InvoiceSettings, OwnerInvoice } from '#/backend2/contracts/invoice.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage, PageHead } from '#/frontend/dashboard/primitives'
import { ConfirmDialog } from '#/frontend/features/blog-v2/BlogDialog'
import { listInvoices, readInvoice, proposeRate, createInvoice, patchInvoice, deleteDraft } from '#/frontend/features/invoices-v2/api'
import { readClient } from '#/frontend/features/clients/api'
import { ClientPicker } from '#/frontend/features/invoices-v2/ClientPicker'
import {
  type FxValues,
  type InvoiceFormValues,
  type LineValues,
  type RecipientValues,
  draftErrors,
  dueDateOf,
  emptyInvoiceForm,
  emptyLine,
  formToDraft,
  invoiceToForm,
  issueErrors,
  newKey,
  planMeter,
  planSumOf,
  splitEvenly,
  toUsd,
  totalsOf,
} from '#/frontend/features/invoices-v2/invoice-form'
import { formatAmount, formatDate, formatMoment, minorToText, parseMoney } from '#/frontend/features/invoices-v2/money'
import { QuickClient } from '#/frontend/features/invoices-v2/QuickClient'
import { useInvoiceMutation } from '#/frontend/features/invoices-v2/queries'
import { ServiceDialog } from '#/frontend/features/invoices-v2/ServiceDialog'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { CountryPicker } from '#/frontend/features/clients/pickers'
import { Banner, FieldError, Hint, Label, SectionTitle, Segmented, TestBar, errorId } from './invoice-parts'

/**
 * Writing a draft, approved in the Invoices Design Lab (24 Sep 2026).
 *
 * A draft saves even when half-empty — it needs only a client, because every
 * invoice belongs to one. "Preview and issue" checks everything the server
 * will check before it takes a number, shows each problem under its field and
 * focuses the first; only a draft that passes goes on to the preview. The
 * checks follow the owner's typing once the first attempt has been made
 * (`AGENTS.md`). The totals beside the form are the shared contract's own
 * arithmetic, so they are the cents that will be printed.
 *
 * Every save carries the revision it was loaded at: a draft changed in another
 * tab is refused, not overwritten.
 */

type Picked = { id: string; name: string; detail: string; kind: 'person' | 'company' }

const RATE_LABEL: Record<number, string> = { 1900: '19 %', 700: '7 %', 0: '0 %' }

/** Where the address came from, so the hint under it tells the truth. */
type Prefill = 'invoice' | 'client' | 'typed'

const prefillRecipient = async (clientId: string): Promise<{ recipient: RecipientValues; from: Prefill }> => {
  const last = await listInvoices({ mode: 'all', clientId, pageSize: 1 }).catch(() => null)
  const previous = last?.items[0] ? await readInvoice(last.items[0].id).catch(() => null) : null

  if (previous && previous.recipient.address.trim() !== '') return { recipient: { ...previous.recipient }, from: 'invoice' }

  const client = await readClient(clientId)

  return {
    recipient: {
      name: client.name,
      company: client.kind === 'company' ? client.companyName : client.companyName,
      address: '',
      country: client.country.code,
      email: client.email,
      vatId: '',
    },
    from: 'client',
  }
}

const focusFirstInvalid = () =>
  window.requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(
      '#invoice-form [aria-invalid="true"], #invoice-form [data-group-error]',
    )

    target?.focus()
    target?.scrollIntoView?.({ block: 'center' })
  })

export function InvoiceEditor({
  invoice,
  settings,
  mode,
  showProblems = false,
}: {
  invoice: OwnerInvoice | null
  settings: InvoiceSettings
  mode: InvoiceMode
  /** Arrived from "Preview and issue" on a new invoice the server was not ready to issue. */
  showProblems?: boolean
}) {
  const navigate = useNavigate()
  const tax = { taxMode: settings.taxMode, defaultTaxRateBp: settings.defaultTaxRateBp }
  const today = berlinToday()
  const saved = useRef<{ id: string; revision: number } | null>(invoice ? { id: invoice.id, revision: invoice.revision } : null)
  const intent = useRef<'draft' | 'issue'>(showProblems ? 'issue' : 'draft')
  const [serverProblems, setServerProblems] = useState<string[]>(showProblems ? (invoice?.issueProblems ?? []) : [])
  const [failure, setFailure] = useState<{ message: string; stale: boolean } | null>(null)
  const [picked, setPicked] = useState<Picked | null>(
    invoice ? { id: invoice.client.id, name: invoice.client.displayName, detail: '', kind: invoice.recipient.company ? 'company' : 'person' } : null,
  )
  const [quick, setQuick] = useState<string | null>(null)
  const [prefill, setPrefill] = useState<Prefill>('typed')
  const [serviceOpen, setServiceOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(invoice?.updatedAt ?? null)
  const [rateText, setRateText] = useState(invoice?.fx?.rate ?? '')
  const [rateState, setRateState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })

  const create = useInvoiceMutation(createInvoice, (result) => result)
  const patch = useInvoiceMutation(
    (input: Parameters<typeof patchInvoice>[1] & { id: string }) => {
      const { id, ...rest } = input

      return patchInvoice(id, rest)
    },
    (result) => result,
  )

  const save = async (value: InvoiceFormValues) => {
    setFailure(null)
    setServerProblems([])

    const draft = formToDraft(value)
    let result: OwnerInvoice

    try {
      result = saved.current
        ? await patch.mutateAsync({ id: saved.current.id, revision: saved.current.revision, ...draft })
        : await create.mutateAsync({ ...draft, mode, clientId: value.clientId })
    } catch (caught) {
      const stale = caught instanceof ApiRequestError && caught.code === 'CONFLICT'

      setFailure({
        stale,
        message: stale
          ? 'This draft was changed in another tab. Your edits are still here. Load the newer version to continue — it replaces what you typed.'
          : caught instanceof ApiRequestError
            ? caught.message
            : 'The draft could not be saved. Nothing was lost — try again.',
      })

      return
    }

    const isNew = !saved.current

    saved.current = { id: result.id, revision: result.revision }
    setSavedAt(result.updatedAt)

    if (intent.current === 'issue') {
      if (result.issueProblems.length > 0) {
        if (isNew) {
          void navigate({
            to: '/dashboard/invoices/$invoiceId',
            params: { invoiceId: result.id },
            search: { check: true },
            replace: true,
          })

          return
        }

        setServerProblems(result.issueProblems)
        window.requestAnimationFrame(() => document.getElementById('issue-problems')?.focus())

        return
      }

      void navigate({ to: '/dashboard/invoices/$invoiceId/preview', params: { invoiceId: result.id } })

      return
    }

    notify.success('Draft saved — it has no number yet')

    if (isNew) {
      void navigate({ to: '/dashboard/invoices/$invoiceId', params: { invoiceId: result.id }, replace: true })
    }
  }

  // Built once: the line keys inside must not change on every render.
  const [initial] = useState(() => (invoice ? invoiceToForm(invoice) : emptyInvoiceForm(settings)))

  const form = useForm({
    defaultValues: initial,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields = intent.current === 'issue' ? issueErrors(value, tax, today) : draftErrors(value)

        return Object.keys(fields).length === 0 ? undefined : { fields }
      },
    },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: ({ value }) => save(value),
  })

  const values = useStore(form.store, (state) => state.values)
  const submitting = useStore(form.store, (state) => state.isSubmitting)
  const totals = totalsOf(values, tax)
  const currency = values.currency
  const due = dueDateOf(values, today)

  /* ----------------------------------------------------------- client */

  const choose = async (next: Picked) => {
    setPicked(next)
    setQuick(null)
    form.setFieldValue('clientId', next.id)

    try {
      const { recipient, from } = await prefillRecipient(next.id)

      form.setFieldValue('recipient', recipient)
      setPrefill(from)
    } catch {
      setPrefill('typed')
    }
  }

  /* --------------------------------------------------------- currency */

  const convertAll = (fx: FxValues | null, to: 'EUR' | 'USD') => {
    const lines = form.getFieldValue('lines').map((line): LineValues => {
      if (to === 'EUR') {
        return line.eurMinor !== null ? { ...line, unitPrice: minorToText(line.eurMinor), eurMinor: null } : line
      }

      const base = line.eurMinor ?? parseMoney(line.unitPrice)

      if (base === null || !fx) return line

      return { ...line, eurMinor: base, unitPrice: minorToText(toUsd(base, fx.rate) ?? base) }
    })

    form.setFieldValue('lines', lines)
  }

  const applyRate = async (rate?: string) => {
    setRateState({ busy: true, error: null })

    try {
      const proposal = await proposeRate({ amountMinor: 100, ...(rate ? { rate } : {}) })
      const fx: FxValues = { rateId: proposal.rateId, rate: proposal.rate, rateDate: proposal.rateDate, source: proposal.source }

      form.setFieldValue('fx', fx)
      setRateText(proposal.rate)
      convertAll(fx, 'USD')
      setRateState({ busy: false, error: null })
    } catch (caught) {
      setRateState({
        busy: false,
        error:
          caught instanceof ApiRequestError && caught.code === 'FX_UNAVAILABLE'
            ? 'No recent rate from the European Central Bank. Enter the rate you agreed.'
            : caught instanceof ApiRequestError
              ? caught.message
              : 'The rate could not be checked. Try again.',
      })
    }
  }

  const switchCurrency = (next: 'EUR' | 'USD') => {
    if (next === values.currency) return

    form.setFieldValue('currency', next)

    if (next === 'EUR') {
      convertAll(null, 'EUR')
      form.setFieldValue('fx', null)
      setRateState({ busy: false, error: null })
    } else {
      void applyRate()
    }
  }

  /* -------------------------------------------------------- services */

  const addService = (service: OwnerServiceListItem) => {
    const eur = service.price.amountCents
    const fx = form.getFieldValue('fx')
    const usd = currency === 'USD' && fx && eur !== null ? toUsd(eur, fx.rate) : null
    const line = emptyLine({
      description: service.displayName,
      unitPrice: eur === null ? '' : minorToText(usd ?? eur),
      serviceId: service.id,
      service: { name: service.displayName, priceMinor: eur },
      eurMinor: usd !== null ? eur : null,
    })
    const lines = form.getFieldValue('lines')
    const first = lines[0]
    const blank = lines.length === 1 && first && first.description.trim() === '' && first.unitPrice.trim() === ''

    form.setFieldValue('lines', blank ? [line] : [...lines, line])
    setServiceOpen(false)
    notify.success(`Line added from ${service.displayName || 'the service'}`)
  }

  /* ------------------------------------------------------------ plan */

  const setPlan = (plan: boolean) => {
    form.setFieldValue('plan', plan)

    if (plan && form.getFieldValue('installments').length === 0) {
      const [first, second] = splitEvenly(totals.totalMinor, 2)
      const firstDue = addDays(today, Number(values.paymentTermsDays) || 14)

      form.setFieldValue('installments', [
        { key: newKey(), amount: minorToText(first ?? 0), dueDate: firstDue, label: '' },
        { key: newKey(), amount: minorToText(second ?? 0), dueDate: addDays(firstDue, 30), label: '' },
      ])
    }
  }

  const splitPlan = () => {
    const parts = form.getFieldValue('installments')
    const amounts = splitEvenly(totals.totalMinor, parts.length)

    form.setFieldValue(
      'installments',
      parts.map((part, index) => ({ ...part, amount: minorToText(amounts[index] ?? 0) })),
    )
  }

  /* ------------------------------------------------------------ bits */

  const errorOf = (errors: unknown[]) => (errors[0] as string | undefined) ?? undefined

  const text = (
    name: 'title' | 'recipient.name' | 'recipient.company' | 'recipient.email' | 'recipient.vatId' | 'notes' | 'internalNote',
    label: string,
    options: { optional?: boolean; placeholder?: string; area?: boolean; hint?: string; type?: string } = {},
  ) => (
    <form.Field name={name}>
      {(api) => {
        const error = errorOf(api.state.meta.errors)
        const id = `inv-${name.replace('.', '-')}`
        const hintId = `${id}-hint`

        return (
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={id} optional={options.optional}>
              {label}
            </Label>
            {options.area ? (
              <textarea
                id={id}
                className="dash-field min-h-[76px] w-full resize-y px-3 py-2.5 text-[13px] leading-relaxed"
                placeholder={options.placeholder}
                value={api.state.value}
                aria-invalid={error ? true : undefined}
                aria-describedby={cn(error && errorId(id), options.hint && hintId) || undefined}
                onChange={(event) => api.handleChange(event.target.value)}
                onBlur={api.handleBlur}
              />
            ) : (
              <input
                id={id}
                type={options.type ?? 'text'}
                autoComplete="off"
                className="dash-field h-10 w-full px-3 text-[13px]"
                placeholder={options.placeholder}
                value={api.state.value}
                aria-invalid={error ? true : undefined}
                aria-describedby={cn(error && errorId(id), options.hint && hintId) || undefined}
                onChange={(event) => api.handleChange(event.target.value)}
                onBlur={api.handleBlur}
              />
            )}
            <FieldError id={id} message={error} />
            {options.hint ? <Hint id={hintId}>{options.hint}</Hint> : null}
          </div>
        )
      }}
    </form.Field>
  )

  const planned = planSumOf(values)
  const meter = planMeter(planned, totals.totalMinor, currency)
  const title = invoice ? 'Edit draft' : 'New invoice'

  return (
    <DashboardPage className="inv gap-4">
      <PageHead
        eyebrow={invoice?.replaces ? 'MONEY · CORRECTION' : invoice ? 'MONEY · DRAFT' : 'MONEY · NEW INVOICE'}
        title={title}
        description={
          savedAt
            ? `Saved as a draft · ${formatMoment(savedAt)} · no number until you issue it`
            : 'Not saved yet. A draft can stay incomplete — only issuing checks everything.'
        }
        actions={
          <Link to="/dashboard/invoices" className="dash-btn dash-btn-ghost">
            <ArrowLeft className="size-4" aria-hidden="true" />
            All invoices
          </Link>
        }
      />
      <TestBar mode={mode} />

      {invoice?.replaces ? (
        <Banner tone="info" icon={<Info className="size-4 shrink-0" aria-hidden="true" />} title={`Correction of ${invoice.replaces.number}`}>
          The original was cancelled with its own document. Fix what was wrong here, then issue this as a new invoice.
        </Banner>
      ) : null}
      {invoice?.subscriptionId ? (
        <Banner tone="info" icon={<Info className="size-4 shrink-0" aria-hidden="true" />} title="Prepared by a subscription">
          This period’s draft was made for you. Check it, then issue and send it.
        </Banner>
      ) : null}

      {failure ? (
        <div role="alert" className="dash-tone-red flex flex-col items-start gap-2 rounded-lg px-3.5 py-2.5 text-[12.5px]">
          {failure.message}
          {failure.stale && saved.current ? (
            <button
              type="button"
              className="dash-btn dash-btn-quiet h-8 text-[12px]"
              onClick={async () => {
                const fresh = await readInvoice(saved.current!.id)

                saved.current = { id: fresh.id, revision: fresh.revision }
                form.reset(invoiceToForm(fresh))
                setSavedAt(fresh.updatedAt)
                setFailure(null)
              }}
            >
              Load the newer version
            </button>
          ) : null}
        </div>
      ) : null}

      {serverProblems.length > 0 ? (
        <div
          id="issue-problems"
          tabIndex={-1}
          role="alert"
          className="flex gap-2.5 rounded-[10px] bg-[var(--dash-red-tint)] px-3.5 py-3 text-[12.5px] outline-none"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--dash-red-ink)]" aria-hidden="true" />
          <div>
            <b className="block text-[13px]">Saved, but not ready to issue yet</b>
            <ul className="mt-1 list-disc ps-4">
              {serverProblems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <form
        id="invoice-form"
        noValidate
        className="inv-editor"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <div className="dash-panel min-w-0">
          {/* ------------------------------------------------ client */}
          <section className="inv-sec" aria-labelledby="sec-client">
            <SectionTitle>
              <span id="sec-client">CLIENT</span>
            </SectionTitle>
            <form.Field name="clientId">
              {(api) => {
                const error = errorOf(api.state.meta.errors)

                if (picked && quick === null) {
                  return (
                    <div className="flex items-center gap-3 rounded-[10px] border border-[var(--dash-line)] px-3 py-2.5">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-[9px]',
                          picked.kind === 'company' ? 'dash-tone-blue rounded-[7px]' : 'dash-tone-grey',
                        )}
                      >
                        {picked.kind === 'company' ? <Building2 className="size-4" /> : <User className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1 text-[12.5px] text-[var(--dash-quiet)]">
                        <strong className="block truncate text-[13.5px] text-[var(--dash-ink)]">{picked.name}</strong>
                        {picked.detail || 'The client this invoice belongs to'}
                      </span>
                      <button
                        type="button"
                        className="dash-btn dash-btn-ghost h-8 text-[12.5px]"
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? errorId('inv-clientId') : undefined}
                        onClick={() => {
                          setPicked(null)
                          api.handleChange('')
                        }}
                      >
                        Change
                      </button>
                    </div>
                  )
                }

                return (
                  <div className="flex flex-col gap-2">
                    {quick === null ? (
                      <>
                        <Label htmlFor="inv-clientId">Client</Label>
                        <ClientPicker
                          id="inv-clientId"
                          invalid={Boolean(error)}
                          describedBy={error ? errorId('inv-clientId') : undefined}
                          onPick={(client) =>
                            void choose({
                              id: client.id,
                              name: client.displayName,
                              kind: client.kind,
                              detail: [client.kind === 'company' ? client.name : client.companyName, client.country.name, client.email]
                                .filter(Boolean)
                                .join(' · '),
                            })
                          }
                          onCreate={(typed) => setQuick(typed)}
                        />
                        <FieldError id="inv-clientId" message={error} />
                        <button
                          type="button"
                          className="dash-btn dash-btn-ghost h-8 self-start px-2 text-[12.5px]"
                          onClick={() => setQuick('')}
                        >
                          <Plus className="size-3.5" aria-hidden="true" />
                          New client
                        </button>
                      </>
                    ) : (
                      <QuickClient
                        initialName={quick}
                        onCancel={() => setQuick(null)}
                        onUseExisting={(candidate) =>
                          void choose({ id: candidate.id, name: candidate.displayName, kind: candidate.kind, detail: candidate.email })
                        }
                        onCreated={(client, address) => {
                          setQuick(null)
                          setPicked({
                            id: client.id,
                            name: client.displayName,
                            kind: client.kind,
                            detail: [client.country.name, client.email].join(' · '),
                          })
                          api.handleChange(client.id)
                          form.setFieldValue('recipient', {
                            name: client.name,
                            company: client.companyName,
                            address,
                            country: client.country.code,
                            email: client.email,
                            vatId: '',
                          })
                          setPrefill('typed')
                          notify.success('Client created and chosen')
                        }}
                      />
                    )}
                  </div>
                )
              }}
            </form.Field>

            {picked && quick === null ? (
              <div className="inv-grid2">
                {text('recipient.name', 'Addressed to', { placeholder: 'Contact person' })}
                {text('recipient.company', 'Company', { optional: true })}
                <form.Field name="recipient.address">
                  {(api) => {
                    const error = errorOf(api.state.meta.errors)

                    return (
                      <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
                        <Label htmlFor="inv-recipient-address">Billing address on this invoice</Label>
                        <textarea
                          id="inv-recipient-address"
                          className="dash-field min-h-[74px] w-full resize-y px-3 py-2.5 text-[13px] leading-relaxed"
                          placeholder={'Street and number\nPostcode and city'}
                          value={api.state.value}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={cn(error && errorId('inv-recipient-address'), 'inv-address-hint')}
                          onChange={(event) => api.handleChange(event.target.value)}
                          onBlur={api.handleBlur}
                        />
                        <FieldError id="inv-recipient-address" message={error} />
                        <Hint id="inv-address-hint">
                          {prefill === 'invoice'
                            ? 'Filled in from this client’s last invoice. '
                            : ''}
                          Client files have no address, so each invoice keeps its own.
                        </Hint>
                      </div>
                    )
                  }}
                </form.Field>
                {text('recipient.email', 'Email for sending', { type: 'email', optional: true })}
                <form.Field name="recipient.country">
                  {(api) => (
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <Label htmlFor="inv-recipient-country" optional>
                        Country
                      </Label>
                      <CountryPicker id="inv-recipient-country" value={api.state.value} onChange={(code) => api.handleChange(code)} />
                    </div>
                  )}
                </form.Field>
                {text('recipient.vatId', 'Client’s VAT ID', {
                  optional: true,
                  placeholder: 'e.g. ATU12345678',
                })}
              </div>
            ) : null}
          </section>

          {/* ----------------------------------- language and currency */}
          <section className="inv-sec" aria-labelledby="sec-lang">
            <SectionTitle>
              <span id="sec-lang">LANGUAGE &amp; CURRENCY</span>
            </SectionTitle>
            <div className="flex flex-wrap items-center gap-2">
              <form.Field name="language">
                {(api) => (
                  <Segmented
                    label="Invoice language"
                    value={api.state.value}
                    onChange={(next) => api.handleChange(next)}
                    options={[
                      ['de', 'German'],
                      ['en', 'English'],
                    ]}
                  />
                )}
              </form.Field>
              <Segmented label="Currency" value={currency} onChange={switchCurrency} options={[['EUR', 'EUR'], ['USD', 'USD']]} />
              <label className="ms-1 flex items-start gap-2 text-[12.5px] text-[var(--dash-quiet)]">
                <input type="checkbox" disabled className="mt-0.5" aria-describedby="arabic-why" />
                <span>
                  <span className="text-[var(--dash-ink)]">Arabic copy</span>{' '}
                  <span id="arabic-why">— not available yet: the PDF needs a working Arabic font first.</span>
                </span>
              </label>
            </div>
            {values.language === 'en' ? (
              <Hint>The English version is the invoice itself. You can still download a German copy with the same number.</Hint>
            ) : null}
            {currency === 'USD' ? (
              <Banner tone="info" icon={<Info className="size-4 shrink-0" aria-hidden="true" />} title="Prices are proposed from euros">
                Service prices are in euros, so each line was converted at the rate below. Change the rate or any price —
                what you issue is what counts.
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  <label htmlFor="inv-rate">1 EUR =</label>
                  <input
                    id="inv-rate"
                    inputMode="decimal"
                    className="dash-field dash-num h-8 w-28 px-2.5 text-[13px]"
                    value={rateText}
                    aria-invalid={rateState.error ? true : undefined}
                    aria-describedby={rateState.error ? 'inv-rate-error' : undefined}
                    onChange={(event) => setRateText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void applyRate(rateText.trim())
                      }
                    }}
                  />
                  <span>USD</span>
                  <button
                    type="button"
                    className="dash-btn dash-btn-quiet h-8 text-[12px]"
                    disabled={rateState.busy || rateText.trim() === '' || rateText.trim() === values.fx?.rate}
                    onClick={() => void applyRate(rateText.trim())}
                  >
                    {rateState.busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                    Use this rate
                  </button>
                  <span className="text-[12px] text-[var(--dash-quiet)]">
                    {values.fx
                      ? values.fx.source === 'ecb'
                        ? `European Central Bank, ${formatDate(values.fx.rateDate)}`
                        : `Your own rate, ${formatDate(values.fx.rateDate)}`
                      : 'No rate yet'}
                  </span>
                </span>
                {rateState.error ? (
                  <span id="inv-rate-error" className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[var(--dash-red-ink)]">
                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                    {rateState.error}
                  </span>
                ) : null}
              </Banner>
            ) : null}
          </section>

          {/* ------------------------------------------------- lines */}
          <section className="inv-sec" aria-labelledby="sec-lines">
            <SectionTitle
              action={
                <button type="button" className="dash-btn dash-btn-ghost h-8 px-2 text-[12.5px] tracking-normal" onClick={() => setServiceOpen(true)}>
                  <Plus className="size-3.5" aria-hidden="true" />
                  From a service
                </button>
              }
            >
              <span id="sec-lines">WHAT YOU ARE BILLING</span>
            </SectionTitle>
            <form.Field name="lines" mode="array">
              {(linesApi) => {
                const groupError = errorOf(linesApi.state.meta.errors)

                return (
                  <div className="flex flex-col gap-2.5">
                    {linesApi.state.value.map((line, index) => {
                      const net = totals.lineNetMinor[index] ?? 0

                      return (
                        <div
                          key={line.key}
                          className="inv-line"
                          style={
                            settings.taxMode === 'standard'
                              ? { gridTemplateColumns: '84px 130px 92px minmax(0,1fr) 32px' }
                              : undefined
                          }
                        >
                          {line.service ? (
                            <span className="inv-line-wide flex items-center gap-1.5 text-[11.5px] text-[var(--dash-quiet)]">
                              <Lock className="size-3 shrink-0" aria-hidden="true" />
                              From the service “{line.service.name}”
                              {line.service.priceMinor !== null ? `, ${formatAmount(line.service.priceMinor, 'EUR')}` : ''} —
                              later price changes do not touch this invoice
                            </span>
                          ) : null}
                          <form.Field name={`lines[${index}].description`}>
                            {(api) => {
                              const error = errorOf(api.state.meta.errors)
                              const id = `inv-line-${index}-description`

                              return (
                                <div className="inv-line-wide flex flex-col gap-1">
                                  <label htmlFor={id} className="sr-only">
                                    Description, line {index + 1}
                                  </label>
                                  <input
                                    id={id}
                                    className="dash-field h-9 w-full px-3 text-[13px]"
                                    placeholder="What is this line for?"
                                    value={api.state.value}
                                    aria-invalid={error ? true : undefined}
                                    aria-describedby={error ? errorId(id) : undefined}
                                    onChange={(event) => api.handleChange(event.target.value)}
                                    onBlur={api.handleBlur}
                                  />
                                  <FieldError id={id} message={error} />
                                </div>
                              )
                            }}
                          </form.Field>
                          <form.Field name={`lines[${index}].quantity`}>
                            {(api) => {
                              const error = errorOf(api.state.meta.errors)
                              const id = `inv-line-${index}-quantity`

                              return (
                                <div className="flex min-w-0 flex-col gap-1">
                                  <label htmlFor={id} className="text-[11px] font-semibold text-[var(--dash-quiet)]">
                                    Qty
                                  </label>
                                  <input
                                    id={id}
                                    inputMode="decimal"
                                    className="dash-field dash-num h-9 w-full px-2.5 text-[13px]"
                                    value={api.state.value}
                                    aria-invalid={error ? true : undefined}
                                    aria-describedby={error ? errorId(id) : undefined}
                                    onChange={(event) => api.handleChange(event.target.value)}
                                    onBlur={api.handleBlur}
                                  />
                                  <FieldError id={id} message={error} />
                                </div>
                              )
                            }}
                          </form.Field>
                          <form.Field name={`lines[${index}].unitPrice`}>
                            {(api) => {
                              const error = errorOf(api.state.meta.errors)
                              const id = `inv-line-${index}-price`

                              return (
                                <div className="flex min-w-0 flex-col gap-1">
                                  <label htmlFor={id} className="text-[11px] font-semibold text-[var(--dash-quiet)]">
                                    Unit price ({currency})
                                  </label>
                                  <input
                                    id={id}
                                    inputMode="decimal"
                                    className="dash-field dash-num h-9 w-full px-2.5 text-[13px]"
                                    placeholder="0.00"
                                    value={api.state.value}
                                    aria-invalid={error ? true : undefined}
                                    aria-describedby={error ? errorId(id) : undefined}
                                    onChange={(event) => {
                                      api.handleChange(event.target.value)
                                      form.setFieldValue(`lines[${index}].eurMinor`, null)
                                    }}
                                    onBlur={api.handleBlur}
                                  />
                                  <FieldError id={id} message={error} />
                                </div>
                              )
                            }}
                          </form.Field>
                          {settings.taxMode === 'standard' ? (
                            <form.Field name={`lines[${index}].taxRateBp`}>
                              {(api) => (
                                <div className="flex min-w-0 flex-col gap-1">
                                  <label htmlFor={`inv-line-${index}-tax`} className="text-[11px] font-semibold text-[var(--dash-quiet)]">
                                    VAT
                                  </label>
                                  <select
                                    id={`inv-line-${index}-tax`}
                                    className="dash-field h-9 px-2 text-[13px]"
                                    value={api.state.value === null ? '' : String(api.state.value)}
                                    onChange={(event) => api.handleChange(event.target.value === '' ? null : Number(event.target.value))}
                                  >
                                    <option value="">Default ({RATE_LABEL[settings.defaultTaxRateBp]})</option>
                                    <option value="1900">19 %</option>
                                    <option value="700">7 %</option>
                                    <option value="0">0 %</option>
                                  </select>
                                </div>
                              )}
                            </form.Field>
                          ) : null}
                          <span className="dash-num flex h-9 items-center justify-end self-end text-[13px] font-semibold">
                            {formatAmount(net, currency)}
                          </span>
                          <button
                            type="button"
                            className="grid h-9 w-8 place-items-center self-end rounded-lg text-[var(--dash-quiet)] hover:bg-[var(--dash-hover)] hover:text-[var(--dash-ink)]"
                            aria-label={`Remove line ${index + 1}`}
                            onClick={() => linesApi.removeValue(index)}
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      )
                    })}
                    {groupError ? (
                      <span tabIndex={-1} data-group-error className="outline-none">
                        <FieldError id="inv-lines" message={groupError} />
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="dash-btn dash-btn-quiet h-8 self-start text-[12.5px]"
                      onClick={() => {
                        linesApi.pushValue(emptyLine())
                        window.requestAnimationFrame(() =>
                          document.getElementById(`inv-line-${linesApi.state.value.length - 1}-description`)?.focus(),
                        )
                      }}
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      Add a line
                    </button>
                  </div>
                )
              }}
            </form.Field>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-semibold">Discount</span>
              <form.Field name="discountType">
                {(api) => (
                  <Segmented
                    label="Discount"
                    value={api.state.value}
                    onChange={(next) => api.handleChange(next)}
                    options={[
                      ['none', 'None'],
                      ['percent', 'Percent'],
                      ['fixed', 'Amount'],
                    ]}
                  />
                )}
              </form.Field>
              {values.discountType !== 'none' ? (
                <form.Field name="discountValue">
                  {(api) => {
                    const error = errorOf(api.state.meta.errors)

                    return (
                      <span className="flex flex-col gap-1">
                        <label htmlFor="inv-discount" className="sr-only">
                          Discount {values.discountType === 'percent' ? 'in percent' : `in ${currency}`}
                        </label>
                        <span className="flex items-center gap-1.5">
                          <input
                            id="inv-discount"
                            inputMode="decimal"
                            className="dash-field dash-num h-9 w-28 px-2.5 text-[13px]"
                            placeholder={values.discountType === 'percent' ? '10' : '100.00'}
                            value={api.state.value}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? errorId('inv-discount') : undefined}
                            onChange={(event) => api.handleChange(event.target.value)}
                            onBlur={api.handleBlur}
                          />
                          <span className="text-[12.5px] text-[var(--dash-quiet)]">{values.discountType === 'percent' ? '%' : currency}</span>
                        </span>
                        <FieldError id="inv-discount" message={error} />
                      </span>
                    )
                  }}
                </form.Field>
              ) : null}
            </div>
          </section>

          {/* ------------------------------------------------ payment */}
          <section className="inv-sec" aria-labelledby="sec-pay">
            <SectionTitle>
              <span id="sec-pay">PAYMENT</span>
            </SectionTitle>
            <div className="flex flex-col gap-2.5" role="group" aria-label="How the client can pay">
              <form.Field name="allowBank">
                {(api) => (
                  <label className="flex items-start gap-2.5 text-[13px]">
                    <input
                      type="checkbox"
                      className="mt-1 accent-[var(--dash-brand)]"
                      checked={api.state.value}
                      onChange={(event) => api.handleChange(event.target.checked)}
                    />
                    <span>
                      <span className="flex items-center gap-1.5 font-medium">
                        <Landmark className="size-3.5" aria-hidden="true" /> Bank transfer
                      </span>
                      <small className="block text-[12px] text-[var(--dash-quiet)]">Your bank details are printed on the invoice.</small>
                    </span>
                  </label>
                )}
              </form.Field>
              <form.Field name="allowStripe">
                {(api) => (
                  <label className="flex items-start gap-2.5 text-[13px]">
                    <input
                      type="checkbox"
                      className="mt-1 accent-[var(--dash-brand)]"
                      checked={api.state.value}
                      onChange={(event) => api.handleChange(event.target.checked)}
                    />
                    <span>
                      <span className="flex items-center gap-1.5 font-medium">
                        <CreditCard className="size-3.5" aria-hidden="true" /> Card through Stripe
                      </span>
                      <small className="block text-[12px] text-[var(--dash-quiet)]">
                        A payment link goes into the email when you send it. Marked paid only when Stripe confirms.
                      </small>
                    </span>
                  </label>
                )}
              </form.Field>
              {!values.allowBank && !values.allowStripe ? (
                <Hint>Neither is ticked, so the invoice shows no way to pay. Cash can still be recorded afterwards.</Hint>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-semibold">Paid</span>
              <Segmented
                label="Paid at once or in parts"
                value={values.plan ? 'plan' : 'once'}
                onChange={(next) => setPlan(next === 'plan')}
                options={[
                  ['once', 'All at once'],
                  ['plan', 'In parts'],
                ]}
              />
            </div>

            {values.plan ? (
              <form.Field name="installments" mode="array">
                {(partsApi) => {
                  const groupError = errorOf(partsApi.state.meta.errors)

                  return (
                    <div className="flex flex-col gap-2">
                      {partsApi.state.value.map((part, index) => {
                        const amount = parseMoney(part.amount) ?? 0

                        return (
                          <div key={part.key} className="inv-part">
                            <span className="grid h-9 place-items-center text-[12px] font-bold text-[var(--dash-quiet)]">{index + 1}</span>
                            <form.Field name={`installments[${index}].amount`}>
                              {(api) => {
                                const error = errorOf(api.state.meta.errors)
                                const id = `inv-part-${index}-amount`

                                return (
                                  <div className="flex min-w-0 flex-col gap-1">
                                    <label htmlFor={id} className="sr-only">
                                      Amount of part {index + 1}
                                    </label>
                                    <input
                                      id={id}
                                      inputMode="decimal"
                                      className="dash-field dash-num h-9 w-full px-2.5 text-[13px]"
                                      value={api.state.value}
                                      aria-invalid={error ? true : undefined}
                                      aria-describedby={error ? errorId(id) : undefined}
                                      onChange={(event) => api.handleChange(event.target.value)}
                                      onBlur={api.handleBlur}
                                    />
                                    <FieldError id={id} message={error} />
                                  </div>
                                )
                              }}
                            </form.Field>
                            <form.Field name={`installments[${index}].dueDate`}>
                              {(api) => {
                                const error = errorOf(api.state.meta.errors)
                                const id = `inv-part-${index}-due`

                                return (
                                  <div className="flex min-w-0 flex-col gap-1">
                                    <label htmlFor={id} className="sr-only">
                                      Due date of part {index + 1}
                                    </label>
                                    <input
                                      id={id}
                                      type="date"
                                      min={today}
                                      className="dash-field h-9 w-full px-2.5 text-[13px]"
                                      value={api.state.value}
                                      aria-invalid={error ? true : undefined}
                                      aria-describedby={error ? errorId(id) : undefined}
                                      onChange={(event) => api.handleChange(event.target.value)}
                                      onBlur={api.handleBlur}
                                    />
                                    <FieldError id={id} message={error} />
                                  </div>
                                )
                              }}
                            </form.Field>
                            <span className="inv-part-pct flex h-9 items-center text-[12px] text-[var(--dash-quiet)]">
                              {totals.totalMinor > 0 ? Math.round((amount / totals.totalMinor) * 100) : 0}% of the total
                            </span>
                            <button
                              type="button"
                              className="grid h-9 w-8 place-items-center rounded-lg text-[var(--dash-quiet)] hover:bg-[var(--dash-hover)] disabled:opacity-40"
                              aria-label={`Remove part ${index + 1}`}
                              disabled={partsApi.state.value.length <= 1}
                              onClick={() => partsApi.removeValue(index)}
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        )
                      })}
                      <div>
                        <div className="inv-meter" data-over={planned > totals.totalMinor ? 'true' : undefined} aria-hidden="true">
                          <i style={{ width: `${totals.totalMinor > 0 ? Math.min(100, (planned / totals.totalMinor) * 100) : 0}%` }} />
                        </div>
                        <div className="mt-1 flex flex-wrap justify-between gap-2 text-[12px] text-[var(--dash-quiet)]" aria-live="polite">
                          <span>
                            {partsApi.state.value.length} {partsApi.state.value.length === 1 ? 'part' : 'parts'} ·{' '}
                            {formatAmount(planned, currency)} planned
                          </span>
                          <b className={cn('dash-num', meter.ok ? 'text-[var(--dash-ink)]' : 'text-[var(--dash-red-ink)]')}>{meter.text}</b>
                        </div>
                      </div>
                      {groupError ? (
                        <span tabIndex={-1} data-group-error className="outline-none">
                          <FieldError id="inv-installments" message={groupError} />
                        </span>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="dash-btn dash-btn-quiet h-8 text-[12.5px]"
                          onClick={() => {
                            const last = partsApi.state.value.at(-1)

                            partsApi.pushValue({
                              key: newKey(),
                              amount: '',
                              dueDate: addDays(last?.dueDate || today, 30),
                              label: '',
                            })
                          }}
                        >
                          <Plus className="size-3.5" aria-hidden="true" />
                          Add a part
                        </button>
                        <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12.5px]" onClick={splitPlan}>
                          Split evenly
                        </button>
                      </div>
                    </div>
                  )
                }}
              </form.Field>
            ) : (
              <form.Field name="paymentTermsDays">
                {(api) => {
                  const error = errorOf(api.state.meta.errors)

                  return (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="inv-terms">Payment due within</Label>
                      <span className="flex flex-wrap items-center gap-2">
                        <input
                          id="inv-terms"
                          inputMode="numeric"
                          className="dash-field dash-num h-9 w-20 px-2.5 text-[13px]"
                          value={api.state.value}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={cn(error && errorId('inv-terms'), 'inv-terms-hint')}
                          onChange={(event) => api.handleChange(event.target.value)}
                          onBlur={api.handleBlur}
                        />
                        <span className="text-[12.5px]">days</span>
                        <Hint id="inv-terms-hint">{due ? `Due on ${formatDate(due)} if you issue it today.` : ''}</Hint>
                      </span>
                      <FieldError id="inv-terms" message={error} />
                    </div>
                  )
                }}
              </form.Field>
            )}
          </section>

          {/* ------------------------------------------------- extras */}
          <section className="inv-sec" aria-labelledby="sec-more">
            <SectionTitle>
              <span id="sec-more">MORE ON THE INVOICE</span>
            </SectionTitle>
            <div className="inv-grid2">
              {text('title', 'Title', { optional: true, placeholder: 'e.g. Website relaunch' })}
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold">
                  Service period <span className="font-normal text-[var(--dash-quiet)]">(optional — the issue date if empty)</span>
                </span>
                <span className="flex items-start gap-2">
                  <form.Field name="serviceDateFrom">
                    {(api) => (
                      <input
                        type="date"
                        aria-label="Service period from"
                        className="dash-field h-10 min-w-0 flex-1 px-2.5 text-[13px]"
                        value={api.state.value}
                        onChange={(event) => api.handleChange(event.target.value)}
                      />
                    )}
                  </form.Field>
                  <form.Field name="serviceDateTo">
                    {(api) => {
                      const error = errorOf(api.state.meta.errors)

                      return (
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <input
                            type="date"
                            aria-label="Service period to"
                            className="dash-field h-10 w-full px-2.5 text-[13px]"
                            value={api.state.value}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? errorId('inv-service-to') : undefined}
                            onChange={(event) => api.handleChange(event.target.value)}
                          />
                          <FieldError id="inv-service-to" message={error} />
                        </span>
                      )
                    }}
                  </form.Field>
                </span>
              </div>
              <div className="sm:col-span-2">
                {text('notes', 'Note printed on the invoice', { optional: true, area: true })}
              </div>
              <div className="sm:col-span-2">
                {text('internalNote', 'Private note', { optional: true, area: true, hint: 'Only you see this. It is never printed.' })}
              </div>
              {settings.taxMode === 'standard' ? (
                <form.Field name="reverseCharge">
                  {(api) => {
                    const error = errorOf(api.state.meta.errors)

                    return (
                      <div className="flex flex-col gap-1 sm:col-span-2">
                        <label className="flex items-start gap-2.5 text-[13px]">
                          <input
                            type="checkbox"
                            className="mt-1 accent-[var(--dash-brand)]"
                            checked={api.state.value}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? errorId('inv-reverse') : undefined}
                            onChange={(event) => api.handleChange(event.target.checked)}
                          />
                          <span>
                            Reverse charge
                            <small className="block text-[12px] text-[var(--dash-quiet)]">
                              For a business client in another EU country: no German VAT, and their VAT ID is printed.
                            </small>
                          </span>
                        </label>
                        <FieldError id="inv-reverse" message={error} />
                      </div>
                    )
                  }}
                </form.Field>
              ) : null}
            </div>
          </section>
        </div>

        {/* ----------------------------------------------------- totals */}
        <aside className="dash-panel flex flex-col lg:sticky lg:top-4" aria-label="Totals">
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 px-5 pt-4.5 pb-3 text-[13px]">
            <dt className="text-[var(--dash-quiet)]">Subtotal</dt>
            <dd className="dash-num text-end">{formatAmount(totals.subtotalMinor, currency)}</dd>
            {totals.discountMinor > 0 ? (
              <>
                <dt className="text-[var(--dash-quiet)]">Discount</dt>
                <dd className="dash-num text-end">−{formatAmount(totals.discountMinor, currency)}</dd>
              </>
            ) : null}
            {settings.taxMode === 'kleinunternehmer' || values.reverseCharge ? (
              <>
                <dt className="text-[var(--dash-quiet)]">VAT</dt>
                <dd className="text-end">none</dd>
              </>
            ) : (
              totals.taxGroups.map((group) => (
                <div key={group.rateBp} className="contents">
                  <dt className="text-[var(--dash-quiet)]">VAT {RATE_LABEL[group.rateBp] ?? `${group.rateBp / 100} %`}</dt>
                  <dd className="dash-num text-end">{formatAmount(group.taxMinor, currency)}</dd>
                </div>
              ))
            )}
            <dt className="mt-1 border-t border-[var(--dash-line)] pt-2.5 text-[15px] font-bold">Total</dt>
            <dd className="dash-num dash-figure mt-1 border-t border-[var(--dash-line)] pt-2.5 text-end text-[20px]">
              {formatAmount(totals.totalMinor, currency)}
            </dd>
          </dl>
          <p className="px-5 pb-3 text-[11.5px] leading-relaxed text-[var(--dash-quiet)]">
            {settings.taxMode === 'kleinunternehmer'
              ? 'Small-business rule (§ 19 UStG): no VAT is charged and the invoice says why.'
              : values.reverseCharge
                ? 'Reverse charge: the client accounts for the VAT.'
                : 'Standard VAT, per line.'}{' '}
            <Link to="/dashboard/invoices/settings" className="font-semibold text-[var(--dash-blue-ink)] hover:underline">
              Seller &amp; tax
            </Link>
          </p>
          <div className="flex flex-col gap-2 px-5 pb-5">
            <button
              type="submit"
              className="dash-btn dash-btn-primary"
              disabled={submitting}
              onClick={() => {
                intent.current = 'issue'
              }}
            >
              {submitting && intent.current === 'issue' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {submitting && intent.current === 'issue' ? 'Saving…' : 'Preview and issue'}
            </button>
            <button
              type="submit"
              className="dash-btn dash-btn-quiet"
              disabled={submitting}
              onClick={() => {
                intent.current = 'draft'
              }}
            >
              {submitting && intent.current === 'draft' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {submitting && intent.current === 'draft' ? 'Saving…' : 'Save draft'}
            </button>
            {saved.current ? (
              <button type="button" className="dash-btn dash-btn-ghost" disabled={submitting} onClick={() => setConfirmDelete(true)}>
                Delete draft
              </button>
            ) : (
              <Link to="/dashboard/invoices" className="dash-btn dash-btn-ghost">
                Discard
              </Link>
            )}
          </div>
        </aside>
      </form>

      {serviceOpen ? <ServiceDialog onPick={addService} onClose={() => setServiceOpen(false)} /> : null}

      {confirmDelete && saved.current ? (
        <ConfirmDialog
          title="Delete this draft?"
          confirmLabel="Delete draft"
          busyLabel="Deleting…"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await deleteDraft(saved.current!.id)
            notify.success('Draft deleted')
            void navigate({ to: '/dashboard/invoices' })
          }}
        >
          <p>It has no number, so nothing is left behind. This cannot be undone.</p>
        </ConfirmDialog>
      ) : null}
    </DashboardPage>
  )
}
