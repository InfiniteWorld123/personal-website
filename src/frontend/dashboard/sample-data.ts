/**
 * Everything on `/dashboard` today, and none of it is true.
 *
 * Backend2 does not exist yet, and no V2 module has an approved specification,
 * so the screens are drawn from this file instead of from a database. That is
 * a deliberate, temporary state with two rules attached:
 *
 *  1. Every screen that reads from here shows the `Sample data` badge. A figure
 *     on a dashboard that looks counted but is not is the exact failure this
 *     platform has already had once.
 *  2. This is the only file that has to change. Each export below is the shape
 *     a Backend2 query will return, so wiring a real module means replacing one
 *     import — not rewriting a page.
 *
 * Nothing here is a business rule. The numbers are plausible, they add up
 * inside their own panel, and that is all they are.
 */

export type Tone = 'blue' | 'grey' | 'red' | 'ink' | 'outline'

/** The four facts the Overview is built around, in cents and whole counts. */
export const sampleFigures = {
  revenueCents: 845_000,
  revenueChangePercent: 12,
  receivedThisWeekCents: 165_000,

  overdueCents: 218_000,
  overdueCount: 3,

  visits: 1_284,
  visitsChangePercent: 18,
  visitsLastMonth: 1_092,

  unread: 7,
  unreadNeedingReplyToday: 2,
} as const

/** Monday first, the way the week is read here. */
export const sampleWeek = [
  { day: 'Monday', short: 'M', visits: 186 },
  { day: 'Tuesday', short: 'T', visits: 204 },
  { day: 'Wednesday', short: 'W', visits: 241 },
  { day: 'Thursday', short: 'T', visits: 198 },
  { day: 'Friday', short: 'F', visits: 223 },
  { day: 'Saturday', short: 'S', visits: 142 },
  { day: 'Sunday', short: 'S', visits: 90 },
] as const

export const sampleToday = [
  {
    id: 'call-meridian',
    when: '14:00 – 14:30',
    what: 'Kickoff — Meridian Handel',
    detail: 'Video call · 30 min',
    urgent: false,
  },
  {
    id: 'invoice-047',
    when: '22.09.2026',
    what: 'INV-2026-047 is due',
    detail: 'Praxis Dr. Lehmann · 980 €',
    urgent: true,
  },
] as const

export const sampleNextCall = {
  countdown: '01:24:08',
  who: 'Meridian Handel',
  at: '14:00',
} as const

export const sampleLeads = [
  { id: 'l1', initials: 'LB', name: 'Lena Brandt', about: 'Workshop for 8 people, October', status: 'Quoted', tone: 'blue' },
  { id: 'l2', initials: 'KS', name: 'Kolb & Sohn', about: 'Wartungsvertrag, 12 Monate', status: 'Won', tone: 'ink' },
  { id: 'l3', initials: 'JW', name: 'Jonas Weiß', about: 'Onlineshop, rund 40 Produkte', status: 'New', tone: 'blue' },
  { id: 'l4', initials: 'PL', name: 'Praxis Dr. Lehmann', about: 'Relaunch, wartet auf Inhalte', status: 'Waiting', tone: 'outline' },
] as const satisfies readonly { id: string; initials: string; name: string; about: string; status: string; tone: Tone }[]

export const sampleProjects = [
  { id: 'p1', initials: 'PE', name: 'Prime Estate', note: 'Updated 2 days ago', live: true },
  { id: 'p2', initials: 'TS', name: 'Tech Store', note: 'Updated 5 days ago', live: true },
  { id: 'p3', initials: 'IN', name: 'InkNest', note: 'Updated 12.09.2026', live: true },
  { id: 'p4', initials: 'KB', name: 'Klinik Berger', note: 'Hidden from the site', live: false },
] as const

/**
 * How much of everything on the books has actually landed.
 *
 * `invoicedCents` is the sum of every row in `sampleInvoices` — paid, open and
 * overdue together — so the gauge on the Overview can be checked against the
 * table on the Invoices screen. "This month" would have been the wrong frame:
 * the overdue invoices were issued in August, and a figure that quietly
 * excludes them while the card above it counts them is the kind of small lie
 * that makes a dashboard untrustworthy.
 */
export const sampleCollected = {
  paidCents: 845_000,
  invoicedCents: 1_161_000,
} as const

export type SampleInvoice = {
  id: string
  client: string
  number: string
  issued: string
  due: string
  status: string
  tone: Tone
  group: 'open' | 'overdue' | 'paid'
  cents: number
}

export const sampleInvoices: readonly SampleInvoice[] = [
  { id: 'i1', client: 'Meridian Handel GmbH', number: 'INV-2026-041', issued: '23.08.2026', due: '06.09.2026', status: 'Overdue', tone: 'red', group: 'overdue', cents: 124_000 },
  { id: 'i2', client: 'Kolb & Sohn', number: 'INV-2026-038', issued: '15.08.2026', due: '29.08.2026', status: 'Overdue', tone: 'red', group: 'overdue', cents: 62_000 },
  { id: 'i3', client: 'Praxis Dr. Lehmann', number: 'INV-2026-044', issued: '30.08.2026', due: '13.09.2026', status: 'Overdue', tone: 'red', group: 'overdue', cents: 32_000 },
  { id: 'i4', client: 'Praxis Dr. Lehmann', number: 'INV-2026-047', issued: '08.09.2026', due: '22.09.2026', status: 'Open', tone: 'blue', group: 'open', cents: 98_000 },
  { id: 'i5', client: 'Atelier Sommer', number: 'INV-2026-045', issued: '02.09.2026', due: '16.09.2026', status: 'Paid', tone: 'ink', group: 'paid', cents: 245_000 },
  { id: 'i6', client: 'Tech Store', number: 'INV-2026-043', issued: '28.08.2026', due: '11.09.2026', status: 'Paid', tone: 'ink', group: 'paid', cents: 600_000 },
]

/** The three overdue rows the Overview shows, newest debt last. */
export const sampleOverdue = [
  { id: 'i1', client: 'Meridian Handel GmbH', number: 'INV-2026-041', due: '06.09.2026', lateDays: 14, cents: 124_000 },
  { id: 'i2', client: 'Kolb & Sohn', number: 'INV-2026-038', due: '29.08.2026', lateDays: 22, cents: 62_000 },
  { id: 'i3', client: 'Praxis Dr. Lehmann', number: 'INV-2026-044', due: '13.09.2026', lateDays: 7, cents: 32_000 },
] as const

export type SampleMessage = {
  id: string
  initials: string
  from: string
  address: string
  time: string
  subject: string
  preview: string
  body: string
  replyToday: boolean
}

export const sampleMessages: readonly SampleMessage[] = [
  {
    id: 'm1',
    initials: 'LB',
    from: 'Lena Brandt',
    address: 'l.brandt@brandt-consulting.de',
    time: '09:42',
    subject: 'Re: Workshop dates in October',
    preview: 'Thanks for the options — the 14th works for us…',
    replyToday: true,
    body: 'Hi Yaman,\n\nThanks for the options. The 14th works for us, and we would be eight people rather than six.\n\nCould you send an updated quote with that number? We would also like the recording, if that is possible.\n\nBest,\nLena',
  },
  {
    id: 'm2',
    initials: 'KS',
    from: 'Kolb & Sohn',
    address: 'buchhaltung@kolb-sohn.de',
    time: '08:15',
    subject: 'Zahlung Rechnung INV-2026-038',
    preview: 'Die Zahlung ist bei uns in der Freigabe…',
    replyToday: true,
    body: 'Guten Morgen Herr Warda,\n\ndie Zahlung für INV-2026-038 liegt bei uns in der Freigabe und geht spätestens am Freitag raus.\n\nEntschuldigen Sie die Verzögerung — unsere Buchhaltung war zwei Wochen unterbesetzt.\n\nMit freundlichen Grüßen\nM. Kolb',
  },
  {
    id: 'm3',
    initials: 'JW',
    from: 'Jonas Weiß',
    address: 'jonas@weiss-manufaktur.de',
    time: 'Yesterday',
    subject: 'Anfrage über das Kontaktformular',
    preview: 'Wir verkaufen bisher nur über Instagram…',
    replyToday: false,
    body: 'Hallo,\n\nwir verkaufen bisher nur über Instagram und möchten einen richtigen Shop. Etwa 40 Produkte, Versand nur innerhalb Deutschlands.\n\nKönnen Sie so etwas umsetzen, und womit müssen wir ungefähr rechnen?\n\nViele Grüße\nJonas Weiß',
  },
  {
    id: 'm4',
    initials: 'PL',
    from: 'Praxis Dr. Lehmann',
    address: 'praxis@dr-lehmann-erfurt.de',
    time: '18.09.',
    subject: 'Bilder für den Relaunch',
    preview: 'Die Fotos kommen nächste Woche vom Fotografen…',
    replyToday: false,
    body: 'Sehr geehrter Herr Warda,\n\ndie Fotos kommen nächste Woche vom Fotografen. Sobald sie da sind, schicke ich sie Ihnen zu.\n\nDie Texte für „Über uns“ haben wir angepasst und hängen sie an.\n\nFreundliche Grüße\nS. Lehmann',
  },
]
