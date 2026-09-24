import type { Language } from '#/frontend/i18n/language'

/**
 * The Backend2 Contact form's client-side rules and the words that are new
 * with it (`docs/v2/inbox.md`, "Public contact form handoff").
 *
 * The limits are copies of `contact.contract.ts`, spelled out so the page does
 * not carry the contract's validation schemas; `public-contact.test.tsx`
 * keeps every value equal to its source. The server checks everything again —
 * and decides a file's type from its bytes, never from the name checked here.
 */

export const CONTACT_V2_ENDPOINT = '/api/v2/public/contact'

export const CONTACT_V2_LIMITS = {
  name: 120,
  email: 254,
  messageMin: 10,
  message: 5000,
  phone: 40,
  company: 200,
  fileBytes: 10 * 1024 * 1024,
} as const

/** What the file picker offers — the contract's `CONTACT_FILE_ACCEPT`. */
export const CONTACT_V2_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.avif,.mp4,.m4v,.mov,.webm,.docx,.xlsx,.pptx,.doc,.xls,.ppt'

const EXTENSIONS = new Set(CONTACT_V2_ACCEPT.split(',').map((extension) => extension.slice(1)))

export type FileProblem = 'size' | 'type'

/** A quick first answer for the visitor; the server's byte check is the real one. */
export const fileProblem = (file: { name: string; size: number }): FileProblem | null => {
  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''

  if (!EXTENSIONS.has(extension)) return 'type'
  if (file.size > CONTACT_V2_LIMITS.fileBytes) return 'size'

  return null
}

export const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/u
export const PHONE_PATTERN = /^[+()\d\s./-]{5,}$/u

export type ContactV2Words = {
  attachmentHint: string
  fileSize: string
  fileType: string
  messageShort: string
  messageLong: string
  phone: string
  tooLong: string
  rateLimited: string
  verification: string
}

const words: Record<Language, ContactV2Words> = {
  en: {
    attachmentHint: 'Optional: one PDF, image, video, or Word, Excel or PowerPoint file (up to 10 MB)',
    fileSize: 'That file is larger than 10 MB. A bigger video cannot be sent here — put a link to it in your message instead.',
    fileType: 'This kind of file cannot be sent. Choose a PDF, an image, a video, or a Word, Excel or PowerPoint file.',
    messageShort: 'Please write at least 10 characters.',
    messageLong: 'Please keep the message under 5,000 characters.',
    phone: 'Enter a valid phone number.',
    tooLong: 'That is too long.',
    rateLimited: 'Too many messages from here in a short time. Please try again later or email me directly.',
    verification: 'The security check did not pass. Please try again.',
  },
  de: {
    attachmentHint: 'Optional: eine PDF, ein Bild, ein Video oder eine Word-, Excel- oder PowerPoint-Datei (bis 10 MB)',
    fileSize: 'Die Datei ist größer als 10 MB. Ein größeres Video lässt sich hier nicht senden — schick stattdessen einen Link in deiner Nachricht.',
    fileType: 'Diese Art Datei kann nicht gesendet werden. Wähl eine PDF, ein Bild, ein Video oder eine Word-, Excel- oder PowerPoint-Datei.',
    messageShort: 'Bitte schreib mindestens 10 Zeichen.',
    messageLong: 'Bitte halte die Nachricht unter 5.000 Zeichen.',
    phone: 'Gib eine gültige Telefonnummer ein.',
    tooLong: 'Das ist zu lang.',
    rateLimited: 'Zu viele Nachrichten in kurzer Zeit. Bitte versuch es später noch einmal oder schreib mir direkt per E-Mail.',
    verification: 'Die Sicherheitsprüfung hat nicht geklappt. Bitte versuch es noch einmal.',
  },
  ar: {
    attachmentHint: 'اختياري: ملف PDF أو صورة أو فيديو أو ملف Word أو Excel أو PowerPoint (حتى 10 ميغابايت)',
    fileSize: 'حجم الملف أكبر من 10 ميغابايت. لا يمكن إرسال فيديو أكبر من هنا — ضع رابطاً إليه في رسالتك بدلاً من ذلك.',
    fileType: 'لا يمكن إرسال هذا النوع من الملفات. اختر ملف PDF أو صورة أو فيديو أو ملف Word أو Excel أو PowerPoint.',
    messageShort: 'اكتب 10 أحرف على الأقل من فضلك.',
    messageLong: 'اجعل الرسالة أقل من 5,000 حرف من فضلك.',
    phone: 'اكتب رقم هاتف صحيحاً.',
    tooLong: 'النص طويل جداً.',
    rateLimited: 'رسائل كثيرة في وقت قصير. حاول لاحقاً أو راسلني مباشرة عبر البريد.',
    verification: 'لم ينجح فحص الأمان. حاول مرة أخرى من فضلك.',
  },
}

export const getContactV2Words = (language: Language): ContactV2Words => words[language]
