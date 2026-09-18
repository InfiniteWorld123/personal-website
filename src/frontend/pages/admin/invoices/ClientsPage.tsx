import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { ArrowLeft, Inbox, Plus, Search, UserPlus } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { Textarea } from '#/frontend/components/ui/textarea'
import { money } from '#/frontend/features/invoices/invoice-format'
import { leadsQuery } from '#/frontend/features/leads/lead-queries'
import {
  clientsQuery,
  useClientFromLead,
  useCreateClient,
  useDeleteClient,
  useUpdateClient,
} from '#/frontend/features/invoices/invoice-queries'
import { cn } from '#/frontend/lib/utils'
import type { Client } from '#/shared/types/invoice.types'
import type { ClientWriteInput, InvoiceLanguage } from '#/shared/validation/invoice.validation'

/**
 * Clients — the people he actually bills.
 *
 * Kept apart from the inbox on his instruction. Everyone who writes is a lead;
 * only some of them become a row here, and what a row here holds — a postal
 * address, a legal name, one day a VAT id — is exactly what `§14 UStG` puts on
 * the paper and what a mailbox has no use for.
 */

const EMPTY: ClientWriteInput = {
  company: '',
  contactName: '',
  email: '',
  phone: '',
  street: '',
  streetExtra: '',
  postcode: '',
  city: '',
  country: 'DE',
  vatId: '',
  language: 'de',
  notes: '',
  leadId: null,
}

const formOf = (client: Client): ClientWriteInput => ({
  company: client.company,
  contactName: client.contactName,
  email: client.email,
  phone: client.phone,
  street: client.street,
  streetExtra: client.streetExtra,
  postcode: client.postcode,
  city: client.city,
  country: client.country,
  vatId: client.vatId,
  language: client.language,
  notes: client.notes,
  leadId: client.leadId,
})

export function ClientsPage() {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [picking, setPicking] = useState(false)

  const clients = useQuery(clientsQuery(search))
  const rows = clients.data ?? []

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/invoices">
            <ArrowLeft className="size-4" /> Invoices
          </Link>
        </Button>

        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>

        <div className="ms-auto flex items-center gap-2">
          <div className="relative w-44">
            <Search className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              className="ps-8"
            />
          </div>
          {/*
            Two doors, his suggestion.
            Most clients start as somebody who wrote to him, so picking one out
            of the inbox carries their name, company and address line across and
            leaves only the postal address to type. The blank form stays for the
            client he meets in person and who never emailed at all.
          */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPicking((current) => !current)
              setEditing(null)
            }}
          >
            <Inbox className="size-4" /> From the inbox
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(editing === 'new' ? null : 'new')
              setPicking(false)
            }}
          >
            <Plus className="size-4" /> New client
          </Button>
        </div>
      </header>

      {picking ? (
        <LeadPicker
          taken={rows.map((client) => client.leadId).filter((id): id is string => id !== null)}
          onDone={(clientId) => {
            setPicking(false)
            // Straight into their form: what came across is never the postal
            // address, and the address is the one thing an invoice cannot do
            // without.
            setEditing(clientId)
          }}
        />
      ) : null}

      {editing === 'new' ? <ClientForm initial={EMPTY} onDone={() => setEditing(null)} /> : null}

      <div className="bg-card overflow-hidden rounded-xl border">
        {clients.isPending ? (
          <p className="text-muted-foreground p-6 text-sm">Loading…</p>
        ) : clients.isError ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
              The clients could not be loaded.
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {clients.error instanceof Error ? clients.error.message : 'Something went wrong.'}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium">No clients yet.</p>
            <p className="text-muted-foreground mt-1 text-sm">
              An invoice needs one — with a postal address, because the law puts it on the paper.
            </p>
          </div>
        ) : (
          rows.map((client) => (
            <div key={client.id} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => setEditing(editing === client.id ? null : client.id)}
                className="hover:bg-muted/60 flex w-full items-center gap-3 px-4 py-3 text-start transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {client.company || client.contactName}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {[client.company ? client.contactName : '', client.city, client.email]
                      .filter((part) => part && part.trim() !== '')
                      .join(' · ') || 'No address yet'}
                  </span>
                </span>

                {/* An address is not optional decoration: without it nothing
                    can be issued to this client, so the list says so here
                    rather than at the moment he presses Issue. */}
                {!client.street || !client.city ? (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                    No address
                  </span>
                ) : null}

                <span className="text-end">
                  <span className="text-muted-foreground block text-xs">
                    {client.invoiceCount === 0
                      ? 'No invoices'
                      : `${client.invoiceCount} ${client.invoiceCount === 1 ? 'invoice' : 'invoices'}`}
                  </span>
                  {client.openCents > 0 ? (
                    <span className="tabular block text-xs font-medium text-rose-600 dark:text-rose-400">
                      {money(client.openCents)} open
                    </span>
                  ) : null}
                </span>
              </button>

              {editing === client.id ? (
                <div className="border-t p-4">
                  <ClientForm
                    clientId={client.id}
                    initial={formOf(client)}
                    canDelete={client.invoiceCount === 0}
                    onDone={() => setEditing(null)}
                  />
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/**
 * Somebody who wrote to him, becoming somebody he can bill.
 *
 * Reads the lead list that already exists rather than adding an endpoint, and
 * hides the people who are clients already — a list offering to create a
 * duplicate is a list that has to be read carefully, and the whole point of
 * this door is that it can be used without thinking.
 */
function LeadPicker({
  taken,
  onDone,
}: {
  taken: string[]
  onDone: (clientId: string) => void
}) {
  const [term, setTerm] = useState('')
  const [error, setError] = useState('')

  const leads = useQuery(leadsQuery('ALL', term))
  const convert = useClientFromLead()

  const already = new Set(taken)
  const candidates = (leads.data?.rows ?? []).filter((lead) => !already.has(lead.id))

  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs font-semibold tracking-wide uppercase">Pick a person</h2>
        <div className="relative ms-auto w-full max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Name or email"
            className="ps-8"
          />
        </div>
      </div>

      {leads.isPending ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : leads.isError ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">
          The inbox could not be read: {leads.error instanceof Error ? leads.error.message : 'unknown'}
        </p>
      ) : candidates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {term
            ? 'Nobody matches that.'
            : 'Everyone who has written to you is already a client. Use New client instead.'}
        </p>
      ) : (
        <div className="border-border/70 max-h-72 divide-y overflow-y-auto rounded-lg border">
          {candidates.map((lead) => (
            <button
              key={lead.id}
              type="button"
              disabled={convert.isPending}
              className="hover:bg-muted/60 flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors disabled:opacity-50"
              onClick={() => {
                setError('')
                convert
                  .mutateAsync(lead.id)
                  .then((client) => onDone(client.id))
                  .catch((caught: unknown) =>
                    setError(
                      caught instanceof Error ? caught.message : 'That person could not be added.',
                    ),
                  )
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {lead.company?.trim() || lead.name}
                </span>
                <span className="text-muted-foreground block truncate text-xs" dir="ltr">
                  {lead.email}
                </span>
              </span>
              <UserPlus className="text-muted-foreground size-4 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  )
}

/**
 * The countries he could plausibly invoice, as a list rather than a text box.
 *
 * The field was free text validated against `^[A-Z]{2}$`, and the first thing
 * that happened in real use was that "Germany" was typed and the save was
 * refused — with the complaint printed at the bottom of a twelve-field form,
 * far from the field that caused it. A control that cannot hold a wrong value
 * is a better fix than a clearer error message.
 *
 * Germany first because that is almost every client; then the two countries
 * that share the language, then the rest of the single market, because
 * `country` is what a future VAT rule will read.
 */
const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: 'DE', name: 'Germany' },
  { code: 'AT', name: 'Austria' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'PL', name: 'Poland' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'DK', name: 'Denmark' },
  { code: 'SE', name: 'Sweden' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'TR', name: 'Türkiye' },
  { code: 'SY', name: 'Syria' },
]

/** A small heading over a group of fields, so twelve inputs read as three ideas. */
function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="flex flex-wrap items-baseline gap-2">
        <span className="text-xs font-semibold tracking-wide uppercase">{title}</span>
        {hint ? <span className="text-muted-foreground text-xs normal-case">{hint}</span> : null}
      </legend>
      {children}
    </fieldset>
  )
}

function ClientForm({
  clientId,
  initial,
  canDelete = false,
  onDone,
}: {
  clientId?: string
  initial: ClientWriteInput
  canDelete?: boolean
  onDone: () => void
}) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')

  const create = useCreateClient()
  const update = useUpdateClient()
  const remove = useDeleteClient()
  const busy = create.isPending || update.isPending || remove.isPending

  const set = (patch: Partial<ClientWriteInput>) => setForm((current) => ({ ...current, ...patch }))

  const field = (
    key: keyof ClientWriteInput,
    label: string,
    placeholder = '',
    className = '',
  ) => (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={`client-${key}`} className="text-muted-foreground text-xs">
        {label}
      </Label>
      <Input
        id={`client-${key}`}
        value={String(form[key] ?? '')}
        placeholder={placeholder}
        onChange={(event) => set({ [key]: event.target.value } as Partial<ClientWriteInput>)}
      />
    </div>
  )

  const save = () => {
    setError('')

    if (!form.company.trim() && !form.contactName.trim()) {
      setError('Give a company or a name.')

      return
    }

    const action = clientId
      ? update.mutateAsync({ clientId, ...form })
      : create.mutateAsync(form)

    action.then(onDone).catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : 'That could not be saved.'),
    )
  }

  const addressMissing = !form.street.trim() || !form.city.trim() || !form.postcode.trim()

  return (
    <div className="bg-card flex flex-col gap-6 rounded-xl border p-5">
      <Group title="Who they are" hint="One of the two is enough">
        <div className="grid gap-3 sm:grid-cols-2">
          {field('company', 'Company', 'Bäckerei Lange GmbH')}
          {field('contactName', 'Person', 'Tobias Lange')}
          {field('email', 'Email', 'tobias@example.de')}
          {field('phone', 'Phone', '+49 …')}
        </div>
      </Group>

      <Group title="Where they are" hint="§14 UStG puts this on every invoice">
        <div className="grid gap-3 sm:grid-cols-3">
          {field('street', 'Street and number', 'Musterstraße 8', 'sm:col-span-2')}
          {field('streetExtra', 'Extra line', 'c/o, building')}
          {field('postcode', 'Postcode', '99084')}
          {field('city', 'City', 'Erfurt')}

          {/*
            A list, not a text box: the value stored is the two-letter code the
            paper and any later VAT rule need, while what he reads is the name
            of the country.
          */}
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="client-country" className="text-muted-foreground text-xs">
              Country
            </Label>
            <select
              id="client-country"
              value={form.country}
              onChange={(event) => set({ country: event.target.value })}
              className="border-input bg-background h-9 min-w-0 rounded-md border px-3 text-sm"
            >
              {COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {addressMissing ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            You can save this now, but nothing can be issued to them until the address is complete.
          </p>
        ) : null}
      </Group>

      <Group title="Tax and language">
        <div className="grid gap-3 sm:grid-cols-2">
          {field('vatId', 'VAT ID', 'Only if they have one')}
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="client-language" className="text-muted-foreground text-xs">
              Language of their paper
            </Label>
            <select
              id="client-language"
              value={form.language}
              onChange={(event) => set({ language: event.target.value as InvoiceLanguage })}
              className="border-input bg-background h-9 min-w-0 rounded-md border px-3 text-sm"
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client-notes" className="text-muted-foreground text-xs">
            Notes
          </Label>
          <Textarea
            id="client-notes"
            rows={2}
            value={form.notes}
            placeholder="Anything you want beside their name — never printed on the invoice."
            onChange={(event) => set({ notes: event.target.value })}
          />
        </div>
      </Group>

      {/* Directly above the buttons, so it is read on the way to pressing one. */}
      {error ? (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button size="sm" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>

        {clientId ? (
          <Button
            variant="ghost"
            size="sm"
            className="ms-auto text-rose-600 dark:text-rose-400"
            // Refused in the service too. Said here so the button explains
            // itself instead of failing when he presses it.
            disabled={busy || !canDelete}
            title={canDelete ? undefined : 'Invoices were issued to this client, so they stay'}
            onClick={() => {
              remove
                .mutateAsync(clientId)
                .then(onDone)
                .catch((caught: unknown) =>
                  setError(caught instanceof Error ? caught.message : 'That could not be removed.'),
                )
            }}
          >
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  )
}
