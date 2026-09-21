import type { Tone } from './sample-data'

/**
 * The sections that exist in the navigation but not yet on paper.
 *
 * Projects, Calendar, Leads, Content, Blog and Settings have no approved
 * specification, so they get one shared screen: a real header, a real toolbar,
 * and rows that look like the thing they will eventually hold. Every one of
 * them wears the `Not specified yet` badge.
 *
 * That badge is the point. It would be easy to make these look finished and
 * invent a workflow to fill them, and then argue with the invention later.
 * These say plainly what they are: a shape waiting for its rules.
 */
export type ModulePreviewRow = {
  id: string
  initials: string
  title: string
  detail: string
  status: string
  tone: Tone
}

export type ModulePreview = {
  eyebrow: string
  title: string
  description: string
  /** What the primary button would say once the module exists. */
  action: string
  searchPlaceholder: string
  /** The single sentence that says what is still undecided, in his words. */
  open: string
  rows: ModulePreviewRow[]
}

export const modulePreviews = {
  projects: {
    eyebrow: 'PROJECTS',
    title: 'Projects',
    description:
      'Portfolio projects, and whether each one is visible on the public website.',
    action: 'New project',
    searchPlaceholder: 'Search projects',
    open: 'How a project is created and edited, and what a project actually holds, is not designed yet.',
    rows: [
      { id: 'p1', initials: 'PE', title: 'Prime Estate', detail: 'Real-estate management system', status: 'Public', tone: 'blue' },
      { id: 'p2', initials: 'TS', title: 'Tech Store', detail: 'Online store with accounts and payments', status: 'Public', tone: 'blue' },
      { id: 'p3', initials: 'IN', title: 'InkNest', detail: 'Blogging platform', status: 'Public', tone: 'blue' },
      { id: 'p4', initials: 'KB', title: 'Klinik Berger', detail: 'Practice site, waiting on photos', status: 'Hidden', tone: 'grey' },
      { id: 'p5', initials: 'MH', title: 'Meridian Handel', detail: 'Wholesale catalogue', status: 'Draft', tone: 'grey' },
    ],
  },

  calendar: {
    eyebrow: 'CALENDAR',
    title: 'Calendar',
    description: 'Bookings, the hours you offer, and the video calls attached to them.',
    action: 'New booking',
    searchPlaceholder: 'Search bookings',
    open: 'Booking rules are not designed yet, and where video calls sit in the navigation is still open.',
    rows: [
      { id: 'c1', initials: 'MH', title: 'Kickoff — Meridian Handel', detail: 'Today, 14:00 – 14:30 · video call', status: 'Confirmed', tone: 'blue' },
      { id: 'c2', initials: 'LB', title: 'Workshop planning — Lena Brandt', detail: '22.09.2026, 10:00 – 11:00', status: 'Confirmed', tone: 'blue' },
      { id: 'c3', initials: 'JW', title: 'First call — Jonas Weiß', detail: '23.09.2026, 16:30 – 17:00', status: 'Pending', tone: 'grey' },
      { id: 'c4', initials: 'KS', title: 'Handover — Kolb & Sohn', detail: '25.09.2026, 09:00 – 09:45', status: 'Confirmed', tone: 'blue' },
      { id: 'c5', initials: 'PL', title: 'Praxis Dr. Lehmann', detail: '29.09.2026, 13:00 – 13:30', status: 'Rescheduled', tone: 'grey' },
    ],
  },

  leads: {
    eyebrow: 'LEADS',
    title: 'Leads',
    description: 'Everyone worth selling to, and what is open with them.',
    action: 'Add lead',
    searchPlaceholder: 'Search leads',
    open: 'The pipeline stages, and what happens when a lead moves between them, are not agreed yet.',
    rows: [
      { id: 'l1', initials: 'LB', title: 'Lena Brandt', detail: 'Workshop for 8 people, October', status: 'Quoted', tone: 'blue' },
      { id: 'l2', initials: 'KS', title: 'Kolb & Sohn', detail: 'Wartungsvertrag, 12 Monate', status: 'Won', tone: 'ink' },
      { id: 'l3', initials: 'JW', title: 'Jonas Weiß', detail: 'Onlineshop, rund 40 Produkte', status: 'New', tone: 'blue' },
      { id: 'l4', initials: 'PL', title: 'Praxis Dr. Lehmann', detail: 'Relaunch, wartet auf Inhalte', status: 'Waiting', tone: 'outline' },
      { id: 'l5', initials: 'AS', title: 'Atelier Sommer', detail: 'Kleine Seite, kein Budget genannt', status: 'Cold', tone: 'grey' },
    ],
  },

  content: {
    eyebrow: 'CONTENT',
    title: 'Content',
    description: 'The text and images on the public website.',
    action: 'Edit page',
    searchPlaceholder: 'Search pages',
    open: 'Exactly which parts of the public site are editable here is not decided yet.',
    rows: [
      { id: 'n1', initials: 'HO', title: 'Home', detail: 'Hero, services, work, FAQ · three languages', status: 'Live', tone: 'blue' },
      { id: 'n2', initials: 'SE', title: 'Services', detail: 'Six offers and their prices', status: 'Live', tone: 'blue' },
      { id: 'n3', initials: 'AB', title: 'About', detail: 'Story, stack, portrait', status: 'Live', tone: 'blue' },
      { id: 'n4', initials: 'FA', title: 'FAQ', detail: '14 questions · Arabic missing', status: 'Partial', tone: 'grey' },
      { id: 'n5', initials: 'LE', title: 'Legal', detail: 'Impressum and Datenschutz', status: 'Live', tone: 'blue' },
    ],
  },

  blog: {
    eyebrow: 'BLOG',
    title: 'Blog',
    description: 'Articles for the public website.',
    action: 'New article',
    searchPlaceholder: 'Search articles',
    open: 'The editor, the languages, the media handling and the publishing rules are all still open.',
    rows: [
      { id: 'b1', initials: 'W1', title: 'Warum ein Onlineshop mehr ist als ein Katalog', detail: 'Published 14.09.2026 · DE, EN', status: 'Published', tone: 'blue' },
      { id: 'b2', initials: 'W2', title: 'Was eine Website wirklich kostet', detail: 'Published 02.09.2026 · DE', status: 'Published', tone: 'blue' },
      { id: 'b3', initials: 'W3', title: 'Booking flows that people finish', detail: 'Draft · last edited 19.09.2026', status: 'Draft', tone: 'grey' },
      { id: 'b4', initials: 'W4', title: 'Vom Prototyp zum Produkt', detail: 'Draft · no translation yet', status: 'Draft', tone: 'grey' },
      { id: 'b5', initials: 'W5', title: 'Barrierefreiheit ohne Aufpreis', detail: 'Scheduled for 24.09.2026', status: 'Scheduled', tone: 'outline' },
    ],
  },

  settings: {
    eyebrow: 'SETTINGS',
    title: 'Settings',
    description: 'Account, mailbox, invoicing details and the public site.',
    action: 'Save changes',
    searchPlaceholder: 'Search settings',
    open: 'None of these are specified yet, and authentication in particular belongs to Backend2.',
    rows: [
      { id: 's1', initials: 'AC', title: 'Account', detail: 'Name, email, password, sessions', status: 'Open', tone: 'grey' },
      { id: 's2', initials: 'MB', title: 'Mailbox', detail: 'Sending address, signature, folders', status: 'Open', tone: 'grey' },
      { id: 's3', initials: 'IN', title: 'Invoicing', detail: 'Company details, tax, numbering, payment terms', status: 'Open', tone: 'grey' },
      { id: 's4', initials: 'BO', title: 'Booking', detail: 'Working hours, call types, buffers', status: 'Open', tone: 'grey' },
      { id: 's5', initials: 'SI', title: 'Public site', detail: 'Domain, languages, deploys', status: 'Open', tone: 'grey' },
    ],
  },
} as const satisfies Record<string, ModulePreview>

export type ModuleKey = keyof typeof modulePreviews
