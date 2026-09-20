/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE ONE FILE YAMAN EDITS BEFORE THE FIRST REAL INVOICE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Everything below is printed on the paper a client keeps. None of it is a
 * secret — an IBAN and a tax number are on every invoice ever sent — so it
 * lives in the repository where it can be read and reviewed, not in an
 * environment variable where a typo is invisible until a client cannot pay.
 *
 * `§14 UStG` requires the full name and address, and either the `Steuernummer`
 * or the `USt-IdNr`. The bank details are not required by law and are required
 * by reality: an invoice without an account is a request for nothing.
 *
 * **Issuing is blocked while any of these still says `TODO`.** See
 * `assertSellerReady`. An invoice that goes out with a placeholder IBAN is
 * worse than an invoice that was never sent, and the only moment anyone would
 * notice is when the client tries to pay.
 */

export type Seller = {
  name: string
  trade: { de: string; en: string }
  street: string
  postcode: string
  city: string
  country: string

  /** One of these two must be real. Both may be, once he has a VAT id. */
  taxNumber: string
  vatId: string

  bankName: string
  iban: string
  bic: string

  email: string
  phone: string
  website: string

  /**
   * True while he is a `Kleinunternehmer` under `§19 UStG`.
   *
   * It drives two things and nothing else: every line defaults to a tax rate
   * of zero, and the sentence below is printed in place of a VAT row. The day
   * he crosses the threshold this becomes `false`, new lines carry 19, and
   * every invoice already issued keeps the rate it was issued with — because
   * the rate lives on the line, not here.
   */
  smallBusiness: boolean

  /**
   * True only for `TEST_SELLER` below.
   *
   * Nothing about the business; it is a warning that travels with the data.
   * Every PDF drawn from a seller carrying this gets stamped, so a document
   * made with invented bank details cannot be mistaken for one that can be
   * paid — the same reason a draft is stamped.
   */
  isTest?: boolean
}

export const SELLER: Seller = {
  name: 'Yaman Warda',
  trade: { de: 'Webentwicklung', en: 'Web development' },

  street: 'TODO Straße und Hausnummer',
  postcode: 'TODO',
  city: 'Erfurt',
  country: 'DE',

  // From the `Fragebogen zur steuerlichen Erfassung`, once the Finanzamt answers.
  taxNumber: 'TODO Steuernummer',
  // Empty until he asks for one. Note that buying from Stripe, Cloudflare or
  // Neon makes him liable for reverse-charge VAT even as a Kleinunternehmer,
  // which is the usual reason to have one early.
  vatId: '',

  bankName: 'TODO Bank',
  iban: 'TODO IBAN',
  bic: 'TODO BIC',

  email: 'info@yamanwarda.de',
  phone: '',
  website: 'yamanwarda.de',

  smallBusiness: true,
}

/**
 * Invented details, so the whole section can be walked through before the
 * Finanzamt has answered.
 *
 * Yaman asked for this on 20 Sep 2026: he could not see what issuing, sending
 * or the sent register actually do, because nothing could be issued at all.
 *
 * Three things keep it from becoming a liability:
 *
 *   1. **It is never used in production.** `resolveSeller` asks for a
 *      positive `NODE_ENV === 'development'` rather than checking for
 *      `!== 'production'`, and the difference is the whole safety argument:
 *      if the variable is missing, unset or spelled differently in some
 *      future runtime, the negative form quietly hands a live Worker an
 *      invented IBAN. The positive form falls back to his real details, which
 *      still carry `TODO`, which blocks issuing. Wrong in the safe direction.
 *   2. **It stops being used the moment the real details exist.** Even in
 *      development, `resolveSeller` prefers `SELLER` as soon as it has no
 *      gaps — so he never finds himself testing against invented data while
 *      believing it is his own.
 *   3. **Every page it draws says so.** `isTest` puts a stamp across the
 *      document, exactly like a draft, so a test invoice that escapes as a
 *      file still cannot be mistaken for one a client could pay.
 *
 * The IBAN is deliberately not a real-looking one. `DE00` fails the IBAN check
 * digits by construction — no bank will accept it, and no banking app will
 * scan the payment code into a transfer that goes anywhere.
 */
export const TEST_SELLER: Seller = {
  name: 'Yaman Warda',
  trade: { de: 'Webentwicklung', en: 'Web development' },

  street: 'Teststraße 1',
  postcode: '99084',
  city: 'Erfurt',
  country: 'DE',

  taxNumber: '000/000/00000 (Test)',
  vatId: '',

  bankName: 'Testbank — keine echte Bank',
  iban: 'DE00 0000 0000 0000 0000 00',
  bic: 'TESTDEFFXXX',

  email: 'info@yamanwarda.de',
  phone: '',
  website: 'yamanwarda.de',

  smallBusiness: true,
  isTest: true,
}

/**
 * Which details this run prints with.
 *
 * Real ones whenever they are real. Invented ones only on his own machine, and
 * only while the real ones are still placeholders.
 */
export const resolveSeller = (): Seller => {
  if (process.env.NODE_ENV !== 'development') return SELLER

  return sellerGaps(SELLER).length > 0 ? TEST_SELLER : SELLER
}

/**
 * The sentence that replaces the VAT row.
 *
 * Printed verbatim, in the language of the paper. It is a legal statement and
 * not a label, so it is kept here beside the flag that decides whether it is
 * printed at all — rather than in the translation table, where somebody
 * rewording a heading could quietly reword this.
 */
export const SMALL_BUSINESS_NOTE: Record<'de' | 'en', string> = {
  de: 'Gemäß § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.',
  en: 'VAT is not charged under the small-business rule (§ 19 German VAT Act).',
}

/** Anything still carrying the placeholder. */
export const sellerGaps = (seller: Seller = resolveSeller()): string[] => {
  const gaps: string[] = []
  const missing = (value: string) => value.trim() === '' || value.includes('TODO')

  if (missing(seller.street)) gaps.push('street')
  if (missing(seller.postcode)) gaps.push('postcode')
  if (missing(seller.city)) gaps.push('city')
  if (missing(seller.taxNumber) && missing(seller.vatId)) gaps.push('taxNumber or vatId')
  if (missing(seller.bankName)) gaps.push('bankName')
  if (missing(seller.iban)) gaps.push('iban')
  if (missing(seller.bic)) gaps.push('bic')

  return gaps
}

export const isSellerReady = (seller: Seller = resolveSeller()): boolean =>
  sellerGaps(seller).length === 0

/** The IBAN as a payment code wants it: no spaces, upper case. */
export const compactIban = (iban: string): string => iban.replace(/\s+/g, '').toUpperCase()
