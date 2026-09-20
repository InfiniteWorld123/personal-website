import { Elysia } from 'elysia'
import { adminGuard } from '#/backend/modules/admin/admin.guard'
import { HttpStatusCode } from '#/backend/shared/http'
import { responseOk } from '#/backend/shared/response'
import { parseInput } from '#/backend/shared/validate'
import {
  ClientWriteSchema,
  CorrectionSchema,
  IdSchema,
  InvoiceQuerySchema,
  InvoiceWriteSchema,
  LETTER_KINDS,
  PaymentSchema,
  type LetterKind,
} from '#/shared/validation/invoice.validation'
import {
  clientForLead,
  createClient,
  deleteClient,
  listClients,
  updateClient,
} from './client.service'
import {
  addPayment,
  correctInvoice,
  createInvoice,
  deleteInvoice,
  deletePayment,
  getInvoice,
  getSummary,
  issueInvoice,
  listInvoices,
  listSentLetters,
  readInvoicePdf,
  updateInvoice,
} from './invoice.service'
import { attachInvoiceToPerson, listInvoicesForPerson, prepareLetter } from './letter.service'
import { isSellerReady, resolveSeller, sellerGaps } from './seller'

const id = (value: unknown) => parseInput(IdSchema, value)

/**
 * Invoicing, behind the admin guard.
 *
 * Static paths — `clients`, `summary`, `seller` — are declared before
 * `/:invoiceId`, so none of them is ever read as somebody's id. The same trap
 * `lead.route.ts` documents.
 *
 * Every write that changes money answers with the **whole invoice**, not with
 * the one field it touched. Recording a payment changes the settlement, the
 * days late, four of the six figures on top and whether the reminder button
 * should exist at all; handing back a fragment would leave the screen to guess
 * the rest, and a guessed figure on a money screen is how the last panel lost
 * his trust.
 */
export const adminInvoiceRoutes = new Elysia({ prefix: '/invoices' })
  .use(adminGuard)

  .get('/', async ({ query }) =>
    responseOk({
      data: await listInvoices(parseInput(InvoiceQuerySchema, query)),
      message: 'Invoices listed',
    }),
  )

  .get('/summary', async () => responseOk({ data: await getSummary(), message: 'Counted' }))

  /**
   * The sent register — every letter that carried a document out of here.
   *
   * Declared with the static paths for the reason at the top of this file:
   * `letters` must never be read as somebody's id.
   */
  .get('/letters', async () =>
    responseOk({ data: await listSentLetters(), message: 'Letters listed' }),
  )

  /**
   * One person's invoices, for the composer's attach panel.
   *
   * Static-prefixed like everything above, so `for-person` is never read as
   * somebody's id. Scoped to the person on the server rather than filtered on
   * the screen: a list of everyone's invoices reaching the browser is one
   * mis-click from a client reading another client's figures.
   */
  .get('/for-person/:personId', async ({ params }) =>
    responseOk({
      data: await listInvoicesForPerson(id(params.personId)),
      message: 'Invoices listed',
    }),
  )

  /**
   * Whether his own details are real yet.
   *
   * The screen asks before it offers to issue anything, so the first thing he
   * sees is the list of placeholders still in `seller.ts` — rather than a
   * confident **Issue** button that refuses the moment he presses it.
   */
  .get('/seller', async () =>
    responseOk({
      /*
       * `ready` is about whether anything can be issued at all. `isTest` is a
       * different question with a different answer — on his own machine both
       * are true, and the screen has to say so, or he would spend an evening
       * issuing invoices against an account that does not exist and never be
       * told.
       */
      data: {
        ready: isSellerReady(),
        gaps: sellerGaps(),
        isTest: resolveSeller().isTest === true,
        // What decides whether a rate on a line is allowed at all. The editor
        // cannot warn about §14c without it, and finding out at Issue — after
        // the whole document is written — is the small cruelty this admin
        // is supposed to avoid.
        smallBusiness: resolveSeller().smallBusiness,
      },
      message: 'Checked',
    }),
  )

  /* ---------------------------------------------------------------- clients */

  .get('/clients', async ({ query }) =>
    responseOk({
      data: await listClients(typeof query.search === 'string' ? query.search : ''),
      message: 'Clients listed',
    }),
  )

  .post('/clients', async ({ body, status }) =>
    status(
      HttpStatusCode.CREATED,
      responseOk({
        data: await createClient(parseInput(ClientWriteSchema, body)),
        message: 'Client added',
      }),
    ),
  )

  /** The bridge from a conversation to the books. Never makes a duplicate. */
  .post('/clients/from-lead/:leadId', async ({ params, status }) =>
    status(
      HttpStatusCode.CREATED,
      responseOk({ data: await clientForLead(id(params.leadId)), message: 'Client ready' }),
    ),
  )

  .put('/clients/:clientId', async ({ params, body }) =>
    responseOk({
      data: await updateClient(id(params.clientId), parseInput(ClientWriteSchema, body)),
      message: 'Saved',
    }),
  )

  .delete('/clients/:clientId', async ({ params }) => {
    await deleteClient(id(params.clientId))

    return responseOk({ data: { deleted: true }, message: 'Client removed' })
  })

  /* --------------------------------------------------------------- drafting */

  .post('/', async ({ body, status }) =>
    status(
      HttpStatusCode.CREATED,
      responseOk({
        data: await createInvoice(parseInput(InvoiceWriteSchema, body)),
        message: 'Draft started',
      }),
    ),
  )

  .get('/:invoiceId', async ({ params }) =>
    responseOk({ data: await getInvoice(id(params.invoiceId)), message: 'Invoice loaded' }),
  )

  .put('/:invoiceId', async ({ params, body }) =>
    responseOk({
      data: await updateInvoice(id(params.invoiceId), parseInput(InvoiceWriteSchema, body)),
      message: 'Saved',
    }),
  )

  .delete('/:invoiceId', async ({ params }) => {
    await deleteInvoice(id(params.invoiceId))

    return responseOk({ data: { deleted: true }, message: 'Draft removed' })
  })

  /* ---------------------------------------------------------------- issuing */

  /**
   * The one irreversible act in the section.
   *
   * After this the document has a number in a gapless series, a frozen file
   * and a lock. The screen asks first, and says so in those words.
   */
  .post('/:invoiceId/issue', async ({ params }) =>
    responseOk({ data: await issueInvoice(id(params.invoiceId)), message: 'Issued' }),
  )

  .post('/:invoiceId/correct', async ({ params, body, status }) =>
    status(
      HttpStatusCode.CREATED,
      responseOk({
        data: await correctInvoice(id(params.invoiceId), parseInput(CorrectionSchema, body)),
        message: 'Correction issued',
      }),
    ),
  )

  /* ------------------------------------------------------------- the letter */

  .get('/:invoiceId/pdf', async ({ params }) => readInvoicePdf(id(params.invoiceId)))

  /**
   * A letter, prepared for the inbox. **Nothing is sent here.**
   *
   * The invoice resolves who it goes to, copies its frozen PDF into that
   * person's files, and writes a subject and a body. The composer opens on it,
   * he reads and edits it, and the inbox sends it — which is what puts the
   * letter in the conversation where he can find it again.
   *
   * A GET that writes, deliberately: it is idempotent, which is what matters
   * when the composer asks for the same letter again after a refresh.
   */
  .get('/:invoiceId/letter', async ({ params, query }) => {
    const asked = typeof query.kind === 'string' ? query.kind.toUpperCase() : 'INVOICE'
    const kind = (LETTER_KINDS as readonly string[]).includes(asked)
      ? (asked as LetterKind)
      : 'INVOICE'

    return responseOk({
      data: await prepareLetter(id(params.invoiceId), kind),
      message: 'Letter ready',
    })
  })

  /**
   * Copies one invoice's PDF into this person's files, and says where it went.
   *
   * What `prepareLetter` does for the file, without the letter — he is already
   * writing one in his own words and does not want it replaced. The service
   * refuses an invoice that is not this person's; the check is on the server
   * because the alternative is a request that can reach any client's document.
   */
  .post('/:invoiceId/attach/:personId', async ({ params }) =>
    responseOk({
      data: await attachInvoiceToPerson(id(params.personId), id(params.invoiceId)),
      message: 'Attached',
    }),
  )

  /* ------------------------------------------------------------- payments */

  .post('/:invoiceId/payments', async ({ params, body, status }) =>
    status(
      HttpStatusCode.CREATED,
      responseOk({
        data: await addPayment(id(params.invoiceId), parseInput(PaymentSchema, body)),
        message: 'Payment recorded',
      }),
    ),
  )

  .delete('/:invoiceId/payments/:paymentId', async ({ params }) =>
    responseOk({
      data: await deletePayment(id(params.invoiceId), id(params.paymentId)),
      message: 'Payment removed',
    }),
  )
