import type { BreakdownDef, MetricDef } from './analytics.metric'

/**
 * Every figure Analytics can report, defined once: its key, what it means in
 * plain English, its unit, what it covers and where it comes from.
 *
 * These definitions are the documentation the Dashboard shows beside each
 * number, and the tests pin them. Changing what a figure counts means
 * changing its description here in the same edit.
 */

export const SOURCES = {
  leads: 'backend2.leads',
  clients: 'backend2.clients',
  booking: 'backend2.booking',
  inbox: 'backend2.inbox',
  media: 'backend2.media',
  blog: 'backend2.blog',
  projects: 'backend2.projects',
  services: 'backend2.services',
  contact: 'backend2.contact',
  posthog: 'posthog',
  invoices: 'backend2.invoices',
  assistant: 'backend2.assistant',
} as const

const def = (input: MetricDef): MetricDef => input
const breakdown = (input: BreakdownDef): BreakdownDef => input

/* ------------------------------------------------------------------ website */

export const WEBSITE = {
  visitors: def({
    key: 'website.visitors',
    label: 'Website visitors',
    description:
      'Distinct people PostHog counted on public pages in the period. Approximate: one person on two devices can count twice. Not the same as pageviews.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.posthog,
  }),
  pageviews: def({
    key: 'website.pageviews',
    label: 'Pageviews',
    description: 'Public pages opened in the period, counted by PostHog. One visitor can open many pages.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.posthog,
  }),
  topPages: breakdown({
    key: 'website.topPages',
    label: 'Most viewed pages',
    description: 'Public pages by pageviews in the period, counted by PostHog.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.posthog,
    ranking: 'website-pages',
  }),
  onlineBookings: def({
    key: 'website.onlineBookings',
    label: 'Bookings made on the website',
    description:
      'Appointments visitors booked themselves through the V2 booking form in the period. A completed booking, not a click on a booking button.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.booking,
    link: '/dashboard/calendar',
  }),
  contactSubmissions: def({
    key: 'website.contactSubmissions',
    label: 'Contact form messages',
    description: 'Messages sent through the public contact form in the period.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.contact,
  }),
  projectsLive: def({
    key: 'website.projectsLive',
    label: 'Projects on the website',
    description: 'Projects visitors can see right now: published and not archived.',
    unit: 'count',
    scope: 'current',
    source: SOURCES.projects,
    link: '/dashboard/projects',
  }),
  servicesLive: def({
    key: 'website.servicesLive',
    label: 'Services on the website',
    description: 'Services visitors can see right now.',
    unit: 'count',
    scope: 'current',
    source: SOURCES.services,
    link: '/dashboard/services',
  }),
} as const

/* -------------------------------------------------------------------- leads */

export const LEADS = {
  new: def({
    key: 'leads.new',
    label: 'New leads',
    description: 'Leads added in the period, by hand or by CSV import. Leads in Trash are not counted.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.leads,
    link: '/dashboard/leads',
  }),
  active: def({
    key: 'leads.active',
    label: 'Active leads',
    description: 'Leads in New, Contacted or one of your own active stages right now. Not Won, Lost or in Trash.',
    unit: 'count',
    scope: 'current',
    source: SOURCES.leads,
    link: '/dashboard/leads',
  }),
  won: def({
    key: 'leads.won',
    label: 'Won',
    description: 'Leads moved to Won in the period that are still Won now.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.leads,
    link: '/dashboard/leads?view=won',
  }),
  lost: def({
    key: 'leads.lost',
    label: 'Lost',
    description: 'Leads moved to Lost in the period that are still Lost now.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.leads,
    link: '/dashboard/leads?view=lost',
  }),
  wonRate: def({
    key: 'leads.wonRate',
    label: 'Won rate',
    description:
      'Won divided by all decided leads (Won + Lost) in the period. Leads still open are not in it, so it says nothing about how many leads are still undecided.',
    unit: 'ratio',
    scope: 'period',
    source: SOURCES.leads,
  }),
  followUpsDue: def({
    key: 'leads.followUpsDue',
    label: 'Follow-ups due',
    description: 'Open lead follow-ups whose time has come, right now. The same count as the badge beside Leads.',
    unit: 'count',
    scope: 'current',
    source: SOURCES.leads,
    link: '/dashboard/leads/follow-ups',
  }),
  followUpsNextWeek: def({
    key: 'leads.followUpsNextWeek',
    label: 'Follow-ups in the next 7 days',
    description: 'Open lead follow-ups due within the next seven days (not yet due).',
    unit: 'count',
    scope: 'next-7-days',
    source: SOURCES.leads,
    link: '/dashboard/leads/follow-ups',
  }),
  stages: breakdown({
    key: 'leads.stages',
    label: 'Leads by stage',
    description: 'Every lead not in Trash, by the stage it is in right now, in board order.',
    unit: 'count',
    scope: 'current',
    source: SOURCES.leads,
  }),
  sources: breakdown({
    key: 'leads.sources',
    label: 'Where new leads came from',
    description:
      'New leads in the period by the source you chose for them (for example WhatsApp or Google Maps). This is your own label, not website traffic.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.leads,
    ranking: 'lead-sources',
  }),
  lostReasons: breakdown({
    key: 'leads.lostReasons',
    label: 'Why leads were lost',
    description: 'Leads Lost in the period (and still Lost) by the reason you chose.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.leads,
    ranking: 'lead-lost-reasons',
  }),
} as const

export const LEADS_NOTES = [
  'Won and Lost count leads whose current stage is Won or Lost and who reached it in the period. Leads keep no history of stage changes, so a lead that was Won and later reopened is not counted, and there is no trend of stage changes over time.',
  'Leads in Trash are not counted anywhere.',
]

/* ------------------------------------------------------------------ clients */

export const CLIENTS = {
  new: def({
    key: 'clients.new',
    label: 'New clients',
    description: 'Clients added in the period, directly or by a Won lead. Clients in Trash are not counted.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.clients,
    link: '/dashboard/clients',
  }),
  fromLeads: def({
    key: 'clients.fromLeads',
    label: 'New clients from leads',
    description: 'New clients in the period that a Won lead created.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.clients,
  }),
  direct: def({
    key: 'clients.direct',
    label: 'New clients added directly',
    description: 'New clients in the period that you added yourself, not through a lead.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.clients,
  }),
  active: def({
    key: 'clients.active',
    label: 'Active clients',
    description: 'Clients marked Active right now, not in Trash.',
    unit: 'count',
    scope: 'current',
    source: SOURCES.clients,
    link: '/dashboard/clients',
  }),
  inactive: def({
    key: 'clients.inactive',
    label: 'Inactive clients',
    description: 'Clients marked Inactive right now, not in Trash.',
    unit: 'count',
    scope: 'current',
    source: SOURCES.clients,
  }),
  origin: breakdown({
    key: 'clients.origin',
    label: 'How new clients arrived',
    description: 'New clients in the period: created by a Won lead, or added directly.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.clients,
  }),
} as const

export const CLIENTS_NOTES = [
  'A client counts as from a lead only when a Won lead created it. Linking a lead to a client you already had does not change where that client came from.',
]

/* ------------------------------------------------------------------ booking */

export const BOOKING = {
  made: def({
    key: 'booking.made',
    label: 'Bookings made',
    description:
      'Appointments booked in the period, by visitors or by you, whatever happened to them later. A booking is not a meeting that took place.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.booking,
    link: '/dashboard/calendar',
  }),
  completed: def({
    key: 'booking.completed',
    label: 'Completed appointments',
    description: 'Appointments that took place in the period and that you marked Completed.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.booking,
  }),
  cancelled: def({
    key: 'booking.cancelled',
    label: 'Cancelled appointments',
    description: 'Appointments planned for the period that were cancelled, by the visitor or by you.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.booking,
  }),
  noShow: def({
    key: 'booking.noShow',
    label: 'No-shows',
    description: 'Appointments in the period that you marked as a no-show.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.booking,
  }),
  noShowRate: def({
    key: 'booking.noShowRate',
    label: 'No-show rate',
    description: 'No-shows divided by appointments you marked Completed or No-show in the period.',
    unit: 'ratio',
    scope: 'period',
    source: SOURCES.booking,
  }),
  upcoming: def({
    key: 'booking.upcoming',
    label: 'Appointments in the next 7 days',
    description: 'Confirmed appointments starting within the next seven days.',
    unit: 'count',
    scope: 'next-7-days',
    source: SOURCES.booking,
    link: '/dashboard/calendar',
  }),
  status: breakdown({
    key: 'booking.status',
    label: 'Appointments by status',
    description:
      'Appointments planned for the period, by their status now. Confirmed ones in the past have not been marked Completed or No-show yet.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.booking,
  }),
  methods: breakdown({
    key: 'booking.methods',
    label: 'How appointments meet',
    description: 'Appointments in the period that were not cancelled, by video call, in person or phone.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.booking,
  }),
} as const

export const BOOKING_NOTES = [
  'Booking has no test mode, so there is no test data to leave out.',
  'Completed and no-show appointments are the ones you marked; nothing marks them automatically.',
]

/* -------------------------------------------------------------------- inbox */

export const INBOX = {
  unread: def({
    key: 'inbox.unread',
    label: 'Unread conversations',
    description: 'Unread conversations in the Inbox folder right now (not Archived, not Trash). The same count as the badge beside Inbox.',
    unit: 'count',
    scope: 'current',
    source: SOURCES.inbox,
    link: '/dashboard/inbox',
  }),
  new: def({
    key: 'inbox.new',
    label: 'New conversations',
    description: 'Conversations someone else started in the period: an email, a contact form message or a booking. Ones you started are not counted.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.inbox,
    link: '/dashboard/inbox',
  }),
  origins: breakdown({
    key: 'inbox.origins',
    label: 'How conversations started',
    description: 'Every conversation started in the period, by how it began.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.inbox,
  }),
} as const

export const INBOX_NOTES = [
  'There is no response-time figure: the Inbox does not record which message a reply answered.',
  'Conversations deleted forever are not counted.',
]

/* -------------------------------------------------------------------- media */

export const MEDIA = {
  files: def({
    key: 'media.files',
    label: 'Files in Media',
    description: 'Every file in the Media library right now.',
    unit: 'count',
    scope: 'current',
    source: SOURCES.media,
    link: '/dashboard/media',
  }),
  bytes: def({
    key: 'media.bytes',
    label: 'Storage used',
    description: 'The total size of every file in the Media library right now.',
    unit: 'bytes',
    scope: 'current',
    source: SOURCES.media,
  }),
  added: def({
    key: 'media.added',
    label: 'Files added',
    description: 'Files uploaded to Media in the period that are still there.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.media,
  }),
  public: def({
    key: 'media.public',
    label: 'Files visitors can open',
    description: 'Files a published project, service or article uses right now, so a visitor can reach them.',
    unit: 'count',
    scope: 'current',
    source: SOURCES.media,
  }),
  kinds: breakdown({
    key: 'media.kinds',
    label: 'Files by type',
    description: 'Files in Media right now, by images, videos and documents.',
    unit: 'count',
    scope: 'current',
    source: SOURCES.media,
  }),
  kindBytes: breakdown({
    key: 'media.kindBytes',
    label: 'Storage by type',
    description: 'Storage used right now, by images, videos and documents.',
    unit: 'bytes',
    scope: 'current',
    source: SOURCES.media,
  }),
} as const

/* --------------------------------------------------------------------- blog */

export const BLOG = {
  live: def({
    key: 'blog.live',
    label: 'Articles on the website',
    description: 'Articles visitors can read right now.',
    unit: 'count',
    scope: 'current',
    source: SOURCES.blog,
    link: '/dashboard/blog',
  }),
  firstPublished: def({
    key: 'blog.firstPublished',
    label: 'Articles published',
    description: 'Articles published for the first time in the period. Updates to older articles are not counted.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.blog,
  }),
  comments: def({
    key: 'blog.comments',
    label: 'Visitor comments',
    description: 'Comments visitors wrote in the period, replies included. Your own replies are not counted.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.blog,
    link: '/dashboard/blog/comments',
  }),
  unseenComments: def({
    key: 'blog.unseenComments',
    label: 'New comments',
    description: 'Comments you have not seen yet in the Dashboard, right now. The same count as the badge beside Blog.',
    unit: 'count',
    scope: 'current',
    source: SOURCES.blog,
    link: '/dashboard/blog/comments?status=new',
  }),
  reads: def({
    key: 'blog.reads',
    label: 'Article reads (all time)',
    description:
      'The running total of reads across current articles. A browser counts one read per article; it is not a number of people and not the same as pageviews.',
    unit: 'count',
    scope: 'all-time',
    source: SOURCES.blog,
  }),
  likes: def({
    key: 'blog.likes',
    label: 'Article likes (all time)',
    description: 'The running total of likes across current articles. Not a number of people.',
    unit: 'count',
    scope: 'all-time',
    source: SOURCES.blog,
  }),
} as const

export const BLOG_NOTES = [
  'Reads and likes are running totals kept per article without dates, so they cannot be shown for a period or compared with one.',
]

/* -------------------------------------------------------------------- money */

export const MONEY = {
  received: def({
    key: 'money.received',
    label: 'Money received',
    description:
      'Payments actually received in the period, minus refunds recorded in the period. Each currency separately; never forecast revenue, and not tax or profit accounting.',
    unit: 'money',
    scope: 'period',
    source: SOURCES.invoices,
    link: '/dashboard/invoices',
  }),
  refunds: def({
    key: 'money.refunds',
    label: 'Refunds',
    description: 'Refunds recorded in the period, each currency separately.',
    unit: 'money',
    scope: 'period',
    source: SOURCES.invoices,
  }),
  overdue: def({
    key: 'invoices.overdue',
    label: 'Overdue invoices',
    description: 'Issued invoices past their due date and not fully paid, right now. Drafts are never counted.',
    unit: 'count',
    scope: 'current',
    source: SOURCES.invoices,
    link: '/dashboard/invoices',
  }),
  outstanding: def({
    key: 'invoices.outstanding',
    label: 'Unpaid invoices',
    description: 'Issued invoices not fully paid right now, overdue ones included. Money not yet received.',
    unit: 'count',
    scope: 'current',
    source: SOURCES.invoices,
  }),
  status: breakdown({
    key: 'invoices.status',
    label: 'Invoices by status',
    description: 'Issued invoices by their status right now. Drafts and test documents are left out.',
    unit: 'count',
    scope: 'current',
    source: SOURCES.invoices,
  }),
} as const

/* ---------------------------------------------------------------- assistant */

export const ASSISTANT = {
  conversations: def({
    key: 'assistant.conversations',
    label: 'Assistant conversations',
    description: 'Conversations visitors started with the public AI assistant in the period.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.assistant,
  }),
  unanswered: def({
    key: 'assistant.unanswered',
    label: 'Unanswered questions',
    description: 'Questions the assistant recorded that it could not answer, in the period.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.assistant,
  }),
  referrals: def({
    key: 'assistant.referrals',
    label: 'Sent to contact or booking',
    description: 'Clicks from an assistant answer to the contact or booking page in the period. Interest, not a booking.',
    unit: 'count',
    scope: 'period',
    source: SOURCES.assistant,
  }),
  cost: def({
    key: 'assistant.cost',
    label: 'Assistant cost',
    description: 'What the AI provider actually charged in the period, each currency separately.',
    unit: 'money',
    scope: 'period',
    source: SOURCES.assistant,
  }),
} as const

export const NOT_BUILT = {
  money: 'Invoices are not built yet, so there is no money figure. This is not zero.',
  assistant: 'The public AI assistant is not built yet. This is not zero.',
  contact: 'The public contact form does not send to Backend2 yet. This is not zero.',
  assistantOutcome: 'The assistant does not record this, so it cannot be shown.',
} as const
