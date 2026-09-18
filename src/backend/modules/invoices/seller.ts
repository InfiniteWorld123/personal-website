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
export const sellerGaps = (seller: Seller = SELLER): string[] => {
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

export const isSellerReady = (seller: Seller = SELLER): boolean => sellerGaps(seller).length === 0

/** The IBAN as a payment code wants it: no spaces, upper case. */
export const compactIban = (iban: string): string => iban.replace(/\s+/g, '').toUpperCase()
