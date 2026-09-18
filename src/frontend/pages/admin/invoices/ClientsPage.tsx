import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { ArrowLeft, Inbox, Plus, Search, UserPlus } from 'lucide-react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelNote } from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import { Textarea } from '#/frontend/components/ui/textarea'
import { money } from '#/frontend/features/invoices/invoice-format'
import { leadsQuery } from '#/frontend/features/leads/lead-queries'
import {
  clientsQuery,
  invoicesQuery,
  sellerQuery,
  useClientFromLead,
  useCreateClient,
  useDeleteClient,
  useUpdateClient,
} from '#/frontend/features/invoices/invoice-queries'
import { usePrefetch } from '#/frontend/lib/prefetch'
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

/**
 * A native select wearing the same clothes as `Input`.
 *
 * The three hand-styled selects in this section were a half-centimetre taller
 * than the text fields beside them and carried a different radius, which is the
 * kind of difference nobody can name and everybody can see. Matching the
 * primitive exactly — height, radius, border, transparent surface so the panel
 * shows through — is what makes a row of controls read as one row.
 */
const SELECT =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 motion-safe:transition-colors dark:bg-input/30'

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

/** The same rows, not yet arrived: two lines of name and meta, a figure at the end. */
function RowsSkeleton() {
  return (
    <SkeletonScreen label="Loading the clients">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          className="border-border/60 flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0"
          key={index}
        >
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="mt-2 h-3 w-56" />
          </div>
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </SkeletonScreen>
  )
}

export function ClientsPage() {
  const prefetch = usePrefetch()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [picking, setPicking] = useState(false)

  /**
   * Every keystroke is a new query key, and without this the whole list would
   * fall back to its skeleton on each one — a flicker that reads as breakage.
   * The previous rows stay, dimmed, until the narrower answer arrives.
   */
  const clients = useQuery({ ...clientsQuery(search), placeholderData: keepPreviousData })
  const rows = clients.data ?? []

  return (
    <AdminPage>
      <PageHeader
        back={
          <Button asChild className="-ms-2 w-fit rounded-full" size="sm" variant="ghost">
            {/* What the list behind this page will ask for, warmed on the way back. */}
            <Link to="/admin/invoices" {...prefetch(invoicesQuery('ALL', ''), sellerQuery())}>
              <ArrowLeft className="size-4" /> Invoices
            </Link>
          </Button>
        }
        title="Clients"
        description="Everyone you can put on a piece of paper — and the address the law needs beside their name."
        actions={
          <>
            {/*
              Two doors, his suggestion.
              Most clients start as somebody who wrote to him, so picking one out
              of the inbox carries their name, company and address line across and
              leaves only the postal address to type. The blank form stays for the
              client he meets in person and who never emailed at all.
            */}
            <Button
              className="rounded-full"
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
              className="rounded-full"
              size="sm"
              onClick={() => {
                setEditing(editing === 'new' ? null : 'new')
                setPicking(false)
              }}
            >
              <Plus className="size-4" /> New client
            </Button>
          </>
        }
      />

      <div className="relative w-full max-w-xs">
        <Search className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search"
          className="bg-panel ps-8"
        />
      </div>

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

      {editing === 'new' ? (
        <Panel className="p-6">
          <ClientForm initial={EMPTY} onDone={() => setEditing(null)} />
        </Panel>
      ) : null}

      <Panel
        className={cn(
          'overflow-hidden motion-safe:transition-opacity',
          clients.isPlaceholderData && 'opacity-60',
        )}
      >
        {clients.isPending ? (
          <RowsSkeleton />
        ) : clients.isError ? (
          <PanelNote tone="error">
            <div>
              <p className="font-medium">The clients could not be loaded.</p>
              <p className="text-muted-foreground mt-1">
                {clients.error instanceof Error ? clients.error.message : 'Something went wrong.'}
              </p>
            </div>
            <Button onClick={() => void clients.refetch()} size="sm" variant="outline">
              Try again
            </Button>
          </PanelNote>
        ) : rows.length === 0 ? (
          <PanelNote>
            <div>
              <p className="text-foreground font-medium">No clients yet.</p>
              <p className="mt-1">
                An invoice needs one — with a postal address, because the law puts it on the paper.
              </p>
            </div>
          </PanelNote>
        ) : (
          rows.map((client) => (
            <div className="border-border/60 border-b last:border-b-0" key={client.id}>
              <button
                type="button"
                aria-expanded={editing === client.id}
                onClick={() => setEditing(editing === client.id ? null : client.id)}
                className={cn(
                  'hover:bg-accent/50 focus-visible:ring-ring flex w-full items-center gap-3 px-5 py-3.5 text-start motion-safe:transition-colors focus-visible:ring-2 focus-visible:-outline-offset-2 focus-visible:outline-none',
                  editing === client.id && 'bg-accent/40',
                )}
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
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] whitespace-nowrap text-amber-700 dark:text-amber-400">
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

              {/* Carved into the panel rather than floated on top of it: the
                  form belongs to the row above it, and a second raised card
                  inside a raised card says the opposite. */}
              {editing === client.id ? (
                <div className="bg-canvas border-border/60 border-t px-5 py-5">
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
      </Panel>
    </AdminPage>
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
    <Panel className="flex flex-col gap-3 p-6">
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
        /* The same rows, at the same height, so the panel does not resize
           under the pointer the moment the inbox answers. */
        <SkeletonScreen
          className="bg-canvas border-border/60 rounded-2xl border"
          label="Loading the inbox"
        >
          {Array.from({ length: 4 }, (_, index) => (
            <div
              className="border-border/60 flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0"
              key={index}
            >
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="mt-2 h-3 w-48" />
              </div>
              <Skeleton className="size-4 shrink-0 rounded-full" />
            </div>
          ))}
        </SkeletonScreen>
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
        <div className="bg-canvas border-border/60 max-h-72 overflow-y-auto rounded-2xl border">
          {candidates.map((lead) => (
            <button
              key={lead.id}
              type="button"
              disabled={convert.isPending}
              className="hover:bg-accent/50 focus-visible:ring-ring border-border/60 flex w-full items-center gap-3 border-b px-5 py-3.5 text-start last:border-b-0 motion-safe:transition-colors focus-visible:ring-2 focus-visible:-outline-offset-2 focus-visible:outline-none disabled:opacity-50"
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
    </Panel>
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

/**
 * The form itself, deliberately without a surface of its own.
 *
 * It is rendered in two places — floating on the canvas for a new client, and
 * carved into the list under the row it belongs to — and each caller gives it
 * the ground it should sit on.
 */
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
    <div className="flex flex-col gap-6">
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
              className={SELECT}
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
              className={SELECT}
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

      <div className="border-border/60 flex flex-wrap items-center gap-2 border-t pt-4">
        <Button className="rounded-full" size="sm" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button className="rounded-full" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>

        {clientId ? (
          <Button
            variant="ghost"
            size="sm"
            className="ms-auto rounded-full text-rose-600 dark:text-rose-400"
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
