import { useState } from 'react'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import * as v from 'valibot'
import { Check, Loader2, X } from 'lucide-react'
import { type InvoiceSettings, SettingsPutSchema } from '#/backend2/contracts/invoice.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage, PageHead } from '#/frontend/dashboard/primitives'
import { type SettingsFields, saveSettings } from '#/frontend/features/invoices-v2/api'
import { CountryPicker } from '#/frontend/features/clients/pickers'
import { useInvoiceMode } from '#/frontend/features/invoices-v2/mode'
import { invoiceKeys } from '#/frontend/features/invoices-v2/queries'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoadFailure } from '../clients/client-parts'
import { FieldError, Hint, Label, ListSkeleton, SectionNav, TestBar, errorId } from './invoice-parts'

/**
 * Seller & tax, approved in the Invoices Design Lab (24 Sep 2026): what every
 * invoice says about the owner. Test details are fine for now — real
 * invoices stay locked until the checklist is complete and real invoicing is
 * switched on on the server, so a real invoice cannot happen by accident.
 *
 * The rules are the server's own `SettingsPutSchema`, run in the browser, so
 * a field the form accepts is a field the server accepts.
 */

type Values = Omit<SettingsFields, 'paymentTermsDays'> & { paymentTermsDays: string }

const toValues = (settings: InvoiceSettings): Values => ({
  sellerName: settings.sellerName,
  sellerAddress: settings.sellerAddress,
  sellerCountry: settings.sellerCountry,
  sellerEmail: settings.sellerEmail,
  sellerPhone: settings.sellerPhone,
  sellerWebsite: settings.sellerWebsite,
  taxNumber: settings.taxNumber,
  vatId: settings.vatId,
  bankHolder: settings.bankHolder,
  bankIban: settings.bankIban,
  bankBic: settings.bankBic,
  bankName: settings.bankName,
  taxMode: settings.taxMode,
  defaultTaxRateBp: settings.defaultTaxRateBp,
  paymentTermsDays: String(settings.paymentTermsDays),
  defaultLanguage: settings.defaultLanguage,
  testRecipientEmail: settings.testRecipientEmail,
})

/** The first problem per field, worded for the field. */
export const settingsErrors = (values: Values): Record<string, string> => {
  const errors: Record<string, string> = {}

  if (!/^\d{1,3}$/u.test(values.paymentTermsDays.trim()) || Number(values.paymentTermsDays) > 365) {
    errors.paymentTermsDays = 'Enter a number of days from 0 to 365'
  }

  const result = v.safeParse(SettingsPutSchema, { ...values, paymentTermsDays: Number(values.paymentTermsDays) || 0, revision: 1 })

  if (!result.success) {
    for (const issue of result.issues) {
      const field = v.getDotPath(issue)

      if (field && !errors[field]) errors[field] = field === 'sellerCountry' ? 'Choose a country from the list' : issue.message
    }
  }

  return errors
}

const READINESS: Array<[string, string]> = [
  ['sellerName', 'Business name'],
  ['sellerAddress', 'Address'],
  ['sellerEmail', 'Email on invoices'],
  ['taxNumberOrVatId', 'Tax number or VAT ID'],
  ['bankHolder', 'Account holder'],
  ['bankIban', 'IBAN'],
]

function Readiness({ settings }: { settings: InvoiceSettings }) {
  const missing = new Set(settings.readiness.missing)

  return (
    <ul className="flex flex-col gap-1.5 text-[13px]">
      {READINESS.map(([key, label]) => (
        <li key={key} className="flex items-center gap-2">
          {missing.has(key) ? (
            <X className="size-3.5 text-[var(--dash-red-ink)]" aria-label="Missing" />
          ) : (
            <Check className="size-3.5 text-[var(--dash-live)]" aria-label="Done" />
          )}
          {label}
        </li>
      ))}
      <li className="flex items-center gap-2">
        {settings.readiness.liveEnabled ? (
          <Check className="size-3.5 text-[var(--dash-live)]" aria-label="Done" />
        ) : (
          <X className="size-3.5 text-[var(--dash-red-ink)]" aria-label="Missing" />
        )}
        Real invoicing switched on for this site
      </li>
    </ul>
  )
}

function SettingsForm({ settings }: { settings: InvoiceSettings }) {
  const client = useQueryClient()
  const revision = settings.revision
  const [failure, setFailure] = useState<{ message: string; stale: boolean } | null>(null)
  const save = useMutation({
    mutationFn: saveSettings,
    onSuccess: async (saved) => {
      client.setQueryData(invoiceKeys.settings(), saved)
      await client.invalidateQueries({ queryKey: invoiceKeys.all })
    },
  })
  const [initial] = useState(() => toValues(settings))

  const form = useForm({
    defaultValues: initial,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields = settingsErrors(value)

        return Object.keys(fields).length === 0 ? undefined : { fields }
      },
    },
    onSubmitInvalid: () =>
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('#settings-form [aria-invalid="true"]')?.focus()),
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        // The saved settings replace the cached ones; the form reopens on the new revision.
        await save.mutateAsync({ ...value, paymentTermsDays: Number(value.paymentTermsDays), revision })
        notify.success('Seller details saved')
      } catch (caught) {
        const stale = caught instanceof ApiRequestError && caught.code === 'CONFLICT'

        setFailure({
          stale,
          message: stale
            ? 'These settings were changed in another tab. Reload the page to see them; your edits here are not saved.'
            : caught instanceof Error
              ? caught.message
              : 'The settings could not be saved.',
        })
      }
    },
  })
  const submitting = useStore(form.store, (state) => state.isSubmitting)
  const taxMode = useStore(form.store, (state) => state.values.taxMode)

  const field = (
    name: Exclude<keyof Values, 'sellerCountry' | 'taxMode' | 'defaultTaxRateBp' | 'defaultLanguage'>,
    label: string,
    options: { optional?: boolean; placeholder?: string; area?: boolean; hint?: string; wide?: boolean; type?: string } = {},
  ) => (
    <form.Field name={name}>
      {(api) => {
        const error = api.state.meta.errors[0] as string | undefined
        const id = `st-${name}`

        return (
          <div className={cn('flex min-w-0 flex-col gap-1.5', options.wide && 'sm:col-span-2')}>
            <Label htmlFor={id} optional={options.optional}>
              {label}
            </Label>
            {options.area ? (
              <textarea
                id={id}
                className="dash-field min-h-[70px] resize-y px-3 py-2 text-[13px] leading-relaxed"
                placeholder={options.placeholder}
                value={api.state.value}
                aria-invalid={error ? true : undefined}
                aria-describedby={cn(error && errorId(id), options.hint && `${id}-hint`) || undefined}
                onChange={(event) => api.handleChange(event.target.value)}
              />
            ) : (
              <input
                id={id}
                type={options.type ?? 'text'}
                className="dash-field h-10 px-3 text-[13px]"
                placeholder={options.placeholder}
                value={api.state.value}
                aria-invalid={error ? true : undefined}
                aria-describedby={cn(error && errorId(id), options.hint && `${id}-hint`) || undefined}
                onChange={(event) => api.handleChange(event.target.value)}
              />
            )}
            <FieldError id={id} message={error} />
            {options.hint ? <Hint id={`${id}-hint`}>{options.hint}</Hint> : null}
          </div>
        )
      }}
    </form.Field>
  )

  return (
    <form
      id="settings-form"
      noValidate
      className="dash-panel flex min-w-0 flex-col gap-6 p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      {failure ? (
        <p role="alert" className="dash-tone-red rounded-lg px-3.5 py-2.5 text-[12.5px]">
          {failure.message}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="dash-eyebrow-quiet mb-3">YOUR DETAILS</legend>
        <div className="inv-grid2">
          {field('sellerName', 'Business name')}
          {field('sellerEmail', 'Email on invoices', { type: 'email' })}
          {field('sellerAddress', 'Address', { area: true, wide: true, placeholder: 'Street and number\nPostcode and city' })}
          <form.Field name="sellerCountry">
            {(api) => {
              const error = api.state.meta.errors[0] as string | undefined

              return (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="st-sellerCountry">Country</Label>
                  <CountryPicker
                    id="st-sellerCountry"
                    value={api.state.value}
                    onChange={(code) => api.handleChange(code)}
                    invalid={Boolean(error)}
                    describedBy={error ? errorId('st-sellerCountry') : undefined}
                  />
                  <FieldError id="st-sellerCountry" message={error} />
                </div>
              )
            }}
          </form.Field>
          {field('sellerPhone', 'Phone', { optional: true })}
          {field('sellerWebsite', 'Website', { optional: true })}
          {field('taxNumber', 'Tax number', { placeholder: '000/000/00000' })}
          {field('vatId', 'VAT ID', { optional: true, placeholder: 'DE…', hint: 'A tax number or a VAT ID is needed for real invoices.' })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="dash-eyebrow-quiet mb-3">TAX</legend>
        <form.Field name="taxMode">
          {(api) => (
            <div role="radiogroup" aria-label="Tax mode" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label className="inv-choice">
                <input type="radio" name="tax-mode" checked={api.state.value === 'kleinunternehmer'} onChange={() => api.handleChange('kleinunternehmer')} />
                <span>
                  <b className="block">Small business (§ 19 UStG)</b>
                  <small className="text-[12px] text-[var(--dash-quiet)]">No VAT is charged; each invoice says so.</small>
                </span>
              </label>
              <label className="inv-choice">
                <input type="radio" name="tax-mode" checked={api.state.value === 'standard'} onChange={() => api.handleChange('standard')} />
                <span>
                  <b className="block">Standard VAT</b>
                  <small className="text-[12px] text-[var(--dash-quiet)]">19 % (or 7 %, 0 %) per line.</small>
                </span>
              </label>
            </div>
          )}
        </form.Field>
        {taxMode === 'standard' ? (
          <form.Field name="defaultTaxRateBp">
            {(api) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="st-rate">Usual rate</Label>
                <select
                  id="st-rate"
                  className="dash-field h-10 w-40 px-2.5 text-[13px]"
                  value={api.state.value}
                  onChange={(event) => api.handleChange(Number(event.target.value) as Values['defaultTaxRateBp'])}
                >
                  <option value={1900}>19 %</option>
                  <option value={700}>7 %</option>
                  <option value={0}>0 %</option>
                </select>
              </div>
            )}
          </form.Field>
        ) : null}
        <Hint>This never switches by itself when your sales grow — you change it after checking with a tax adviser.</Hint>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="dash-eyebrow-quiet mb-3">BANK</legend>
        <div className="inv-grid2">
          {field('bankHolder', 'Account holder')}
          {field('bankIban', 'IBAN', { placeholder: 'DE00 0000 0000 0000 0000 00' })}
          {field('bankBic', 'BIC', { optional: true })}
          {field('bankName', 'Bank', { optional: true })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="dash-eyebrow-quiet mb-3">DEFAULTS FOR NEW INVOICES</legend>
        <div className="inv-grid2">
          {field('paymentTermsDays', 'Payment due within (days)')}
          <form.Field name="defaultLanguage">
            {(api) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="st-language">Language</Label>
                <select
                  id="st-language"
                  className="dash-field h-10 px-2.5 text-[13px]"
                  value={api.state.value}
                  onChange={(event) => api.handleChange(event.target.value as Values['defaultLanguage'])}
                >
                  <option value="de">German</option>
                  <option value="en">English</option>
                </select>
              </div>
            )}
          </form.Field>
          {field('testRecipientEmail', 'Test address', {
            optional: true,
            type: 'email',
            wide: true,
            hint: 'In test mode, every email draft goes here instead of to the client.',
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--dash-line)] pt-4">
        <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <span className="text-[12px] text-[var(--dash-quiet)]">Issued invoices keep the details they were issued with.</span>
      </div>
    </form>
  )
}

export function SettingsPage() {
  const { mode, liveAvailable, setMode, settings } = useInvoiceMode()

  return (
    <DashboardPage className="inv gap-4">
      <PageHead
        eyebrow="MONEY"
        title="Seller & tax"
        description="What every invoice says about you. Test details are fine for now — real invoices stay locked until this is complete and checked."
      />
      <TestBar mode={mode} showSettingsLink={false} />
      <SectionNav current="settings" />

      {settings.isError ? (
        <section className="dash-panel">
          <LoadFailure
            title="The settings could not be loaded"
            message="The server did not answer. Nothing has been changed."
            onRetry={() => void settings.refetch()}
          />
        </section>
      ) : !settings.data ? (
        <section className="dash-panel">
          <ListSkeleton rows={8} />
        </section>
      ) : (
        <div className="inv-side">
          <SettingsForm key={settings.data.revision} settings={settings.data} />
          <aside className="flex min-w-0 flex-col gap-4">
            <section className="dash-panel px-5 py-4">
              <h2 className="inv-sec-title mb-2.5">MODE</h2>
              <div className="flex items-center gap-3 rounded-[10px] border border-[var(--dash-line)] px-3 py-3">
                <span className="min-w-0 flex-1 text-[12.5px] text-[var(--dash-quiet)]">
                  <b className="block text-[13px] text-[var(--dash-ink)]">Test mode</b>
                  Everything is marked TEST and kept out of the tax archive.
                </span>
                <button
                  type="button"
                  role="switch"
                  className="inv-toggle"
                  aria-checked={mode === 'test'}
                  aria-label="Test mode"
                  aria-describedby="mode-why"
                  disabled={!liveAvailable}
                  onClick={() => setMode(mode === 'test' ? 'live' : 'test')}
                />
              </div>
              <p id="mode-why" className="mt-2.5 text-[12px] leading-relaxed text-[var(--dash-quiet)]">
                {liveAvailable
                  ? 'Real invoicing is available. Switch test mode off to write real invoices; each screen says which mode it shows.'
                  : 'Real invoices open only when the list below is complete and real invoicing has been switched on for this site after your tax setup is checked. Until then the switch stays on.'}
              </p>
            </section>
            <section className="dash-panel px-5 py-4">
              <h2 className="inv-sec-title mb-2.5">BEFORE REAL INVOICES</h2>
              <Readiness settings={settings.data} />
              <p className="mt-3 text-[12px] leading-relaxed text-[var(--dash-quiet)]">
                Also check outside this app: your real details instead of test ones, your tax setup with an adviser, and a live
                Stripe account.
              </p>
            </section>
          </aside>
        </div>
      )}
    </DashboardPage>
  )
}
