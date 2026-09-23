import { HttpStatus } from './status'

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'STEP_UP_REQUIRED'
  | 'ENROLLMENT_REQUIRED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BODY_TOO_LARGE'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'STORAGE_UNAVAILABLE'
  /*
   * Media (`docs/v2/media.md`): "Use typed responses and stable error codes for
   * unsupported type, oversize file, missing file/folder, storage unavailable,
   * upload failure, forbidden access, and deletion blocked by references." They
   * sit in the same union rather than inside `details` so the Dashboard
   * switches on one field for every failure Backend2 can report.
   */
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'UPLOAD_FAILED'
  | 'DELETE_BLOCKED_BY_REFERENCES'
  | 'FOLDER_NOT_EMPTY'
  | 'FOLDER_CYCLE'
  | 'FOLDER_DEPTH_EXCEEDED'
  | 'NAME_TAKEN'
  /*
   * Blog (`docs/v2/blog.md`). A visitor's comment can be refused for reasons
   * the website has to say in German, English or Arabic, so each one is a code
   * of its own rather than a sentence to parse; `details.reason` narrows the
   * two broad ones further.
   */
  | 'COMMENTS_CLOSED'
  | 'COMMENT_REJECTED'
  | 'DUPLICATE_COMMENT'
  | 'TAG_IN_USE'
  | 'ARTICLE_SCHEDULED'
  /*
   * Content (`docs/v2/content.md`): a Legal field written without the editor's
   * deliberate unlock.
   */
  | 'LEGAL_LOCKED'
  /*
   * Inbox (`docs/v2/inbox.md`): "safe, stable error codes for ... provider
   * failure, ... stale draft update, and duplicate/replayed ingress."
   */
  | 'STALE_DRAFT'
  | 'SEND_FAILED'
  | 'CONFIRMATION_REQUIRED'
  | 'INVALID_SIGNATURE'
  | 'INGRESS_DISABLED'
  /*
   * Booking (`docs/v2/booking.md`): "safe stable errors for ... unavailable/
   * overlapping slot, too-early/far request, cancellation deadline, invalid
   * private credential, non-video request, provider unavailable".
   */
  | 'SLOT_UNAVAILABLE'
  | 'BOOKING_TOO_SOON'
  | 'BOOKING_TOO_FAR'
  | 'CHANGE_DEADLINE_PASSED'
  | 'BOOKING_LINK_INVALID'
  | 'NOT_VIDEO'
  | 'VIDEO_NOT_OPEN'
  | 'VIDEO_CLOSED'
  | 'PROVIDER_UNAVAILABLE'
  | 'TYPE_IN_USE'
  | 'VERIFICATION_FAILED'
  /*
   * Clients (`docs/v2/clients.md`): a likely duplicate, a file in Trash, and
   * a permanent deletion an invoice blocks.
   */
  | 'CLIENT_DUPLICATE'
  | 'CLIENT_IN_TRASH'
  | 'CLIENT_DELETE_BLOCKED'
  /* Niches, shared by Clients and Leads: a niche something still uses. */
  | 'NICHE_IN_USE'
  /*
   * Leads (`docs/v2/leads.md`): a likely duplicate, a Lead in Trash, a second
   * open follow-up, a stage/source/reason still in use, and a locked choice.
   */
  | 'LEAD_DUPLICATE'
  | 'LEAD_IN_TRASH'
  | 'FOLLOW_UP_EXISTS'
  | 'CHOICE_IN_USE'
  | 'CHOICE_LOCKED'
  /*
   * Invoices (`docs/v2/invoices.md`): an issued document that cannot change,
   * a draft that cannot be issued yet, a seller not ready for a real invoice,
   * live issuing switched off, amounts that exceed what is owed or paid, the
   * payment provider or rate source unavailable, and an unsupported language.
   */
  | 'INVOICE_LOCKED'
  | 'INVOICE_NOT_READY'
  | 'SELLER_NOT_READY'
  | 'LIVE_INVOICING_DISABLED'
  | 'PAYMENT_TOO_LARGE'
  | 'REFUND_TOO_LARGE'
  | 'STRIPE_UNAVAILABLE'
  | 'FX_UNAVAILABLE'
  | 'LANGUAGE_NOT_SUPPORTED'
  | 'SUBSCRIPTION_LOCKED'
  /*
   * Public AI Assistant (`docs/v2/ai-assistant.md`): switched off, or the
   * site-wide daily limit reached. `details.reason` says which.
   */
  | 'ASSISTANT_UNAVAILABLE'

/**
 * Every failure Backend2 reports on purpose. Anything that is not one of
 * these reaches the client as a bare `INTERNAL_ERROR`, so a database message
 * can never become part of a response body.
 */
export class ApiError extends Error {
  readonly status: HttpStatus
  readonly code: ApiErrorCode
  readonly details?: unknown

  constructor(options: {
    status: HttpStatus
    code: ApiErrorCode
    message: string
    details?: unknown
  }) {
    super(options.message)
    this.name = 'ApiError'
    this.status = options.status
    this.code = options.code
    this.details = options.details
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError

const make =
  (status: HttpStatus, code: ApiErrorCode, fallback: string) =>
  (message: string = fallback, details?: unknown) =>
    new ApiError({ status, code, message, details })

export const badRequest = make(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'Bad request')

/**
 * Also the answer an owner route gives when the local-only guard refuses.
 * Never 401 or 403: those confirm that a private API is there
 * (`docs/v2/projects-backend.md` §9.3).
 */
export const notFound = make(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Resource not found')

/**
 * No usable owner session. Distinct from `notFound` on purpose: by the time
 * this can be thrown the caller has already passed the deployment fence, so
 * the existence of the owner API is not news to them.
 */
export const unauthorized = make(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Sign in to continue')

/** A valid session that has not proved itself again for this specific action. */
export const stepUpRequired = make(
  HttpStatus.FORBIDDEN,
  'STEP_UP_REQUIRED',
  'Confirm it is you before changing this',
)

/** Signed in only far enough to finish enrollment. Not access. */
export const enrollmentRequired = make(
  HttpStatus.FORBIDDEN,
  'ENROLLMENT_REQUIRED',
  'Finish setting up two-factor authentication first',
)

export const rateLimited = make(
  HttpStatus.TOO_MANY_REQUESTS,
  'RATE_LIMITED',
  'Too many attempts. Try again later',
)
export const conflict = make(HttpStatus.CONFLICT, 'CONFLICT', 'Conflict')
export const bodyTooLarge = make(
  HttpStatus.PAYLOAD_TOO_LARGE,
  'BODY_TOO_LARGE',
  'Request body is too large',
)
export const validationFailed = make(
  HttpStatus.UNPROCESSABLE_ENTITY,
  'VALIDATION_ERROR',
  'Validation failed',
)
export const internalError = make(
  HttpStatus.INTERNAL_SERVER_ERROR,
  'INTERNAL_ERROR',
  'An unexpected error occurred',
)
export const storageUnavailable = make(
  HttpStatus.SERVICE_UNAVAILABLE,
  'STORAGE_UNAVAILABLE',
  'Image storage is not available in this environment',
)

/* ---------------------------------------------------------------- the vault */

export const unsupportedFileType = make(
  HttpStatus.UNPROCESSABLE_ENTITY,
  'UNSUPPORTED_FILE_TYPE',
  'That file type is not accepted',
)
export const fileTooLarge = make(
  HttpStatus.PAYLOAD_TOO_LARGE,
  'FILE_TOO_LARGE',
  'That file is too large',
)
export const uploadFailed = make(
  HttpStatus.BAD_REQUEST,
  'UPLOAD_FAILED',
  'That upload did not finish. Nothing was added to the library.',
)

/**
 * A file that something still uses. The `details` carry the uses themselves,
 * because a refusal the owner cannot act on is not much better than a failure.
 */
export const deleteBlockedByReferences = make(
  HttpStatus.CONFLICT,
  'DELETE_BLOCKED_BY_REFERENCES',
  'That file is still in use',
)
export const folderNotEmpty = make(
  HttpStatus.CONFLICT,
  'FOLDER_NOT_EMPTY',
  'Empty the folder before deleting it',
)
export const folderCycle = make(
  HttpStatus.CONFLICT,
  'FOLDER_CYCLE',
  'A folder cannot be moved inside itself',
)
export const folderDepthExceeded = make(
  HttpStatus.CONFLICT,
  'FOLDER_DEPTH_EXCEEDED',
  'That would nest folders too deeply',
)
export const nameTaken = make(
  HttpStatus.CONFLICT,
  'NAME_TAKEN',
  'Something with that name is already here',
)

/* --------------------------------------------------------------------- blog */

/** The owner switched comments off for this article. */
export const commentsClosed = make(
  HttpStatus.CONFLICT,
  'COMMENTS_CLOSED',
  'Comments are closed for this article.',
)

/** A comment whose shape is refused: markup, too many links, the hidden field filled in. */
export const commentRejected = make(
  HttpStatus.UNPROCESSABLE_ENTITY,
  'COMMENT_REJECTED',
  'Your comment could not be posted.',
)

export const duplicateComment = make(
  HttpStatus.CONFLICT,
  'DUPLICATE_COMMENT',
  'This comment has already been posted.',
)

/** A tag an article still carries. The `details` name the articles. */
export const tagInUse = make(HttpStatus.CONFLICT, 'TAG_IN_USE', 'That tag is still in use')

/**
 * Publishing an article that is waiting for its schedule. `docs/v2/blog.md`:
 * the schedule is cancelled or replaced explicitly, never overtaken silently.
 */
export const articleScheduled = make(
  HttpStatus.CONFLICT,
  'ARTICLE_SCHEDULED',
  'This article is scheduled. Cancel the schedule before publishing it now.',
)

/* ------------------------------------------------------------------ content */

/**
 * Legal text is locked until the owner unlocks it in the editor on purpose.
 * The server refuses a Legal write that does not say it was unlocked, so an
 * accidental focus-and-blur can never change the Impressum.
 */
export const legalLocked = make(
  HttpStatus.CONFLICT,
  'LEGAL_LOCKED',
  'Legal text is locked. Unlock it before changing it.',
)

/* -------------------------------------------------------------------- inbox */

/**
 * An autosave from a tab that has not seen the latest save. Refused rather
 * than merged, so newer text is never silently overwritten; `details` carry
 * the current draft.
 */
export const staleDraft = make(
  HttpStatus.CONFLICT,
  'STALE_DRAFT',
  'This draft changed somewhere else. Reload it before saving again.',
)

/**
 * The provider did not accept the email. Not a server fault: the message is
 * kept, marked failed, and can be retried. A 4xx on purpose — a 5xx would
 * hide the reason and the message id the Dashboard needs to offer Retry.
 */
export const sendFailed = make(
  HttpStatus.CONFLICT,
  'SEND_FAILED',
  'The email could not be sent. It was kept so you can retry.',
)

/** An action that needs the owner's explicit yes first, such as a blank subject. */
export const confirmationRequired = make(
  HttpStatus.UNPROCESSABLE_ENTITY,
  'CONFIRMATION_REQUIRED',
  'Please confirm before continuing.',
)

/** A delivery to the mail ingress whose signature or timestamp does not hold. */
export const invalidSignature = make(
  HttpStatus.UNAUTHORIZED,
  'INVALID_SIGNATURE',
  'That delivery could not be verified.',
)

/** The mail ingress has no secret configured, so it takes nothing. */
export const ingressDisabled = make(
  HttpStatus.SERVICE_UNAVAILABLE,
  'INGRESS_DISABLED',
  'Incoming email is not configured here.',
)

/* ------------------------------------------------------------------ clients */

/**
 * Another Client already has this email or phone. A warning, not a merge: the
 * `details.candidates` let the owner open the match, link it, or continue.
 */
export const clientDuplicate = make(
  HttpStatus.CONFLICT,
  'CLIENT_DUPLICATE',
  'A client with this email or phone is already on file',
)

/** The Client is in Trash; restore it before changing or linking it. */
export const clientInTrash = make(HttpStatus.CONFLICT, 'CLIENT_IN_TRASH', 'That client is in Trash')

/** An invoice still points at this Client. It can stay Inactive instead. */
export const clientDeleteBlocked = make(
  HttpStatus.CONFLICT,
  'CLIENT_DELETE_BLOCKED',
  'This client cannot be deleted permanently',
)

/** A niche a Client or Lead still carries. It can be hidden instead. */
export const nicheInUse = make(HttpStatus.CONFLICT, 'NICHE_IN_USE', 'That niche is still in use')

/* -------------------------------------------------------------------- leads */

/** Another Lead has this email or phone. The `details.candidates` name them. */
export const leadDuplicate = make(
  HttpStatus.CONFLICT,
  'LEAD_DUPLICATE',
  'A lead with this email or phone is already on file',
)

export const leadInTrash = make(HttpStatus.CONFLICT, 'LEAD_IN_TRASH', 'That lead is in Trash')

/** One open follow-up per Lead. */
export const followUpExists = make(
  HttpStatus.CONFLICT,
  'FOLLOW_UP_EXISTS',
  'This lead already has a follow-up',
)

/** A stage, source or reason that Leads still use. It can be hidden instead. */
export const choiceInUse = make(HttpStatus.CONFLICT, 'CHOICE_IN_USE', 'That is still in use')

/** A permanent stage, `Unknown` or `Other`: fixed on purpose. */
export const choiceLocked = make(HttpStatus.CONFLICT, 'CHOICE_LOCKED', 'That one cannot be changed')

/* ------------------------------------------------------------------ booking */

/** Someone else took that time, or it was never free. Choose another. */
export const slotUnavailable = make(
  HttpStatus.CONFLICT,
  'SLOT_UNAVAILABLE',
  'That time is no longer available. Please choose another.',
)

export const bookingTooSoon = make(
  HttpStatus.UNPROCESSABLE_ENTITY,
  'BOOKING_TOO_SOON',
  'That time is too soon to book.',
)

export const bookingTooFar = make(
  HttpStatus.UNPROCESSABLE_ENTITY,
  'BOOKING_TOO_FAR',
  'That time is too far ahead to book.',
)

/** A visitor's change after the deadline. The owner can still change it. */
export const changeDeadlinePassed = make(
  HttpStatus.CONFLICT,
  'CHANGE_DEADLINE_PASSED',
  'This appointment can no longer be changed online. Please reply to your confirmation email.',
)

/**
 * A private link that does not open anything. The same answer for a wrong
 * credential and an unknown reference, so neither can be probed.
 */
export const bookingLinkInvalid = make(
  HttpStatus.NOT_FOUND,
  'BOOKING_LINK_INVALID',
  'This link is not valid.',
)

export const notVideo = make(HttpStatus.CONFLICT, 'NOT_VIDEO', 'This appointment is not a video call.')

export const videoNotOpen = make(
  HttpStatus.CONFLICT,
  'VIDEO_NOT_OPEN',
  'The call has not started yet.',
)

export const videoClosed = make(HttpStatus.CONFLICT, 'VIDEO_CLOSED', 'This call is over.')

export const providerUnavailable = make(
  HttpStatus.SERVICE_UNAVAILABLE,
  'PROVIDER_UNAVAILABLE',
  'The video service is not available right now.',
)

/** A type with upcoming appointments. `details` count them. */
export const typeInUse = make(
  HttpStatus.CONFLICT,
  'TYPE_IN_USE',
  'This appointment type still has upcoming appointments.',
)

/** The public form's human check (Turnstile) did not pass. */
export const verificationFailed = make(
  HttpStatus.UNPROCESSABLE_ENTITY,
  'VERIFICATION_FAILED',
  'The security check did not pass. Please try again.',
)

/* ---------------------------------------------------------------- assistant */

/**
 * The public assistant cannot answer: the owner switched it off
 * (`details.reason: 'disabled'`) or today's site-wide limit is reached
 * (`'daily_limit'`). The widget shows the Contact and Booking links instead.
 * A 4xx on purpose, like `sendFailed`: a 5xx would hide the reason.
 */
export const assistantUnavailable = make(
  HttpStatus.CONFLICT,
  'ASSISTANT_UNAVAILABLE',
  'The assistant is not available right now.',
)

/* ----------------------------------------------------------------- invoices */

/** Issued (or cancelled) documents never change; only a draft is editable. */
export const invoiceLocked = make(
  HttpStatus.CONFLICT,
  'INVOICE_LOCKED',
  'This invoice has been issued and cannot be changed. Cancel or correct it instead.',
)

/** A draft that is not complete enough to issue. `details.issues` list why. */
export const invoiceNotReady = make(
  HttpStatus.UNPROCESSABLE_ENTITY,
  'INVOICE_NOT_READY',
  'This draft cannot be issued yet.',
)

/** Seller details are incomplete for a real invoice. `details.missing` names them. */
export const sellerNotReady = make(
  HttpStatus.UNPROCESSABLE_ENTITY,
  'SELLER_NOT_READY',
  'Complete your seller details in Invoice settings before issuing a real invoice.',
)

/** Live issuing and live charges are off unless INVOICES_LIVE_ENABLED=true. */
export const liveInvoicingDisabled = make(
  HttpStatus.CONFLICT,
  'LIVE_INVOICING_DISABLED',
  'Real invoicing is switched off here. Use test mode.',
)

export const paymentTooLarge = make(
  HttpStatus.UNPROCESSABLE_ENTITY,
  'PAYMENT_TOO_LARGE',
  'That payment is more than the amount still due.',
)

export const refundTooLarge = make(
  HttpStatus.UNPROCESSABLE_ENTITY,
  'REFUND_TOO_LARGE',
  'That refund is more than was paid.',
)

export const stripeUnavailable = make(
  HttpStatus.SERVICE_UNAVAILABLE,
  'STRIPE_UNAVAILABLE',
  'Card payments are not available right now.',
)

/** No exchange rate could be fetched. The owner can type one instead. */
export const fxUnavailable = make(
  HttpStatus.SERVICE_UNAVAILABLE,
  'FX_UNAVAILABLE',
  'No exchange rate is available right now. Enter the rate yourself.',
)

export const languageNotSupported = make(
  HttpStatus.UNPROCESSABLE_ENTITY,
  'LANGUAGE_NOT_SUPPORTED',
  'That language is not available for invoice documents yet.',
)

/** An ended subscription, or a change that would reach back into billed periods. */
export const subscriptionLocked = make(
  HttpStatus.CONFLICT,
  'SUBSCRIPTION_LOCKED',
  'That change is not possible for this subscription.',
)
