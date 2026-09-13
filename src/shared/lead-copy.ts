import type { LeadLanguage } from './validation/lead.validation'

/**
 * The words that leave the inbox in the visitor's own language.
 *
 * Shared rather than written twice: the reply mail appends the sign-off, and
 * the composer shows the same one under the draft. Two copies of it would
 * drift, and the owner would be previewing a letter he is not sending.
 */
export const LEAD_SIGN_OFF: Record<LeadLanguage, string> = {
  de: 'Beste Grüße,\nYaman Warda\nDigitale Systeme · yamanwarda.de',
  en: 'Best,\nYaman Warda\nDigital systems · yamanwarda.de',
  ar: 'تحياتي،\nيمان وردة\nأنظمة رقمية · yamanwarda.de',
}

export const REPLY_PLACEHOLDER: Record<LeadLanguage, string> = {
  de: 'Antwort schreiben…',
  en: 'Write your reply…',
  ar: 'اكتب ردّك…',
}

/**
 * Three openings the owner reaches for often. The button that inserts them is
 * labelled in English, like the rest of the admin; what it inserts is written
 * in the language the visitor wrote in, because that text is going to them.
 */
export const LEAD_SNIPPETS: Record<LeadLanguage, [string, string, string]> = {
  de: [
    'Passt ein kurzes Gespräch? Diese Zeiten hätte ich diese Woche frei:',
    'Bevor ich eine Zahl nenne: mit welchem Budgetrahmen rechnen Sie?',
    'Hier ist mein Vorschlag, gültig für 14 Tage:',
  ],
  en: [
    'Would a short call work? Here are three times that suit me this week:',
    'Before I put a number on this: what budget range are you working with?',
    'Here is my proposal, valid for 14 days:',
  ],
  ar: [
    'هل يناسبك اتصال قصير؟ هذه أوقاتي المتاحة هذا الأسبوع:',
    'قبل أن أذكر رقماً: ما حدود الميزانية التي تعمل عليها؟',
    'هذا عرضي، وهو ساري لأربعة عشر يوماً:',
  ],
}

/** English, for the buttons themselves — the admin's own language. */
export const SNIPPET_LABELS = ['Propose a call', 'Ask about budget', 'Send an offer'] as const
