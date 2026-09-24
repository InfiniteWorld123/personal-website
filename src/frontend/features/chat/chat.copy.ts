import type { Language } from '#/frontend/i18n/language'

/**
 * The widget's own chrome, in three languages (D34).
 *
 * Separate from `frontend/content` on purpose. That file is the site's copy —
 * the words the owner edits in the Dashboard's Content editor, which are about what he
 * sells. These are interface labels: a close button, a placeholder, the
 * sentence shown when the network fails. Putting them in the editable content
 * would hand him three hundred more strings to maintain and one more way to
 * accidentally publish a page with no way to close a dialog.
 *
 * The greeting, the suggestions and the disclosure are deliberately *not*
 * here: those come from the server with the settings, because they change with
 * configuration rather than with translation.
 */

type ChatChrome = {
  title: string
  subtitle: string
  launcher: string
  placeholder: string
  inputLabel: string
  send: string
  close: string
  thinking: string
  exhausted: string
  failed: string
  /** Shown only in the moment before the server's own wording has arrived. */
  disclosureFallback: string
}

export const chatCopy: Record<Language, ChatChrome> = {
  de: {
    title: 'Assistent',
    subtitle: 'Antwortet sofort',
    launcher: 'Frage stellen',
    placeholder: 'Frag mich etwas …',
    inputLabel: 'Deine Frage',
    send: 'Frage senden',
    close: 'Schließen',
    thinking: 'Antwort wird geschrieben',
    exhausted: 'Schreib mir direkt — info@yamanwarda.de',
    failed: 'Das hat gerade nicht geklappt. Versuch es noch einmal, oder schreib an info@yamanwarda.de.',
    disclosureFallback: 'Automatische Antwort. Es liest niemand mit.',
  },
  en: {
    title: 'Assistant',
    subtitle: 'Replies instantly',
    launcher: 'Ask a question',
    placeholder: 'Ask me anything …',
    inputLabel: 'Your question',
    send: 'Send question',
    close: 'Close',
    thinking: 'Writing a reply',
    exhausted: 'Write to me directly — info@yamanwarda.de',
    failed: 'That did not work just now. Try again, or write to info@yamanwarda.de.',
    disclosureFallback: 'Automated reply. No human is reading along.',
  },
  ar: {
    title: 'المساعد',
    subtitle: 'يرد فوراً',
    launcher: 'اسأل سؤالاً',
    placeholder: 'اسألني أي شيء …',
    inputLabel: 'سؤالك',
    send: 'أرسل السؤال',
    close: 'إغلاق',
    thinking: 'يكتب الرد',
    exhausted: 'اكتب لي مباشرة — info@yamanwarda.de',
    failed: 'لم ينجح هذا الآن. حاول مرة أخرى، أو اكتب إلى info@yamanwarda.de.',
    disclosureFallback: 'رد آلي. لا يقرأ هنا إنسان.',
  },
}
