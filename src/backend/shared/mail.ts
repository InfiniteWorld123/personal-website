import { env } from '#/shared/env'

/**
 * Every letter the platform sends, in one layout.
 *
 * Written the way mail clients still need it: tables, inline styles, no
 * external stylesheet, no web font. Georgia stands in for the site's Fraunces
 * headings, because it is the serif every client already has.
 *
 * The colours are the site's own, taken from `styles.css`: a booking
 * confirmation and a reply from the inbox should both look like the page the
 * reader just left.
 *
 * Lifted out of the booking module when the inbox needed the same letter (B4).
 */

export type MailLanguage = 'de' | 'en' | 'ar'

export const RESEND_API_URL = 'https://api.resend.com/emails'

export const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')


export const BRAND = {
  primary: '#355cff',
  ink: '#10172f',
  muted: '#5d6b8f',
  faint: '#8794b4',
  line: '#e3ebff',
  ground: '#f4f7ff',
  card: '#ffffff',
} as const

export const SANS = 'Helvetica,Arial,sans-serif'
export const SERIF = "Georgia,'Times New Roman',serif"

export type Row = { label: string; value: string }

/** `value` is placed as HTML, so callers escape whatever came from a person. */
export const detailRows = (rows: Row[], align: string): string =>
  rows
    .filter((row) => row.value)
    .map(
      (row) => `
        <tr>
          <td style="padding:0 0 16px;text-align:${align}">
            <div style="font:700 11px/1.4 ${SANS};letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.faint}">${escapeHtml(row.label)}</div>
            <div style="font:700 15px/1.6 ${SANS};color:${BRAND.ink};padding-top:3px">${row.value}</div>
          </td>
        </tr>`,
    )
    .join('')

export const button = (href: string, label: string, align: string, filled: boolean): string => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" style="margin:4px 0 0">
    <tr>
      <td bgcolor="${filled ? BRAND.primary : BRAND.card}" style="border-radius:999px;border:1px solid ${filled ? BRAND.primary : BRAND.line}">
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;font:700 14px/1 ${SANS};color:${filled ? '#ffffff' : BRAND.ink};text-decoration:none;border-radius:999px">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`

export const layout = ({
  language,
  heading,
  intro,
  body,
  rows,
  actions,
  signOff,
}: {
  language: MailLanguage
  heading: string
  intro: string
  /** Prose between the intro and the facts. Raw HTML: the caller escapes it. */
  body?: string
  rows: Row[]
  actions: string
  signOff: string
}): string => {
  const rtl = language === 'ar'
  const align = rtl ? 'right' : 'left'
  const site = env.BASE_URL.replace(/\/$/, '')

  return `<!doctype html>
<html dir="${rtl ? 'rtl' : 'ltr'}" lang="${language}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.ground}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.ground};padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:18px;overflow:hidden">
            <tr><td style="height:5px;background:${BRAND.primary};font-size:0;line-height:0">&nbsp;</td></tr>
            <tr>
              <td style="padding:26px 30px 0;text-align:${align}">
                <div style="font:700 12px/1 ${SANS};letter-spacing:2.4px;text-transform:uppercase;color:${BRAND.ink}">${escapeHtml(env.APP_NAME)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 30px 0;text-align:${align}">
                <h1 style="margin:0;font:700 25px/1.25 ${SERIF};color:${BRAND.ink}">${escapeHtml(heading)}</h1>
                <p style="margin:12px 0 0;font:400 15px/1.75 ${SANS};color:${BRAND.muted}">${escapeHtml(intro)}</p>
              </td>
            </tr>
            ${
              body
                ? `<tr>
              <td style="padding:18px 30px 0;text-align:${align}">
                <div style="font:400 15px/1.75 ${SANS};color:${BRAND.ink}">${body}</div>
              </td>
            </tr>`
                : ''
            }
            ${rows.some((row) => row.value) ? `<tr>
              <td style="padding:24px 30px 0">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.ground};border-radius:14px">
                  <tr>
                    <td style="padding:20px 22px 4px">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        ${detailRows(rows, align)}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>` : ''}
            ${actions ? `<tr><td style="padding:22px 30px 0;text-align:${align}">${actions}</td></tr>` : ''}
            ${
              signOff
                ? `<tr>
              <td style="padding:26px 30px 30px;text-align:${align}">
                <p style="margin:0;font:400 15px/1.7 ${SANS};color:${BRAND.muted}">${escapeHtml(signOff).replaceAll('\n', '<br />')}</p>
              </td>
            </tr>`
                : '<tr><td style="height:26px;font-size:0;line-height:0">&nbsp;</td></tr>'
            }
            <tr>
              <td style="padding:16px 30px;border-top:1px solid ${BRAND.line};text-align:${align}">
                <a href="${escapeHtml(site)}" style="font:400 12px/1.6 ${SANS};color:${BRAND.faint};text-decoration:none">${escapeHtml(site.replace(/^https?:\/\//, ''))}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/** The same letter for a client that refuses HTML, and for spam scoring. */
export const plainText = (lines: Array<string | false | null>): string =>
  lines.filter((line): line is string => Boolean(line)).join('\n')

export const toBase64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary)
}


/**
 * One request to Resend.
 *
 * Nothing here is allowed to fail the thing it announces: `architecture.md`
 * fixes the order — the record is persisted first and the mail is attempted
 * afterwards, so a Resend outage costs a notification, never a booking the
 * visitor was told was confirmed.
 *
 * Returns whether the provider accepted it, because the inbox records the
 * moment a lead was announced and a silent failure there is invisible.
 */
export const sendMail = async (
  payload: Record<string, unknown>,
  scope: string,
): Promise<{ accepted: boolean; id?: string }> => {
  const apiKey = env.RESEND_API_KEY

  if (!apiKey || !env.EMAIL_FROM) {
    console.warn(`[${scope}] email is not configured; skipping send`)

    return { accepted: false }
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, ...payload }),
    })

    if (!response.ok) {
      console.error(`[${scope}] email rejected`, { status: response.status })

      return { accepted: false }
    }

    const result = (await response.json().catch(() => ({}))) as { id?: string }

    return { accepted: true, id: typeof result.id === 'string' ? result.id : undefined }
  } catch (error) {
    // Swallowed on purpose: see the note at the top of this function.
    console.error(`[${scope}] email failed`, {
      name: error instanceof Error ? error.name : 'UnknownError',
    })

    return { accepted: false }
  }
}
