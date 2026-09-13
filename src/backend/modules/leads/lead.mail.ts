import {
  BRAND,
  button,
  escapeHtml,
  layout,
  plainText,
  sendMail,
  type Row,
} from '#/backend/shared/mail'
import { env } from '#/shared/env'
import { LEAD_SIGN_OFF } from '#/shared/lead-copy'
import type { LeadLanguage, LeadSource } from '#/shared/validation/lead.validation'
import { replyAddressFor } from './lead.inbound'

/**
 * The two letters the inbox sends: the owner's notification when something
 * arrives, and his reply to the person who wrote.
 *
 * Neither may fail what it announces. The lead is written to the database
 * first and the mail is attempted afterwards, so a Resend outage costs a
 * notification — never the message itself, which is exactly what the old
 * mail-only endpoint could lose.
 */

type ReplyCopy = { greeting: string; fallbackSubject: string }

const COPY: Record<LeadLanguage, ReplyCopy> = {
  de: {
    greeting: 'Hallo',
    fallbackSubject: 'Deine Anfrage',
  },
  en: {
    greeting: 'Hi',
    fallbackSubject: 'Your enquiry',
  },
  ar: {
    greeting: 'مرحباً',
    fallbackSubject: 'بخصوص رسالتك',
  },
}

const multiline = (value: string) => escapeHtml(value).replaceAll('\n', '<br />')

const adminUrl = (leadId: string) =>
  `${env.BASE_URL.replace(/\/$/, '')}/admin/inbox?lead=${encodeURIComponent(leadId)}`

/** German labels: the notification has exactly one reader. */
const SOURCE_LABEL: Record<LeadSource, string> = {
  CONTACT_FORM: 'Kontaktformular',
  BOOKING: 'Buchung',
  MANUAL: 'Manuell angelegt',
}

export type LeadNotificationInput = {
  id: string
  source: LeadSource
  name: string
  email: string
  company: string
  phone: string
  projectType: string
  budget: string
  timeline: string
  message: string
  language: LeadLanguage
  /** Forwarded as a real attachment: the bytes are not kept anywhere else. */
  attachment?: { filename: string; content: string } | null
}

/**
 * Short on purpose. The message now lives in the admin, and a notification
 * that repeats all of it invites answering from the phone, which is the one
 * path that leaves no trace in the conversation.
 *
 * The one thing it does carry whole is the attachment, because the database
 * keeps only its name — uploads belong to B6.
 */
export const sendLeadNotificationMail = async (
  input: LeadNotificationInput,
): Promise<boolean> => {
  const to = env.CONTACT_TO_EMAIL
  if (!to) return false

  const excerpt = input.message.length > 400 ? `${input.message.slice(0, 400)}…` : input.message

  const rows: Row[] = [
    { label: 'Von', value: escapeHtml(input.name) },
    {
      label: 'E-Mail',
      value: `<a href="mailto:${escapeHtml(input.email)}" style="color:${BRAND.primary};text-decoration:none">${escapeHtml(input.email)}</a>`,
    },
    { label: 'Unternehmen', value: escapeHtml(input.company) },
    { label: 'Telefon', value: escapeHtml(input.phone) },
    { label: 'Worum geht es', value: escapeHtml(input.projectType) },
    { label: 'Budgetrahmen', value: escapeHtml(input.budget) },
    { label: 'Zeitrahmen', value: escapeHtml(input.timeline) },
    { label: 'Sprache', value: input.language.toUpperCase() },
    { label: 'Anhang', value: input.attachment ? escapeHtml(input.attachment.filename) : '' },
    { label: 'Eingang', value: SOURCE_LABEL[input.source] },
  ]

  const { accepted } = await sendMail(
    {
      to: [to],
      reply_to: input.email,
      subject: `Neue Anfrage: ${input.name}${input.company ? ` (${input.company})` : ''}`,
      html: layout({
        language: 'de',
        heading: 'Neue Anfrage',
        intro: `${input.name} hat über die Website geschrieben. Die Nachricht liegt im Posteingang.`,
        body: excerpt ? `<em style="color:${BRAND.muted}">${multiline(excerpt)}</em>` : '',
        rows,
        actions: button(adminUrl(input.id), 'Im Posteingang öffnen', 'left', true),
        signOff: '',
      }),
      text: plainText([
        'Neue Anfrage',
        '',
        `Von: ${input.name}`,
        `E-Mail: ${input.email}`,
        Boolean(input.company) && `Unternehmen: ${input.company}`,
        Boolean(input.phone) && `Telefon: ${input.phone}`,
        Boolean(input.projectType) && `Worum geht es: ${input.projectType}`,
        Boolean(input.budget) && `Budgetrahmen: ${input.budget}`,
        Boolean(input.timeline) && `Zeitrahmen: ${input.timeline}`,
        input.attachment ? `Anhang: ${input.attachment.filename}` : false,
        '',
        excerpt,
        '',
        adminUrl(input.id),
      ]),
      ...(input.attachment ? { attachments: [input.attachment] } : {}),
    },
    'inbox',
  )

  return accepted
}

export type LeadReplyMailInput = {
  to: string
  toName: string
  subject: string
  body: string
  language: LeadLanguage
  /** Threads their answer back onto this lead, when inbound mail is set up. */
  replyToken: string | null
  withSignature: boolean
}

/**
 * The owner's reply, in the site's own letter rather than a bare paragraph —
 * this is the second thing a prospective client sees from him, after the page.
 */
export const sendLeadReplyMail = async (
  input: LeadReplyMailInput,
): Promise<{ accepted: boolean; id?: string }> => {
  const copy = COPY[input.language]
  const subject = input.subject.trim() || copy.fallbackSubject
  const replyTo = input.replyToken ? replyAddressFor(input.replyToken) : null

  return sendMail(
    {
      to: [input.to],
      subject,
      ...(replyTo ? { reply_to: replyTo } : {}),
      html: layout({
        language: input.language,
        heading: subject,
        intro: `${copy.greeting} ${input.toName},`,
        body: multiline(input.body),
        rows: [],
        actions: '',
        signOff: input.withSignature ? LEAD_SIGN_OFF[input.language] : '',
      }),
      text: plainText([
        `${copy.greeting} ${input.toName},`,
        '',
        input.body,
        input.withSignature ? '' : false,
        input.withSignature ? LEAD_SIGN_OFF[input.language] : false,
      ]),
    },
    'inbox',
  )
}
