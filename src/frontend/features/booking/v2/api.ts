import type {
  BookingLanguage,
  BookingMethod,
  CancelReason,
  PublicBookingType,
  SlotsResult,
  VideoAccess,
  VideoPreflight,
  VisitorAppointment,
} from '#/backend2/contracts/booking.contract'
import { ApiRequestError } from '#/frontend/api/response'

/**
 * The visitor's side of Backend2 Booking (`/api/v2/public/booking/*`).
 *
 * Plain `fetch`, like every V2 client. Refusals keep their `code` —
 * `SLOT_UNAVAILABLE`, `CHANGE_DEADLINE_PASSED`, `BOOKING_LINK_INVALID`,
 * `PROVIDER_UNAVAILABLE` — because each one needs its own sentence. Only types
 * come from the contract, so its validation schemas stay out of the page.
 *
 * The private credential travels in a header, never in the address: the
 * address reaches logs and `Referer`, a header does not.
 */

const BASE = '/api/v2/public/booking'

/** Mirrors `MANAGE_TOKEN_HEADER` in the contract; a test keeps them equal. */
export const BOOKING_TOKEN_HEADER = 'x-booking-token'

type Envelope = { success?: boolean; message?: string; code?: string; data?: unknown; details?: unknown }

const request = async <TData>(path: string, init: RequestInit & { token?: string } = {}): Promise<TData> => {
  const { token, ...rest } = init
  const headers = new Headers(rest.headers)

  headers.set('accept', 'application/json')
  if (rest.body !== undefined) headers.set('content-type', 'application/json')
  if (token !== undefined) headers.set(BOOKING_TOKEN_HEADER, token)

  let response: Response

  try {
    response = await fetch(`${BASE}${path}`, { credentials: 'same-origin', ...rest, headers })
  } catch {
    throw new ApiRequestError({ message: 'The server could not be reached', code: 'NETWORK', status: 0 })
  }

  const body = (await response.json().catch(() => null)) as Envelope | null

  if (!response.ok || !body?.success) {
    throw new ApiRequestError({
      message: body?.message ?? 'The server did not answer',
      code: body?.code ?? null,
      status: response.status,
      details: body?.details,
    })
  }

  return body.data as TData
}

const post = <TData>(path: string, body: unknown, token?: string) =>
  request<TData>(path, { method: 'POST', body: JSON.stringify(body ?? {}), token })

export const fetchTypes = (language: BookingLanguage) =>
  request<PublicBookingType[]>(`/types?language=${language}`)

export const fetchSlots = (input: {
  slug: string
  method: BookingMethod
  from: string
  days: number
  timeZone: string
  language: BookingLanguage
}) => {
  const search = new URLSearchParams({
    method: input.method,
    from: input.from,
    days: String(input.days),
    timeZone: input.timeZone,
    language: input.language,
  })

  return request<SlotsResult>(`/types/${encodeURIComponent(input.slug)}/slots?${search}`)
}

export type BookingRequest = {
  submissionId: string
  typeSlug: string
  method: BookingMethod
  startsAt: string
  timeZone: string
  language: BookingLanguage
  name: string
  email: string
  phone: string
  company: string
  subject: string | null
  budget: string | null
  note: string
  turnstileToken: string
  website: string
}

export type BookingReceipt = {
  appointment: VisitorAppointment
  manageUrl: string
  roomUrl: string | null
  confirmationSent: boolean
}

export const createBooking = (input: BookingRequest) => post<BookingReceipt>('/appointments', input)

export const fetchAppointment = (reference: string, token: string) =>
  request<VisitorAppointment>(`/appointments/${encodeURIComponent(reference)}`, { token })

export const rescheduleAppointment = (reference: string, token: string, input: { startsAt: string; timeZone: string }) =>
  post<VisitorAppointment>(`/appointments/${encodeURIComponent(reference)}/reschedule`, input, token)

export const cancelAppointment = (reference: string, token: string, input: { reason: CancelReason; text: string }) =>
  post<VisitorAppointment>(`/appointments/${encodeURIComponent(reference)}/cancel`, input, token)

export const videoPreflight = (reference: string, token: string) =>
  post<VideoPreflight>(`/appointments/${encodeURIComponent(reference)}/video/preflight`, {}, token)

export const videoJoin = (reference: string, token: string) =>
  post<VideoAccess>(`/appointments/${encodeURIComponent(reference)}/video/join`, {}, token)

/** The error code a refusal carried, or null for anything else. */
export const errorCode = (error: unknown): string | null =>
  error instanceof ApiRequestError ? error.code : null

/** The private credential from the address fragment, where Backend2's links carry it bare (`#<credential>`). */
export const readFragmentToken = (hash: string): string => {
  const raw = hash.replace(/^#/u, '')

  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
