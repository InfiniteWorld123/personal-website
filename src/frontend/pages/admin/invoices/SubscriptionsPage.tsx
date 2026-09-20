import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowLeft, Ban, FileText, Mail, Plus, Repeat, Trash2 } from 'lucide-react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelNote, PanelTitle } from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import { Textarea } from '#/frontend/components/ui/textarea'
import { subscriptionPaperUrl } from '#/frontend/api/invoice.api'
import { day, money } from '#/frontend/features/invoices/invoice-format'
import {
  clientsQuery,
  invoicesQuery,
  sellerQuery,
  subscriptionLetterQuery,
  subscriptionsQuery,
  useCancelSubscription,
  useCreateSubscription,
  useDeleteSubscription,
  useUpdateSubscription,
} from '#/frontend/features/invoices/invoice-queries'
import { usePrefetch } from '#/frontend/lib/prefetch'
import { cn } from '#/frontend/lib/utils'
import type { Subscription } from '#/shared/types/invoice.types'
import {
  LAST_BILLING_DAY,
  VAT_RATES,
  VAT_RATE_LABEL,
  plannedInvoices,
  subscriptionLine,
  type SubscriptionWriteInput,
} from '#/shared/validation/invoice.validation'

/**
 * Subscriptions — the money that does not stop.
 *
 * *«التقسيط ينتهي. الاشتراك لا ينتهي.»*
 *
 * Three fields, and that is the whole feature: a client, an amount, a day of
 * the month. Deliberately not the tier model `0012` carried and `0013`
 * deleted — tiers, add-ons and instalment schedules each assume a price list
 * he has not settled, and building them again before he has would be the same
 * mistake with a year's delay.
 *
 * The screen says twice, in different words, what the generator actually does:
 * it writes a **draft**, and he issues it. Nothing here ever sends a client an
 * invoice by itself, because an issued invoice is permanent and a generator
 * that issued would turn a bug in this section into paper in his books.
 */

const EMPTY: SubscriptionWriteInput = {
  clientId: '',
  description: '',
  amountEuros: 0,
  // Zero while §19 applies, which is every subscription he writes this year.
  taxRate: 0,
  billingDay: 1,
  note: '',
}

/** A native select wearing the same clothes as `Input`, as in `ClientsPage`. */
const SELECT =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full min-w-0 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 motion-safe:transition-colors dark:bg-input/30'

/** `1` → `1st`, for the sentence under the form rather than a bare number. */
const ordinal = (day: number): string => {
  if (day > 3 && day < 21) return `${day}th`

  return `${day}${{ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th'}`
}

function Form({
  value,
  onChange,
  onSubmit,
  onCancel,
  saving,
  error,
  editing,
}: {
  value: SubscriptionWriteInput
  onChange: (next: SubscriptionWriteInput) => void
  onSubmit: () => void
  onCancel: () => void
  saving: boolean
  error: string
  editing: boolean
}) {
  const clients = useQuery(clientsQuery(''))
  const seller = useQuery(sellerQuery())
  const set = <K extends keyof SubscriptionWriteInput>(
    key: K,
    next: SubscriptionWriteInput[K],
  ) => onChange({ ...value, [key]: next })

  return (
    <Panel className="flex flex-col gap-4 p-6">
      <PanelTitle>{editing ? 'Change this subscription' : 'A new subscription'}</PanelTitle>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub-client">Who pays</Label>
          <select
            id="sub-client"
            className={SELECT}
            value={value.clientId}
            onChange={(event) => set('clientId', event.target.value)}
          >
            <option value="">Pick a client…</option>
            {clients.data?.map((client) => (
              <option key={client.id} value={client.id}>
                {client.company || client.contactName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub-description">What they pay for</Label>
          <Input
            id="sub-description"
            value={value.description}
            onChange={(event) => set('description', event.target.value)}
            placeholder="Website-Betreuung"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub-amount">How much, € per month</Label>
          <Input
            id="sub-amount"
            type="number"
            min="0"
            step="0.01"
            value={value.amountEuros || ''}
            onChange={(event) => set('amountEuros', Number(event.target.value))}
            placeholder="49.00"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub-tax">VAT</Label>
          {/*
            Two options, not a number box. His own request, and the right one:
            a typo like 1,9 in a free field bills wrong every month until
            somebody reads a PDF closely — and there is no third answer to
            pick, because 7 % covers books and food, not software.
          */}
          <select
            id="sub-tax"
            className={SELECT}
            value={value.taxRate}
            onChange={(event) => set('taxRate', Number(event.target.value) as 0 | 19)}
          >
            {VAT_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {VAT_RATE_LABEL[rate]}
              </option>
            ))}
          </select>
          {/*
            The same fact the invoice editor states, missing here until 20 Sep:
            picking 19 % while §19 applies writes a draft every month that
            `issueInvoice` will refuse — correctly, but he would only find out
            at the last step, thirty days from now, on a document he did not
            write. The moment to say it is while his hand is on the rate.
          */}
          {value.taxRate > 0 && seller.data?.smallBusiness ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              You are a Kleinunternehmer — every draft this writes will be refused at issue
              until the rate is 0 or seller.ts says otherwise.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Every invoice this writes carries this rate.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub-day">Which day of the month</Label>
          <select
            id="sub-day"
            className={SELECT}
            value={value.billingDay}
            onChange={(event) => set('billingDay', Number(event.target.value))}
          >
            {Array.from({ length: LAST_BILLING_DAY }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {ordinal(index + 1)}
              </option>
            ))}
          </select>
          {/*
            Said here rather than left as a shorter list nobody explains. The
            28th is the last day every month has, so no subscription ever needs
            a rule about what February means.
          */}
          <p className="text-muted-foreground text-xs">
            Up to the {LAST_BILLING_DAY}th — the last day every month has, February included.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sub-note">A note for you</Label>
        <Textarea
          id="sub-note"
          rows={2}
          value={value.note}
          onChange={(event) => set('note', event.target.value)}
          placeholder="Agreed on the call, 12 Sept. Review the price in a year."
        />
      </div>

      <p className="text-muted-foreground text-sm">
        On the {ordinal(value.billingDay)} of each month this writes a{' '}
        <span className="font-medium">draft</span> invoice reading{' '}
        <span className="text-foreground">
          {value.description.trim() || 'What they pay for'} · October 2026
        </span>
        . You read it and press Issue. Nothing is ever sent by itself.
      </p>

      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button className="rounded-full" onClick={onSubmit} disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save' : 'Start it'}
        </Button>
        <Button className="rounded-full" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Panel>
  )
}

function Row({
  subscription,
  onEdit,
}: {
  subscription: Subscription
  onEdit: () => void
}) {
  const stop = useCancelSubscription()
  const remove = useDeleteSubscription()
  const [error, setError] = useState('')
  const [handing, setHanding] = useState(false)

  const navigate = useNavigate()
  const client = useQueryClient()

  const live = subscription.cancelledOn === null

  /**
   * Hands the agreement to the inbox and goes there.
   *
   * `fetchQuery` rather than a mutation, exactly as on an issued invoice:
   * preparing the letter is idempotent, and the composer asks for the same
   * thing a moment later — one shared request means the PDF is copied once.
   *
   * Deliberately **not** prefetched on hover. Preparing a letter resolves the
   * person, may create them, and attaches the file to the thread; a prefetch
   * must never do something a click has not asked for yet.
   */
  const handOver = async () => {
    setError('')
    setHanding(true)

    try {
      const letter = await client.fetchQuery(subscriptionLetterQuery(subscription.id))

      await navigate({
        to: '/admin/inbox/$personId',
        params: { personId: letter.personId },
        search: { subscription: subscription.id },
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The letter could not be prepared.')
    } finally {
      setHanding(false)
    }
  }

  return (
    <div className="border-border/60 flex flex-wrap items-center gap-3 border-b px-5 py-4 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="truncate text-sm font-medium">{subscription.clientName}</span>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-medium',
              live
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-border bg-muted text-muted-foreground',
            )}
          >
            {live ? 'Running' : 'Stopped'}
          </span>
        </span>

        <span className="text-muted-foreground block truncate text-xs">
          {subscription.description}
          {' · '}
          {live ? (
            <>
              {money(subscription.amountCents, subscription.currency)} on the{' '}
              {ordinal(subscription.billingDay)}
              {subscription.taxRate > 0 ? ` · ${subscription.taxRate} % VAT` : null}
            </>
          ) : (
            <>stopped {day(subscription.cancelledOn)}</>
          )}
          </span>

        {/*
          What it is about to do, before it does it.

          The generator writes one draft a month, silently, and until this
          there was no way to watch it except to wait a month and hope. He said
          so in those words: he could not see it and could not test it. Three
          rows of plain text — the date, the line, the amount — turn a promise
          into something he can check against the invoice list tomorrow.

          Only while it is running. A stopped subscription is about to do
          nothing, and showing it a future would be the lie this fixes.
        */}
        {live ? (
          <span className="mt-2 block">
            <span className="text-muted-foreground block text-[11px] font-medium">
              Next, as drafts:
            </span>
            {plannedInvoices(subscription.nextPeriod, subscription.billingDay).map((planned) => (
              <span
                key={planned.period}
                className="text-muted-foreground block truncate text-[11px]"
              >
                {day(planned.on)} — {subscriptionLine(subscription.description, planned.period, 'de')}
                {' · '}
                <span className="tabular">
                  {money(subscription.amountCents, subscription.currency)}
                </span>
              </span>
            ))}
            {/*
              He asked whether three months is all of it. Three is what a list
              can usefully show; the arrangement itself has no end, and a
              schedule that simply stopped after the third line invited exactly
              that question.
            */}
            <span className="text-muted-foreground block text-[11px]">
              … and on, every month, until you stop it.
            </span>
          </span>
        ) : null}

        {/*
          The invoices it has written, reachable.
          "2 invoices so far" as plain text was a fact he could see and not
          follow — and the invoice is where the PDF lives, which is what he
          asked for. A subscription has no document of its own; it is an
          arrangement, and its paper is the invoices underneath it.
        */}
        {subscription.invoiceCount > 0 ? (
          <Link
            to="/admin/invoices"
            search={{ search: subscription.description }}
            className="text-muted-foreground hover:text-primary block truncate text-xs underline-offset-2 hover:underline"
          >
            {subscription.invoiceCount} invoice{subscription.invoiceCount === 1 ? '' : 's'} written
            so far — open them
          </Link>
        ) : null}

        {error ? <span className="block text-xs text-rose-600 dark:text-rose-400">{error}</span> : null}
      </span>

      <span className="tabular text-sm font-semibold">
        {money(subscription.amountCents, subscription.currency)}
        <span className="text-muted-foreground font-normal"> /mo</span>
      </span>

      <span className="flex shrink-0 gap-1">
        {/*
          The paper the arrangement has, which is not an invoice.

          Offered on a stopped subscription too: the page then says it has
          ended, and that is exactly the copy somebody asks for months later.
        */}
        <Button className="rounded-full" size="sm" variant="ghost" asChild title="The agreement, as a PDF">
          <a href={subscriptionPaperUrl(subscription.id)} target="_blank" rel="noreferrer">
            <FileText className="size-4" />
            <span className="sr-only">Open the agreement</span>
          </a>
        </Button>

        {/*
          Goes to the inbox, it does not send — the same rule the invoice
          screen follows, and the reason a sent agreement appears in the
          conversation with the person who received it.
        */}
        <Button
          className="rounded-full"
          size="sm"
          variant="ghost"
          disabled={handing}
          title="Write the letter that carries it"
          onClick={() => void handOver()}
        >
          <Mail className="size-4" />
          <span className="sr-only">Write the letter</span>
        </Button>

        {live ? (
          <>
            <Button className="rounded-full" size="sm" variant="outline" onClick={onEdit}>
              Change
            </Button>
            <Button
              className="rounded-full"
              size="sm"
              variant="ghost"
              disabled={stop.isPending}
              onClick={() => void stop.mutateAsync(subscription.id).catch(() => {})}
              title="Stop billing them. The invoices it already wrote stay."
            >
              <Ban className="size-4" />
              <span className="sr-only">Stop this subscription</span>
            </Button>
          </>
        ) : null}

        {/*
          Only while it has written nothing. After that, deleting would cut
          real invoices loose from where they came from — the server refuses,
          and the button is not offered in the first place.
        */}
        {subscription.invoiceCount === 0 ? (
          <Button
            className="rounded-full text-rose-600 dark:text-rose-400"
            size="sm"
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => {
              setError('')
              remove
                .mutateAsync(subscription.id)
                .catch((caught: unknown) =>
                  setError(caught instanceof Error ? caught.message : 'That could not be removed.'),
                )
            }}
          >
            <Trash2 className="size-4" />
            <span className="sr-only">Remove this subscription</span>
          </Button>
        ) : null}
      </span>
    </div>
  )
}

export function SubscriptionsPage() {
  const prefetch = usePrefetch()
  const [form, setForm] = useState<(SubscriptionWriteInput & { id?: string }) | null>(null)
  const [error, setError] = useState('')

  const subscriptions = useQuery(subscriptionsQuery())
  const create = useCreateSubscription()
  const update = useUpdateSubscription()

  const saving = create.isPending || update.isPending

  const submit = () => {
    if (!form) return

    setError('')

    const { id, ...input } = form
    const run = id ? update.mutateAsync({ subscriptionId: id, ...input }) : create.mutateAsync(input)

    run
      .then(() => setForm(null))
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'That could not be saved.'),
      )
  }

  const monthly = (subscriptions.data ?? [])
    .filter((subscription) => subscription.cancelledOn === null)
    .reduce((sum, subscription) => sum + subscription.amountCents, 0)

  return (
    <AdminPage>
      <PageHeader
        back={
          <Button asChild className="-ms-2 w-fit rounded-full" size="sm" variant="ghost">
            <Link to="/admin/invoices" {...prefetch(invoicesQuery('ALL', ''), sellerQuery())}>
              <ArrowLeft className="size-4" /> Invoices
            </Link>
          </Button>
        }
        title="Subscriptions"
        description="Money that does not stop. Each one writes a draft invoice every month — you read it and issue it."
        actions={
          form ? null : (
            <Button className="rounded-full" size="sm" onClick={() => setForm({ ...EMPTY })}>
              <Plus className="size-4" /> New subscription
            </Button>
          )
        }
      />

      {/*
        One figure, and it is the one his business rests on: what arrives every
        month whether or not he sells anything. Build money cannot reach it —
        these rows are subscriptions by construction.
      */}
      {!subscriptions.isPending && monthly > 0 ? (
        <Panel className="flex items-center gap-3 p-5">
          <Repeat className="text-primary size-5 shrink-0" aria-hidden="true" />
          <p className="text-sm">
            <span className="font-heading tabular text-primary text-xl font-semibold">
              {money(monthly)}
            </span>{' '}
            <span className="text-muted-foreground">
              every month, from{' '}
              {(subscriptions.data ?? []).filter((one) => one.cancelledOn === null).length}{' '}
              subscription(s). This is the figure that does not depend on selling anything new.
            </span>
          </p>
        </Panel>
      ) : null}

      {form ? (
        <Form
          value={form}
          onChange={(next) => setForm({ ...next, id: form.id })}
          onSubmit={submit}
          onCancel={() => {
            setForm(null)
            setError('')
          }}
          saving={saving}
          error={error}
          editing={Boolean(form.id)}
        />
      ) : null}

      <Panel className="overflow-hidden">
        {subscriptions.isPending ? (
          <SkeletonScreen label="Loading the subscriptions">
            {Array.from({ length: 3 }, (_, index) => (
              <div
                className="border-border/60 flex items-center gap-3 border-b px-5 py-4 last:border-b-0"
                key={index}
              >
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="mt-2 h-3 w-64" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </SkeletonScreen>
        ) : subscriptions.isError ? (
          <PanelNote tone="error">
            <div>
              <p className="text-foreground font-medium">That could not be read.</p>
              <p className="mt-1">The subscriptions are there; this page could not reach them.</p>
            </div>
            <Button onClick={() => void subscriptions.refetch()} size="sm" variant="outline">
              Try again
            </Button>
          </PanelNote>
        ) : (subscriptions.data?.length ?? 0) === 0 ? (
          <PanelNote>
            <div>
              <p className="text-foreground font-medium">No subscriptions yet.</p>
              <p className="mt-1">
                A subscription is a client, an amount, and a day of the month. From then on the
                invoice writes itself — as a draft, every month, until you stop it.
              </p>
            </div>
          </PanelNote>
        ) : (
          subscriptions.data?.map((subscription) => (
            <Row
              key={subscription.id}
              subscription={subscription}
              onEdit={() =>
                setForm({
                  id: subscription.id,
                  clientId: subscription.clientId,
                  description: subscription.description,
                  amountEuros: subscription.amountCents / 100,
                  taxRate: subscription.taxRate === 19 ? 19 : 0,
                  billingDay: subscription.billingDay,
                  note: subscription.note,
                })
              }
            />
          ))
        )}
      </Panel>

      <p className="text-muted-foreground text-xs">
        Drafts appear when you open the invoice list. Nothing is issued or sent by itself — an
        issued invoice keeps its number for ever, and that decision stays yours.
      </p>

      {/*
        What the paper button is for, said once on the screen it lives on.

        Without this the document icon beside a row is a mystery, and the
        first thing he would do is press it to find out — which is harmless,
        but the sentence is cheaper than the guess.
      */}
      <p className="text-muted-foreground text-xs">
        The document icon opens the <span className="text-foreground">agreement</span>: one page
        saying what was agreed, how much per month and from which month. It is not an invoice and
        asks for no money — the envelope beside it writes the letter that carries it.
      </p>
    </AdminPage>
  )
}
