import type { RichTextDoc } from '#/shared/validation/rich-text'
import type {
  InboxPreferences,
  InboxSignatures,
  LeadDirection,
  LeadLanguage,
  LeadSource,
  LeadStatus,
} from '#/shared/validation/lead.validation'

/**
 * What the admin list shows per row. Every instant crosses the wire as an ISO
 * string; the client formats it on the owner's clock.
 */
export type AdminLeadListItem = {
  id: string
  source: LeadSource
  name: string
  email: string
  company: string
  subject: string
  preview: string
  status: LeadStatus
  language: LeadLanguage
  budget: string
  timeline: string
  projectType: string
  isUnread: boolean
  isJunk: boolean
  isArchived: boolean
  hasAttachment: boolean
  /** A call this same person booked, folded onto their row (one person, one line). */
  bookingLabel: string | null
  replyCount: number
  createdAt: string
}

export type AdminLeadList = {
  items: AdminLeadListItem[]
  total: number
  page: number
  pageCount: number
  /** Unread in the open inbox, for the badge in the sidebar. */
  unread: number
}

export type AdminLeadMessage = {
  id: string
  direction: LeadDirection
  subject: string
  body: string
  /** The formatted letter, for replies written in the editor. */
  rich: RichTextDoc | null
  sentAt: string
}

export type AdminLeadNote = {
  id: string
  body: string
  createdAt: string
}

export type AdminLeadEvent = {
  id: string
  kind: string
  detail: string
  createdAt: string
}

export type AdminLeadDetail = AdminLeadListItem & {
  phone: string
  message: string
  attachmentName: string | null
  attachmentBytes: number | null
  notifiedAt: string | null
  readAt: string | null
  messages: AdminLeadMessage[]
  notes: AdminLeadNote[]
  events: AdminLeadEvent[]
  /** Every call this person booked, newest first. */
  bookings: Array<{ id: string; label: string; startsAt: string; status: string }>
}

export type InboxSettings = {
  preferences: InboxPreferences
  /** One sign-off per language, as stored. Empty means "use the default". */
  signatures: InboxSignatures
  /**
   * Whether replies can actually be sent from here, and whether an inbound
   * address is configured. The page says so plainly rather than offering a
   * button that quietly does nothing.
   */
  canSendMail: boolean
  canReceiveMail: boolean
}
