import type { Language } from '#/frontend/i18n/language'

/**
 * The public words Blog V2 added, exactly as the owner approved them with the
 * Blog Design Lab on 23 Sep 2026 (`docs/v2/blog.md`, decisions 1A–7A and "the
 * new public words"): the comment section, its refusals, the click-to-load
 * video notice and "Updated on".
 *
 * Kept beside the feature rather than in the site copy (`content/*.ts`), so
 * the Content module's editable fields are not silently widened by them.
 *
 * `commentsError` is the one sentence the lab did not show for visitors (it
 * showed the articles' own "could not be loaded"); it follows that wording.
 */

export type CommentRefusalWord =
  | 'empty'
  | 'too_long'
  | 'too_many_links'
  | 'markup'
  | 'duplicate'
  | 'too_fast'
  | 'too_deep'
  | 'gone'
  | 'rejected'
  | 'server'

/** Plural forms by `Intl.PluralRules` category; `other` is always present. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }

export type BlogV2Words = {
  updated: string
  videoPlay: string
  videoNote: string
  title: string
  count: PluralForms
  label: string
  replyLabel: string
  hint: string
  post: string
  postReply: string
  posting: string
  cancel: string
  reply: string
  guest: string
  author: string
  showReplies: PluralForms
  continueThread: string
  back: string
  more: string
  empty: string
  posted: string
  chars: string
  loading: string
  commentsError: string
  retry: string
  refuse: Record<CommentRefusalWord, string>
}

const de: BlogV2Words = {
  updated: 'Aktualisiert am {date}',
  videoPlay: 'Video abspielen',
  videoNote:
    'Das Video wird erst beim Abspielen von YouTube geladen. YouTube erhält dabei Daten wie deine IP-Adresse.',
  title: 'Kommentare',
  count: { one: '1 Kommentar', other: '{count} Kommentare' },
  label: 'Dein Kommentar',
  replyLabel: 'Deine Antwort an {who}',
  hint: 'Ohne Konto. Dein Kommentar erscheint sofort. Höchstens zwei Links, kein HTML.',
  post: 'Kommentar senden',
  postReply: 'Antwort senden',
  posting: 'Wird gesendet …',
  cancel: 'Abbrechen',
  reply: 'Antworten',
  guest: 'Gast',
  author: 'Autor',
  showReplies: { one: '1 Antwort anzeigen', other: '{count} Antworten anzeigen' },
  continueThread: 'Unterhaltung weiterlesen',
  back: 'Zurück zu allen Kommentaren',
  more: 'Weitere Kommentare laden',
  empty: 'Noch keine Kommentare. Schreib den ersten.',
  posted: 'Dein Kommentar ist online.',
  chars: '{count} / 3.000',
  loading: 'Kommentare werden geladen …',
  commentsError: 'Die Kommentare konnten gerade nicht geladen werden.',
  retry: 'Erneut versuchen',
  refuse: {
    empty: 'Schreib etwas, bevor du sendest.',
    too_long: 'Ein Kommentar darf höchstens 3.000 Zeichen haben.',
    too_many_links: 'Ein Kommentar darf höchstens zwei Links enthalten.',
    markup: 'Kommentare sind reiner Text. Entferne den HTML-Code und versuch es noch einmal.',
    duplicate: 'Dieser Kommentar wurde schon gesendet.',
    too_fast: 'Du kommentierst gerade sehr schnell. Warte ein paar Minuten und versuch es dann noch einmal.',
    too_deep: 'Diese Unterhaltung ist hier zu tief verschachtelt. Antworte auf einen früheren Kommentar.',
    gone: 'Dieser Kommentar ist nicht mehr da. Lade die Kommentare neu.',
    rejected: 'Dein Kommentar konnte nicht gesendet werden.',
    server: 'Dein Kommentar konnte gerade nicht gesendet werden. Dein Text ist noch da — versuch es noch einmal.',
  },
}

const en: BlogV2Words = {
  updated: 'Updated {date}',
  videoPlay: 'Play video',
  videoNote:
    'The video loads from YouTube only when you play it. YouTube then receives data such as your IP address.',
  title: 'Comments',
  count: { one: '1 comment', other: '{count} comments' },
  label: 'Your comment',
  replyLabel: 'Your reply to {who}',
  hint: 'No account needed. Your comment appears right away. Two links at most, no HTML.',
  post: 'Post comment',
  postReply: 'Post reply',
  posting: 'Posting…',
  cancel: 'Cancel',
  reply: 'Reply',
  guest: 'Guest',
  author: 'Author',
  showReplies: { one: 'Show 1 reply', other: 'Show {count} replies' },
  continueThread: 'Continue this conversation',
  back: 'Back to all comments',
  more: 'Load more comments',
  empty: 'No comments yet. Be the first.',
  posted: 'Your comment is live.',
  chars: '{count} / 3,000',
  loading: 'Loading comments…',
  commentsError: 'The comments could not be loaded just now.',
  retry: 'Try again',
  refuse: {
    empty: 'Write something before posting.',
    too_long: 'A comment may be at most 3,000 characters.',
    too_many_links: 'A comment may contain at most 2 links.',
    markup: 'Comments are plain text. Remove the HTML code and try again.',
    duplicate: 'This comment has already been posted.',
    too_fast: 'You are commenting very quickly. Wait a few minutes and try again.',
    too_deep: 'This conversation is too deep to continue here. Reply to an earlier comment instead.',
    gone: 'That comment is no longer there. Reload the comments and try again.',
    rejected: 'Your comment could not be posted.',
    server: 'Your comment could not be posted just now. Your text is still here — try again.',
  },
}

const ar: BlogV2Words = {
  updated: 'حُدّث في {date}',
  videoPlay: 'شغّل الفيديو',
  videoNote: 'لا يُحمَّل الفيديو من يوتيوب إلا عند تشغيله. عندها يحصل يوتيوب على بيانات مثل عنوان IP الخاص بك.',
  title: 'التعليقات',
  count: {
    zero: 'لا تعليقات',
    one: 'تعليق واحد',
    two: 'تعليقان',
    few: '{count} تعليقات',
    many: '{count} تعليقاً',
    other: '{count} تعليق',
  },
  label: 'تعليقك',
  replyLabel: 'ردّك على {who}',
  hint: 'بلا حساب. يظهر تعليقك فوراً. رابطان على الأكثر، ومن دون HTML.',
  post: 'انشر التعليق',
  postReply: 'انشر الرد',
  posting: 'جارٍ النشر…',
  cancel: 'إلغاء',
  reply: 'ردّ',
  guest: 'زائر',
  author: 'الكاتب',
  showReplies: {
    one: 'اعرض الرد',
    two: 'اعرض الردّين',
    few: 'اعرض {count} ردود',
    many: 'اعرض {count} رداً',
    other: 'اعرض {count} رد',
  },
  continueThread: 'تابع المحادثة',
  back: 'العودة إلى كل التعليقات',
  more: 'حمّل مزيداً من التعليقات',
  empty: 'لا تعليقات بعد. كن أول من يكتب.',
  posted: 'نُشر تعليقك.',
  chars: '{count} / 3000',
  loading: 'جارٍ تحميل التعليقات…',
  commentsError: 'تعذّر تحميل التعليقات الآن.',
  retry: 'حاول مرة أخرى',
  refuse: {
    empty: 'اكتب شيئاً قبل النشر.',
    too_long: 'يجب ألا يزيد التعليق على 3000 حرف.',
    too_many_links: 'يمكن أن يحتوي التعليق على رابطين على الأكثر.',
    markup: 'التعليقات نص عادي فقط. احذف كود HTML وحاول مرة أخرى.',
    duplicate: 'هذا التعليق منشور بالفعل.',
    too_fast: 'أنت تعلّق بسرعة كبيرة. انتظر بضع دقائق ثم حاول مرة أخرى.',
    too_deep: 'هذه المحادثة عميقة جداً هنا. ردّ على تعليق أسبق.',
    gone: 'هذا التعليق لم يعد موجوداً. أعد تحميل التعليقات.',
    rejected: 'تعذّر نشر تعليقك.',
    server: 'تعذّر نشر تعليقك الآن. نصّك ما زال هنا — حاول مرة أخرى.',
  },
}

const WORDS: Record<Language, BlogV2Words> = { de, en, ar }

export const blogV2Words = (language: Language): BlogV2Words => WORDS[language]

const LOCALE: Record<Language, string> = { de: 'de-DE', en: 'en-GB', ar: 'ar' }

/** A number the way this site writes it: grouped by locale, always Western digits. */
export const formatCount = (value: number, language: Language): string =>
  new Intl.NumberFormat(LOCALE[language], { numberingSystem: 'latn' }).format(value)

/** The right plural form, then the number inside it. `Intl.PluralRules` decides. */
export const pluralWord = (forms: PluralForms, value: number, language: Language): string => {
  const category = new Intl.PluralRules(LOCALE[language]).select(value)

  return (forms[category] ?? forms.other).replace('{count}', formatCount(value, language))
}

export const fillWord = (text: string, values: Record<string, string>): string =>
  Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, value), text)

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "3 minutes ago" in the reader's language; the full date sits in the element's title. */
export const timeAgo = (iso: string, language: Language, now = Date.now()): string => {
  const diff = Math.max(0, now - new Date(iso).getTime())
  // `-u-nu-latn`: the Arabic copy on this site uses Western digits throughout.
  const format = new Intl.RelativeTimeFormat(`${LOCALE[language]}-u-nu-latn`, { numeric: 'auto' })

  if (diff < MINUTE) return format.format(0, 'second')
  if (diff < HOUR) return format.format(-Math.round(diff / MINUTE), 'minute')
  if (diff < DAY) return format.format(-Math.round(diff / HOUR), 'hour')
  if (diff < 30 * DAY) return format.format(-Math.round(diff / DAY), 'day')
  if (diff < 365 * DAY) return format.format(-Math.round(diff / (30 * DAY)), 'month')

  return format.format(-Math.round(diff / (365 * DAY)), 'year')
}
