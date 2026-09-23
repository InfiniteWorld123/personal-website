import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  CancelSchema,
  CreateInvoiceSchema,
  CreateSubscriptionSchema,
  FreePeriodSchema,
  FxProposalSchema,
  InvoiceListQuerySchema,
  InvoicePatchSchema,
  IssueSchema,
  LanguageQuerySchema,
  PageOnlyQuerySchema,
  PaymentInputSchema,
  PaymentListQuerySchema,
  PriceChangeSchema,
  RefundInputSchema,
  SendSchema,
  SettingsPutSchema,
  SubscriptionDateSchema,
  SubscriptionDiscountSchema,
  SubscriptionListQuerySchema,
  SubscriptionPatchSchema,
  VoidPaymentSchema,
} from '../../contracts/invoice.contract'
import { readJsonBody } from '../../http/body'
import { notFound } from '../../http/error'
import { HttpStatus } from '../../http/status'
import { parseInput } from '../../http/validate'
import { contentDisposition } from '../../media/naming'
import { ownerGuard } from '../../security/owner-guard'
import { ownerJson } from '../media/media.http'
import { cancelInvoice, correctInvoice } from './invoice.cancel'
import { buildYearExport } from './invoice.export'
import { documentLanguage, ensureDocument, ensureReceipt, readAssetBytes } from './invoice.files'
import { listRates, proposeConversion } from './invoice.fx'
import { listPayments, recordManualPayment, recordRefund, voidPayment } from './invoice.payments'
import * as repo from './invoice.repo'
import { ensurePaymentLink, sendInvoice } from './invoice.send'
import {
  createInvoice,
  deleteDraft,
  getInvoice,
  getSettings,
  issueInvoice,
  listInvoices,
  patchInvoice,
  previewInvoice,
  putSettings,
} from './invoice.service'
import { runBilling } from './subscription.billing'
import {
  addDiscount,
  addFreePeriod,
  changePrice,
  createSubscription,
  endDiscount,
  endSubscription,
  getSubscription,
  listNotices,
  listPeriods,
  listSubscriptions,
  patchSubscription,
  pauseSubscription,
  resumeSubscription,
  startCardSetup,
} from './subscription.service'

/**
 * The owner's Invoices, over HTTP. See `docs/v2/invoices.md`.
 *
 * Thin: parse, delegate, respond. Everything sits behind `ownerGuard`, and
 * every reply is `no-store` — invoices name clients, amounts and bank
 * details. PDFs and the yearly archive are downloads (`attachment`), never
 * rendered inline in this origin.
 */

const Id = (what: string) => v.pipe(v.string(), v.uuid(`That is not a valid ${what} id`))
const InvoiceId = Id('invoice')
const SubscriptionId = Id('subscription')
const Year = v.pipe(
  v.string(),
  v.transform(Number),
  v.number(),
  v.integer('Choose a year'),
  v.minValue(2000, 'Choose a year'),
  v.maxValue(2999, 'Choose a year'),
)
const NoticeQuery = v.object({
  ...PageOnlyQuerySchema.entries,
  status: v.optional(v.picklist(['pending', 'prepared', 'cancelled', 'all']), 'pending'),
})

const download = (bytes: Uint8Array, fileName: string, contentType: string): Response =>
  new Response(bytes as unknown as BodyInit, {
    status: HttpStatus.OK,
    headers: {
      'content-type': contentType,
      'content-length': String(bytes.byteLength),
      'content-disposition': contentDisposition(fileName, 'attachment'),
      'cache-control': 'no-store, no-cache, must-revalidate',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'referrer-policy': 'no-referrer',
    },
  })

const pdf = (bytes: Uint8Array, fileName: string) => download(bytes, fileName, 'application/pdf')

export const ownerInvoiceRoutes = new Elysia({ prefix: '/invoices' })
  .use(ownerGuard)

  /* ------------------------------------------------------------ settings */

  .get('/settings', async () => ownerJson({ data: await getSettings(), message: 'Invoice settings loaded' }))

  .put('/settings', async ({ request }) =>
    ownerJson({
      data: await putSettings(parseInput(SettingsPutSchema, await readJsonBody(request))),
      message: 'Invoice settings saved',
    }),
  )

  /* -------------------------------------------------------- conversion */

  .post('/fx/proposal', async ({ request }) =>
    ownerJson({
      data: await proposeConversion(parseInput(FxProposalSchema, await readJsonBody(request))),
      message: 'Conversion proposed',
    }),
  )

  .get('/fx/rates', async ({ query }) =>
    ownerJson({ data: await listRates(parseInput(PageOnlyQuerySchema, query)), message: 'Rates loaded' }),
  )

  /* ------------------------------------------------ cross-invoice lists */

  .get('/payments', async ({ query }) =>
    ownerJson({ data: await listPayments(parseInput(PaymentListQuerySchema, query)), message: 'Payments loaded' }),
  )

  .get('/notices', async ({ query }) =>
    ownerJson({ data: await listNotices(parseInput(NoticeQuery, query)), message: 'Notices loaded' }),
  )

  /** The billing job, run by hand. The same code the scheduled script runs. */
  .post('/billing/run', async () => ownerJson({ data: await runBilling(), message: 'Billing run finished' }))

  /** The year's live documents and records, for a tax adviser. */
  .get('/exports/:year', async ({ params }) => {
    const archive = await buildYearExport(parseInput(Year, params.year))

    return download(archive.bytes, archive.fileName, 'application/zip')
  })

  /* ------------------------------------------------------ subscriptions */

  .get('/subscriptions', async ({ query }) =>
    ownerJson({
      data: await listSubscriptions(parseInput(SubscriptionListQuerySchema, query)),
      message: 'Subscriptions loaded',
    }),
  )

  .post('/subscriptions', async ({ request }) =>
    ownerJson({
      data: await createSubscription(parseInput(CreateSubscriptionSchema, await readJsonBody(request))),
      message: 'Subscription created',
      status: HttpStatus.CREATED,
    }),
  )

  .get('/subscriptions/:id', async ({ params }) =>
    ownerJson({ data: await getSubscription(parseInput(SubscriptionId, params.id)), message: 'Subscription loaded' }),
  )

  .patch('/subscriptions/:id', async ({ params, request }) =>
    ownerJson({
      data: await patchSubscription(
        parseInput(SubscriptionId, params.id),
        parseInput(SubscriptionPatchSchema, await readJsonBody(request)),
      ),
      message: 'Subscription saved',
    }),
  )

  .post('/subscriptions/:id/pause', async ({ params, request }) =>
    ownerJson({
      data: await pauseSubscription(
        parseInput(SubscriptionId, params.id),
        parseInput(SubscriptionDateSchema, await readJsonBody(request)).date,
      ),
      message: 'Subscription paused',
    }),
  )

  .post('/subscriptions/:id/resume', async ({ params, request }) =>
    ownerJson({
      data: await resumeSubscription(
        parseInput(SubscriptionId, params.id),
        parseInput(SubscriptionDateSchema, await readJsonBody(request)).date,
      ),
      message: 'Subscription resumed',
    }),
  )

  .post('/subscriptions/:id/end', async ({ params, request }) =>
    ownerJson({
      data: await endSubscription(
        parseInput(SubscriptionId, params.id),
        parseInput(SubscriptionDateSchema, await readJsonBody(request)).date,
      ),
      message: 'Subscription ended',
    }),
  )

  .post('/subscriptions/:id/price', async ({ params, request }) =>
    ownerJson({
      data: await changePrice(
        parseInput(SubscriptionId, params.id),
        parseInput(PriceChangeSchema, await readJsonBody(request)),
      ),
      message: 'Price change scheduled',
    }),
  )

  .post('/subscriptions/:id/discounts', async ({ params, request }) =>
    ownerJson({
      data: await addDiscount(
        parseInput(SubscriptionId, params.id),
        parseInput(SubscriptionDiscountSchema, await readJsonBody(request)),
      ),
      message: 'Discount added',
    }),
  )

  .post('/subscriptions/:id/discounts/:discountId/end', async ({ params }) =>
    ownerJson({
      data: await endDiscount(parseInput(SubscriptionId, params.id), parseInput(Id('discount'), params.discountId)),
      message: 'Discount ended',
    }),
  )

  .post('/subscriptions/:id/free-periods', async ({ params, request }) =>
    ownerJson({
      data: await addFreePeriod(
        parseInput(SubscriptionId, params.id),
        parseInput(FreePeriodSchema, await readJsonBody(request)),
      ),
      message: 'Free period added',
    }),
  )

  .post('/subscriptions/:id/card-setup', async ({ params }) =>
    ownerJson({ data: await startCardSetup(parseInput(SubscriptionId, params.id)), message: 'Card setup link ready' }),
  )

  .get('/subscriptions/:id/periods', async ({ params, query }) =>
    ownerJson({
      data: await listPeriods({
        subscriptionId: parseInput(SubscriptionId, params.id),
        ...parseInput(PageOnlyQuerySchema, query),
      }),
      message: 'Periods loaded',
    }),
  )

  /* ----------------------------------------------------------- invoices */

  .get('/', async ({ query }) =>
    ownerJson({ data: await listInvoices(parseInput(InvoiceListQuerySchema, query)), message: 'Invoices loaded' }),
  )

  .post('/', async ({ request }) =>
    ownerJson({
      data: await createInvoice(parseInput(CreateInvoiceSchema, await readJsonBody(request))),
      message: 'Draft created',
      status: HttpStatus.CREATED,
    }),
  )

  .get('/:id', async ({ params }) =>
    ownerJson({ data: await getInvoice(parseInput(InvoiceId, params.id)), message: 'Invoice loaded' }),
  )

  .patch('/:id', async ({ params, request }) => {
    const { revision, ...patch } = parseInput(InvoicePatchSchema, await readJsonBody(request))

    return ownerJson({
      data: await patchInvoice({ id: parseInput(InvoiceId, params.id), revision, patch }),
      message: 'Draft saved',
    })
  })

  .delete('/:id', async ({ params }) =>
    ownerJson({ data: await deleteDraft(parseInput(InvoiceId, params.id)), message: 'Draft deleted' }),
  )

  .get('/:id/preview', async ({ params, query }) => {
    const { language } = parseInput(LanguageQuerySchema, query)
    const preview = await previewInvoice(parseInput(InvoiceId, params.id), language)

    return pdf(preview.bytes, preview.fileName)
  })

  .post('/:id/issue', async ({ params, request }) => {
    const { revision } = parseInput(IssueSchema, await readJsonBody(request))

    return ownerJson({
      data: await issueInvoice({ id: parseInput(InvoiceId, params.id), revision }),
      message: 'Invoice issued',
    })
  })

  .get('/:id/pdf', async ({ params, query }) => {
    const id = parseInput(InvoiceId, params.id)
    const { language: requested } = parseInput(LanguageQuerySchema, query)
    const row = await repo.findInvoice(id)

    if (!row) throw notFound('That invoice does not exist')

    const language = documentLanguage(requested, row.language)
    const { assetId } = await ensureDocument({ invoiceId: id, language })
    const prefix = row.kind === 'cancellation' ? 'Storno' : language === 'de' ? 'Rechnung' : 'Invoice'

    return pdf(await readAssetBytes(assetId), `${prefix}-${row.number}${language === row.language ? '' : `-${language.toUpperCase()}`}.pdf`)
  })

  .post('/:id/send', async ({ params, request }) => {
    const { language } = parseInput(SendSchema, await readJsonBody(request))

    return ownerJson({
      data: await sendInvoice({ id: parseInput(InvoiceId, params.id), language }),
      message: 'Email draft ready in the Inbox',
    })
  })

  .post('/:id/payment-link', async ({ params }) =>
    ownerJson({
      data: await ensurePaymentLink(parseInput(InvoiceId, params.id)),
      message: 'Payment link ready',
    }),
  )

  .post('/:id/payments', async ({ params, request }) => {
    const result = await recordManualPayment({
      invoiceId: parseInput(InvoiceId, params.id),
      payment: parseInput(PaymentInputSchema, await readJsonBody(request)),
    })

    return ownerJson({
      data: result,
      message: result.duplicate ? 'Already recorded' : 'Payment recorded',
      status: result.duplicate ? HttpStatus.OK : HttpStatus.CREATED,
    })
  })

  .post('/:id/payments/:paymentId/void', async ({ params, request }) =>
    ownerJson({
      data: await voidPayment({
        invoiceId: parseInput(InvoiceId, params.id),
        paymentId: parseInput(Id('payment'), params.paymentId),
        reason: parseInput(VoidPaymentSchema, await readJsonBody(request)).reason,
      }),
      message: 'Payment voided',
    }),
  )

  .get('/:id/payments/:paymentId/receipt', async ({ params, query }) => {
    const invoiceId = parseInput(InvoiceId, params.id)
    const paymentId = parseInput(Id('payment'), params.paymentId)
    const row = await repo.findInvoice(invoiceId)

    if (!row) throw notFound('That invoice does not exist')

    const language = documentLanguage(parseInput(LanguageQuerySchema, query).language, row.language)
    const { assetId } = await ensureReceipt({ invoiceId, paymentId, language })

    return pdf(await readAssetBytes(assetId), `${language === 'de' ? 'Quittung' : 'Receipt'}-${row.number}.pdf`)
  })

  .post('/:id/refunds', async ({ params, request }) => {
    const result = await recordRefund({
      invoiceId: parseInput(InvoiceId, params.id),
      refund: parseInput(RefundInputSchema, await readJsonBody(request)),
    })

    return ownerJson({
      data: result,
      message: result.duplicate ? 'Already recorded' : 'Refund recorded',
      status: result.duplicate ? HttpStatus.OK : HttpStatus.CREATED,
    })
  })

  .post('/:id/cancel', async ({ params, request }) =>
    ownerJson({
      data: await cancelInvoice({
        id: parseInput(InvoiceId, params.id),
        reason: parseInput(CancelSchema, await readJsonBody(request)).reason,
      }),
      message: 'Invoice cancelled',
    }),
  )

  .post('/:id/correct', async ({ params, request }) =>
    ownerJson({
      data: await correctInvoice({
        id: parseInput(InvoiceId, params.id),
        reason: parseInput(CancelSchema, await readJsonBody(request)).reason,
      }),
      message: 'Invoice cancelled; correction draft ready',
    }),
  )

const ID = '11111111-1111-4111-8111-111111111111'

/** Every owner route, for the tests that walk the fence. */
export const ownerInvoicePaths = [
  { method: 'GET', path: '/api/v2/owner/invoices' },
  { method: 'POST', path: '/api/v2/owner/invoices' },
  { method: 'GET', path: '/api/v2/owner/invoices/settings' },
  { method: 'PUT', path: '/api/v2/owner/invoices/settings' },
  { method: 'POST', path: '/api/v2/owner/invoices/fx/proposal' },
  { method: 'GET', path: '/api/v2/owner/invoices/fx/rates' },
  { method: 'GET', path: '/api/v2/owner/invoices/payments' },
  { method: 'GET', path: '/api/v2/owner/invoices/notices' },
  { method: 'POST', path: '/api/v2/owner/invoices/billing/run' },
  { method: 'GET', path: '/api/v2/owner/invoices/exports/2026' },
  { method: 'GET', path: '/api/v2/owner/invoices/subscriptions' },
  { method: 'POST', path: '/api/v2/owner/invoices/subscriptions' },
  { method: 'GET', path: `/api/v2/owner/invoices/subscriptions/${ID}` },
  { method: 'PATCH', path: `/api/v2/owner/invoices/subscriptions/${ID}` },
  { method: 'POST', path: `/api/v2/owner/invoices/subscriptions/${ID}/pause` },
  { method: 'POST', path: `/api/v2/owner/invoices/subscriptions/${ID}/resume` },
  { method: 'POST', path: `/api/v2/owner/invoices/subscriptions/${ID}/end` },
  { method: 'POST', path: `/api/v2/owner/invoices/subscriptions/${ID}/price` },
  { method: 'POST', path: `/api/v2/owner/invoices/subscriptions/${ID}/discounts` },
  { method: 'POST', path: `/api/v2/owner/invoices/subscriptions/${ID}/discounts/${ID}/end` },
  { method: 'POST', path: `/api/v2/owner/invoices/subscriptions/${ID}/free-periods` },
  { method: 'POST', path: `/api/v2/owner/invoices/subscriptions/${ID}/card-setup` },
  { method: 'GET', path: `/api/v2/owner/invoices/subscriptions/${ID}/periods` },
  { method: 'GET', path: `/api/v2/owner/invoices/${ID}` },
  { method: 'PATCH', path: `/api/v2/owner/invoices/${ID}` },
  { method: 'DELETE', path: `/api/v2/owner/invoices/${ID}` },
  { method: 'GET', path: `/api/v2/owner/invoices/${ID}/preview` },
  { method: 'POST', path: `/api/v2/owner/invoices/${ID}/issue` },
  { method: 'GET', path: `/api/v2/owner/invoices/${ID}/pdf` },
  { method: 'POST', path: `/api/v2/owner/invoices/${ID}/send` },
  { method: 'POST', path: `/api/v2/owner/invoices/${ID}/payment-link` },
  { method: 'POST', path: `/api/v2/owner/invoices/${ID}/payments` },
  { method: 'POST', path: `/api/v2/owner/invoices/${ID}/payments/${ID}/void` },
  { method: 'GET', path: `/api/v2/owner/invoices/${ID}/payments/${ID}/receipt` },
  { method: 'POST', path: `/api/v2/owner/invoices/${ID}/refunds` },
  { method: 'POST', path: `/api/v2/owner/invoices/${ID}/cancel` },
  { method: 'POST', path: `/api/v2/owner/invoices/${ID}/correct` },
] as const
