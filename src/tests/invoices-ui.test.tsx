// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { InvoiceSettings, OwnerInvoice, OwnerInvoiceListItem } from '#/backend2/contracts/invoice.contract'

/**
 * The Invoices screens in the Dashboard, against a faked API
 * (`docs/v2/invoices.md`, approved in the Invoices Design Lab, 24 Sep 2026).
 *
 * The backend suites prove the money rules. These prove the screens tell the
 * truth about them: a draft saves with only a client while issuing checks
 * everything the server checks, each problem lands under its field and the
 * first one takes focus, the checks stay quiet until the first attempt and
 * then follow typing, a payment is recorded once however often the button is
 * pressed, lists are paged by the server, and every state — loading, empty,
 * failed, refused, missing — says what happened.
 */

/* ------------------------------------------------------------- the seams */

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, search: _search, params: _params, ...rest }: { to: string; children: ReactNode; search?: unknown; params?: unknown }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
  createFileRoute: () => (options: unknown) => ({ options }),
}))

const api = {
  listInvoices: vi.fn(),
  readSummary: vi.fn(),
  readInvoice: vi.fn(),
  createInvoice: vi.fn(),
  patchInvoice: vi.fn(),
  deleteDraft: vi.fn(),
  issueInvoice: vi.fn(),
  previewPdf: vi.fn(),
  documentPdf: vi.fn(),
  receiptPdf: vi.fn(),
  sendInvoice: vi.fn(),
  paymentLink: vi.fn(),
  recordPayment: vi.fn(),
  voidPayment: vi.fn(),
  recordRefund: vi.fn(),
  cancelInvoice: vi.fn(),
  correctInvoice: vi.fn(),
  readSettings: vi.fn(),
  saveSettings: vi.fn(),
  proposeRate: vi.fn(),
  yearArchive: vi.fn(),
  listSubscriptions: vi.fn(),
  readSubscription: vi.fn(),
  createSubscription: vi.fn(),
  pauseSubscription: vi.fn(),
  resumeSubscription: vi.fn(),
  endSubscription: vi.fn(),
  changePrice: vi.fn(),
  addDiscount: vi.fn(),
  endDiscount: vi.fn(),
  addFreePeriod: vi.fn(),
  cardSetup: vi.fn(),
  listPeriods: vi.fn(),
  listNotices: vi.fn(),
  saveBlob: vi.fn(),
}

vi.mock('#/frontend/features/invoices-v2/api', () => api)

const clientsApi = { listClients: vi.fn(), readClient: vi.fn(), createClient: vi.fn(), findDuplicates: vi.fn() }

vi.mock('#/frontend/features/clients/api', () => clientsApi)

const { ApiRequestError } = await import('#/frontend/api/response')
const { InvoicesPage } = await import('#/frontend/pages/dashboard/invoices/InvoicesPage')
const { InvoicePage } = await import('#/frontend/pages/dashboard/invoices/InvoicePage')
const { InvoiceEditor } = await import('#/frontend/pages/dashboard/invoices/InvoiceEditor')
const { PaymentDialog } = await import('#/frontend/pages/dashboard/invoices/IssuedInvoice')
const { settingsErrors } = await import('#/frontend/pages/dashboard/invoices/SettingsPage')
const form = await import('#/frontend/features/invoices-v2/invoice-form')
const money = await import('#/frontend/features/invoices-v2/money')
const subscriptionForm = await import('#/frontend/features/invoices-v2/subscription-form')
const search = await import('#/frontend/features/invoices-v2/invoice-search')
const contract = await import('#/backend2/contracts/invoice.contract')
const { Route: listRoute } = await import('#/frontend/routes/dashboard.invoices.index')
const { Route: subscriptionsRoute } = await import('#/frontend/routes/dashboard.invoices.subscriptions.index')

/* -------------------------------------------------------------- fixtures */

const ID = '11111111-1111-4111-8111-111111111111'
const CLIENT = '22222222-2222-4222-8222-222222222222'
const TODAY = contract.berlinToday()

const SETTINGS: InvoiceSettings = {
  sellerName: '',
  sellerAddress: '',
  sellerCountry: 'DE',
  sellerEmail: '',
  sellerPhone: '',
  sellerWebsite: '',
  taxNumber: '',
  vatId: '',
  bankHolder: '',
  bankIban: '',
  bankBic: '',
  bankName: '',
  taxMode: 'kleinunternehmer',
  defaultTaxRateBp: 1900,
  paymentTermsDays: 14,
  defaultLanguage: 'de',
  testRecipientEmail: '',
  revision: 1,
  updatedAt: '2026-09-24T08:00:00.000Z',
  readiness: { liveReady: false, missing: ['sellerName'], liveEnabled: false },
}

const listItem = (over: Partial<OwnerInvoiceListItem> = {}): OwnerInvoiceListItem => ({
  id: ID,
  mode: 'test',
  kind: 'invoice',
  status: 'issued',
  paymentState: 'unpaid',
  number: 'TEST-2026-0001',
  client: { id: CLIENT, displayName: 'Probe & Co' },
  recipientName: 'Lina Probe',
  currency: 'EUR',
  language: 'de',
  issueDate: '2026-09-22',
  dueDate: '2026-10-06',
  totalMinor: 189_000,
  amountDueMinor: 189_000,
  subscriptionId: null,
  createdAt: '2026-09-22T10:00:00.000Z',
  updatedAt: '2026-09-22T10:00:00.000Z',
  ...over,
})

const invoice = (over: Partial<OwnerInvoice> = {}): OwnerInvoice => ({
  ...listItem(),
  title: '',
  recipient: { name: 'Lina Probe', company: 'Probe & Co', address: 'Beispielweg 12\n99084 Erfurt', country: 'DE', email: 'lina@example.de', vatId: '' },
  serviceDateFrom: null,
  serviceDateTo: null,
  paymentTermsDays: 14,
  discountType: 'none',
  discountValue: 0,
  taxMode: 'kleinunternehmer',
  reverseCharge: false,
  allowBank: true,
  allowStripe: false,
  notes: '',
  internalNote: '',
  fx: null,
  lines: [{ position: 0, description: 'Website', unit: '', quantityMilli: 1000, unitPriceMinor: 189_000, taxRateBp: null, netMinor: 189_000, service: null }],
  installments: [],
  money: {
    subtotalMinor: 189_000,
    discountMinor: 0,
    netMinor: 189_000,
    taxMinor: 0,
    totalMinor: 189_000,
    paidMinor: 0,
    refundedMinor: 0,
    amountDueMinor: 189_000,
    refundableMinor: 0,
  },
  taxGroups: [],
  issueProblems: [],
  payments: [],
  refunds: [],
  documents: [],
  cancels: null,
  cancelledBy: null,
  replaces: null,
  replacedBy: null,
  periodStart: null,
  periodEnd: null,
  stripeCheckoutUrl: null,
  collectionFailed: false,
  inboxDraftId: null,
  sentAt: null,
  issuedAt: '2026-09-22T10:05:00.000Z',
  cancelledAt: null,
  cancelReason: '',
  revision: 3,
  ...over,
})

const page = <T,>(items: T[], over: Record<string, unknown> = {}) => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
  pageCount: 1,
  hasMore: false,
  ...over,
})

const SUMMARY = {
  mode: 'test',
  open: [
    { currency: 'EUR', count: 2, amountDueMinor: 158_500 },
    { currency: 'USD', count: 1, amountDueMinor: 205_000 },
  ],
  overdue: [{ currency: 'EUR', count: 1, amountDueMinor: 64_000 }],
  counts: { all: 9, draft: 2, open: 3, overdue: 1, paid: 3, cancelled: 1 },
}

const wrap = (ui: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  for (const fn of [...Object.values(api), ...Object.values(clientsApi)]) fn.mockReset()
  navigate.mockReset()
  api.readSettings.mockResolvedValue(SETTINGS)
  api.readSummary.mockResolvedValue(SUMMARY)
  api.listSubscriptions.mockResolvedValue(page([]))
  api.listInvoices.mockResolvedValue(page([]))
  clientsApi.listClients.mockResolvedValue(page([]))
  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0)

    return 0
  }
})

afterEach(cleanup)

/* ================================================================ rules */

describe('the editor’s two sets of rules', () => {
  const filled = (over: Partial<ReturnType<typeof form.emptyInvoiceForm>> = {}) => ({
    ...form.emptyInvoiceForm(SETTINGS),
    clientId: CLIENT,
    recipient: { name: 'Lina Probe', company: '', address: 'Beispielweg 12', country: 'DE', email: '', vatId: '' },
    lines: [form.emptyLine({ description: 'Website', unitPrice: '1890' })],
    ...over,
  })
  const tax = { taxMode: 'kleinunternehmer' as const, defaultTaxRateBp: 1900 }

  it('saves a half-written draft as long as it has a client', () => {
    const blank = form.emptyInvoiceForm(SETTINGS)

    expect(form.draftErrors(blank)).toEqual({ clientId: 'Choose who this invoice is for' })
    expect(form.draftErrors({ ...blank, clientId: CLIENT })).toEqual({})
  })

  it('refuses numbers the server could not read, even in a draft', () => {
    const errors = form.draftErrors(filled({ lines: [form.emptyLine({ quantity: 'two', unitPrice: '12,345.678' })] }))

    expect(errors['lines[0].quantity']).toContain('1.5')
    expect(errors['lines[0].unitPrice']).toContain('49.90')
  })

  it('checks everything the server checks before issuing, per field', () => {
    const errors = form.issueErrors(
      filled({
        recipient: form.emptyRecipient(),
        lines: [form.emptyLine()],
      }),
      tax,
      TODAY,
    )

    expect(errors['recipient.name']).toBeDefined()
    expect(errors['recipient.address']).toBe('Enter the full billing address')
    expect(errors['lines[0].description']).toBe('Describe this line or remove it')
    expect(form.issueErrors(filled(), tax, TODAY)).toEqual({})
  })

  it('demands a payment plan that adds up exactly to the total', () => {
    const plan = filled({
      plan: true,
      installments: [
        { key: 'a', amount: '1000', dueDate: TODAY, label: '' },
        { key: 'b', amount: '800', dueDate: contract.addDays(TODAY, 30), label: '' },
      ],
    })

    expect(form.issueErrors(plan, tax, TODAY).installments).toBe('The parts must add up exactly to the total')
    expect(form.planMeter(180_000, 189_000, 'EUR')).toEqual({ text: '€90.00 not planned yet', ok: false })

    const [first, second] = form.splitEvenly(189_001, 2)

    expect(first! + second!).toBe(189_001)
    expect(
      form.issueErrors({ ...plan, installments: [{ ...plan.installments[0]!, amount: '945' }, { ...plan.installments[1]!, amount: '945' }] }, tax, TODAY),
    ).toEqual({})
  })

  it('refuses reverse charge without standard VAT or the client’s VAT ID', () => {
    expect(form.issueErrors(filled({ reverseCharge: true }), tax, TODAY).reverseCharge).toContain('standard VAT')
    expect(form.issueErrors(filled({ reverseCharge: true }), { ...tax, taxMode: 'standard' }, TODAY)['recipient.vatId']).toBeDefined()
  })

  it('sends a draft in the server’s units: cents, thousandths, basis points', () => {
    const draft = form.formToDraft(
      filled({
        lines: [form.emptyLine({ description: 'Hours', quantity: '1.5', unitPrice: '80' })],
        discountType: 'percent',
        discountValue: '12.5',
      }),
    )

    expect(draft.lines).toEqual([{ description: 'Hours', unit: '', quantityMilli: 1500, unitPriceMinor: 8000, taxRateBp: null, serviceId: null }])
    expect(draft).toMatchObject({ discountType: 'percent', discountValue: 1250, installments: [], fx: null })
  })

  it('computes the totals with the shared arithmetic', () => {
    const totals = form.totalsOf(filled({ lines: [form.emptyLine({ quantity: '2.5', unitPrice: '19.99' })] }), tax)

    expect(totals.totalMinor).toBe(4998)
  })

  it('places a server problem it did not predict under a field where one fits', () => {
    expect(form.problemField("Enter the recipient's full address")).toBe('recipient.address')
    expect(form.problemField('The client is in Trash. Restore it or choose another client.')).toBe('clientId')
    expect(form.problemField('Something new')).toBeNull()
  })
})

describe('amounts as the owner types them', () => {
  it('reads plain, comma and grouped amounts, and nothing else', () => {
    expect(money.parseMoney('1890')).toBe(189_000)
    expect(money.parseMoney('49,9')).toBe(4990)
    expect(money.parseMoney('1,890.00')).toBe(189_000)
    expect(money.parseMoney('€ 12.5')).toBe(1250)
    expect(money.parseMoney('12.345')).toBeNull()
    expect(money.parseMoney('')).toBeNull()
    expect(money.parseQuantity('1,25')).toBe(1250)
    expect(money.parsePercent('100')).toBe(10_000)
  })

  it('writes money per currency and dates as calendar days', () => {
    expect(money.formatAmount(205_000, 'USD')).toBe('US$2,050.00')
    expect(money.formatAmount(158_500, 'EUR')).toBe('€1,585.00')
    expect(money.formatDate('2026-03-29')).toBe('29 Mar 2026')
  })
})

describe('the other forms’ rules', () => {
  it('a subscription needs a client, a name, a price and a date not in the past', () => {
    const errors = subscriptionForm.subscriptionErrors(
      { ...subscriptionForm.emptySubscriptionForm(TODAY), startDate: '2000-01-01' },
      TODAY,
    )

    expect(Object.keys(errors).sort()).toEqual(['amount', 'clientId', 'description', 'startDate'])
    expect(
      subscriptionForm.formToSubscription(
        { ...subscriptionForm.emptySubscriptionForm(TODAY), clientId: CLIENT, description: 'Care', amount: '49', collection: 'automatic_card', free: 'always' },
        'test',
      ),
    ).toMatchObject({ amountMinor: 4900, allowBank: false, allowStripe: false, freePeriods: null })
  })

  it('seller settings use the server’s own schema', () => {
    const values = { ...SETTINGS, paymentTermsDays: '14' } as never

    expect(settingsErrors(values)).toEqual({})
    expect(settingsErrors({ ...(values as object), bankIban: 'not an iban', paymentTermsDays: '400' } as never)).toMatchObject({
      bankIban: 'Enter a valid IBAN',
      paymentTermsDays: 'Enter a number of days from 0 to 365',
    })
  })
})

describe('the addresses the routes accept', () => {
  it('spells out views that exist in the contract', () => {
    for (const view of search.INVOICE_VIEWS) expect(contract.INVOICE_LIST_STATUSES).toContain(view)
    expect(search.SUBSCRIPTION_VIEWS).toEqual(['all', ...contract.SUBSCRIPTION_STATUSES])
  })

  it('keeps only what it knows', () => {
    const invoices = listRoute.options.validateSearch as (s: Record<string, unknown>) => Record<string, unknown>
    const subscriptions = subscriptionsRoute.options.validateSearch as (s: Record<string, unknown>) => Record<string, unknown>

    expect(invoices({ view: 'overdue', q: '  probe ', page: '3' })).toEqual({ view: 'overdue', q: 'probe', page: 3 })
    expect(invoices({ view: 'nope', page: '-1' })).toEqual({ view: undefined, q: undefined, page: undefined })
    expect(subscriptions({ sub: ID, view: 'paused' })).toMatchObject({ sub: ID, view: 'paused' })
    expect(subscriptions({ sub: 'not-an-id' }).sub).toBeUndefined()
  })
})

/* ================================================================ screens */

describe('the invoice list', () => {
  it('shows what is owed per currency, the late count and the tab counts', async () => {
    api.listInvoices.mockResolvedValue(page([listItem()]))
    wrap(<InvoicesPage search={{}} />)

    expect(await screen.findByText('€1,585.00')).toBeTruthy()
    expect(screen.getByText('US$2,050.00')).toBeTruthy()
    expect(screen.getByText(/kept apart from euros/u)).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: /Overdue\s*1/u })).toBeTruthy()
    expect(await screen.findByText('TEST-2026-0001')).toBeTruthy()
    expect(api.listInvoices).toHaveBeenCalledWith(expect.objectContaining({ mode: 'test', status: 'all', page: 1, pageSize: 25 }))
  })

  it('pages on the server and moves with the Pager', async () => {
    api.listInvoices.mockResolvedValue(page([listItem()], { total: 60, pageCount: 3, hasMore: true }))
    wrap(<InvoicesPage search={{}} />)

    fireEvent.click(await screen.findByRole('button', { name: /Next/u }))
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ search: expect.objectContaining({ page: 2 }) }))
  })

  it('asks the server for the tab and page in the address', async () => {
    wrap(<InvoicesPage search={{ view: 'overdue', page: 2 }} />)

    await waitFor(() => expect(api.listInvoices).toHaveBeenCalledWith(expect.objectContaining({ status: 'overdue', page: 2 })))
  })

  it('shows loading, then an empty list that invites a first draft', async () => {
    let resolve!: (value: unknown) => void

    api.listInvoices.mockReturnValue(new Promise((done) => (resolve = done)))
    wrap(<InvoicesPage search={{}} />)

    expect(await screen.findByLabelText('Loading')).toBeTruthy()
    await act(async () => resolve(page([])))
    expect(await screen.findByText('No invoices yet')).toBeTruthy()
  })

  it('says so when the server refuses or fails, and offers to try again', async () => {
    api.listInvoices.mockRejectedValue(new ApiRequestError({ message: 'Sign in again', code: 'UNAUTHORIZED', status: 401 }))
    wrap(<InvoicesPage search={{}} />)

    expect(await screen.findByText('Invoices could not be loaded')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('always says it is test mode while real invoicing is off', async () => {
    wrap(<InvoicesPage search={{}} />)

    expect((await screen.findByRole('note')).textContent).toContain('Test mode.')
  })
})

describe('one invoice', () => {
  it('says plainly when it does not exist', async () => {
    api.readInvoice.mockRejectedValue(new ApiRequestError({ message: 'That invoice does not exist', code: 'NOT_FOUND', status: 404 }))
    wrap(<InvoicePage invoiceId={ID} />)

    expect(await screen.findByText('That invoice does not exist')).toBeTruthy()
  })

  it('opens an issued invoice as a record with total, paid and still open', async () => {
    api.readInvoice.mockResolvedValue(invoice())
    wrap(<InvoicePage invoiceId={ID} />)

    expect(await screen.findByText('STILL OPEN')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Record payment/u })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Cancel or correct/u })).toBeTruthy()
  })
})

describe('the invoice editor', () => {
  it('is quiet until the first attempt, then names and focuses the first problem', async () => {
    wrap(<InvoiceEditor invoice={null} settings={SETTINGS} mode="test" />)

    expect(screen.queryByText('Choose who this invoice is for')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByText('Choose who this invoice is for')).toBeTruthy()
    const picker = screen.getByRole('combobox')

    expect(picker.getAttribute('aria-invalid')).toBe('true')
    expect(picker.getAttribute('aria-describedby')).toBe('inv-clientId-error')
    expect(document.activeElement).toBe(picker)
    expect(api.createInvoice).not.toHaveBeenCalled()
  })

  it('checks the whole invoice for “Preview and issue”, then follows each change', async () => {
    const draft = invoice({ status: 'draft', number: null, paymentState: 'not_applicable', lines: [], recipient: { ...invoice().recipient, address: '' } })

    wrap(<InvoiceEditor invoice={{ ...draft, lines: [] }} settings={SETTINGS} mode="test" />)

    fireEvent.change(screen.getByLabelText('Description, line 1'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and issue' }))

    expect(await screen.findByText('Enter the full billing address')).toBeTruthy()
    expect(screen.getByText('Describe this line or remove it')).toBeTruthy()
    expect(document.activeElement?.id).toBe('inv-recipient-address')

    fireEvent.change(screen.getByLabelText('Billing address on this invoice'), { target: { value: 'Beispielweg 12' } })
    await waitFor(() => expect(screen.queryByText('Enter the full billing address')).toBeNull())
    expect(screen.getByText('Describe this line or remove it')).toBeTruthy()
    expect(api.patchInvoice).not.toHaveBeenCalled()
  })

  it('saves an existing draft with the revision it was loaded at, once', async () => {
    const draft = invoice({ status: 'draft', number: null, paymentState: 'not_applicable', revision: 7 })

    api.patchInvoice.mockImplementation(async (_id: string, body: { revision: number }) => ({ ...draft, revision: body.revision + 1 }))
    wrap(<InvoiceEditor invoice={draft} settings={SETTINGS} mode="test" />)

    const save = screen.getByRole('button', { name: 'Save draft' })

    fireEvent.click(save)
    fireEvent.click(save)

    await waitFor(() => expect(api.patchInvoice).toHaveBeenCalledTimes(1))
    expect(api.patchInvoice.mock.calls[0]![1]).toMatchObject({ revision: 7, lines: [expect.objectContaining({ unitPriceMinor: 189_000 })] })
  })

  it('shows the Arabic copy as unavailable, with the reason', () => {
    wrap(<InvoiceEditor invoice={null} settings={SETTINGS} mode="test" />)

    const arabic = screen.getByRole('checkbox', { name: /Arabic copy/u }) as HTMLInputElement

    expect(arabic.disabled).toBe(true)
    expect(screen.getByText(/needs a working Arabic font/u)).toBeTruthy()
  })
})

describe('recording a payment', () => {
  it('refuses more than is open — after the first attempt — and focuses the amount', async () => {
    wrap(<PaymentDialog invoice={invoice()} onClose={() => {}} />)

    const amount = screen.getByLabelText('Amount (EUR)')

    fireEvent.change(amount, { target: { value: '5000' } })
    expect(screen.queryByText(/more than the/u)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    expect(await screen.findByText('That is more than the €1,890.00 still open')).toBeTruthy()
    expect(document.activeElement).toBe(amount)
    fireEvent.change(amount, { target: { value: '500' } })
    await waitFor(() => expect(screen.queryByText(/more than the/u)).toBeNull())
    expect(api.recordPayment).not.toHaveBeenCalled()
  })

  it('records a part payment once, with one idempotency key, however often it is pressed', async () => {
    let resolve!: (value: unknown) => void
    const onClose = vi.fn()

    api.recordPayment.mockReturnValue(new Promise((done) => (resolve = done)))
    wrap(<PaymentDialog invoice={invoice()} onClose={onClose} />)

    fireEvent.change(screen.getByLabelText('Amount (EUR)'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Recording/u }).hasAttribute('disabled')).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: /Recording/u }))

    await act(async () =>
      resolve({
        invoice: invoice(),
        payment: { id: 'p', amountMinor: 50_000, currency: 'EUR' },
        duplicate: false,
      }),
    )

    expect(api.recordPayment).toHaveBeenCalledTimes(1)
    expect(api.recordPayment.mock.calls[0]![1]).toMatchObject({ amountMinor: 50_000, method: 'bank', paidOn: TODAY })
    expect(api.recordPayment.mock.calls[0]![1].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('keeps the dialog open with the server’s reason when it refuses', async () => {
    api.recordPayment.mockRejectedValue(new ApiRequestError({ message: 'That is more than is still owed', code: 'PAYMENT_TOO_LARGE', status: 422 }))
    wrap(<PaymentDialog invoice={invoice()} onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    expect(await screen.findByText('That is more than is still owed')).toBeTruthy()
  })
})
