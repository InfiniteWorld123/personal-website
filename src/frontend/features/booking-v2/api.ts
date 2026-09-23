import type {
  AppointmentDetail,
  AppointmentSummary,
  Availability,
  BookingLanguage,
  BookingMethod,
  BookingSettings,
  BookingType,
  TypeTexts,
  VideoAccess,
} from '#/backend2/contracts/booking.contract'
import type { Page } from '#/backend2/contracts/pagination.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { csrfToken } from '#/frontend/features/auth-v2/api'

/**
 * The Dashboard's side of the Backend2 Calendar. Plain `fetch`, like every V2
 * client; refusals keep their `code` — `SLOT_UNAVAILABLE`, `TYPE_IN_USE`,
 * `VIDEO_NOT_OPEN` — so the screens can say what happened.
 */

const OWNER = '/api/v2/owner/calendar'

type Envelope = { success: boolean; message?: string; code?: string; data?: unknown; details?: unknown }

const request = async <TData>(path: string, init: RequestInit = {}): Promise<TData> => {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)

  if (init.body !== undefined) headers.set('content-type', 'application/json')

  if (method !== 'GET' && method !== 'HEAD') {
    const token = csrfToken()

    if (token) headers.set('x-v2-csrf', token)
  }

  const response = await fetch(path, { credentials: 'same-origin', ...init, headers })
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

const send = <TData>(method: string, path: string, body?: unknown) =>
  request<TData>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

const toSearch = (values: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === '') continue

    search.set(key, String(value))
  }

  const text = search.toString()

  return text === '' ? '' : `?${text}`
}

export type AppointmentQuery = {
  from?: string
  to?: string
  status?: string
  typeId?: string
  method?: string
  q?: string
  page?: number
  pageSize?: number
}

export const listAppointments = (query: AppointmentQuery) =>
  request<Page<AppointmentSummary>>(`${OWNER}/appointments${toSearch(query)}`)

export const readAppointment = (id: string) => request<AppointmentDetail>(`${OWNER}/appointments/${id}`)

export type ManualInput = {
  typeId: string
  method: BookingMethod
  startsAt: string
  language: BookingLanguage
  visitorTimeZone: string
  name: string
  email: string
  phone: string
  company: string
  subject: string | null
  budget: string | null
  note: string
  sendInvitation: boolean
}

export const createAppointment = (input: ManualInput) =>
  send<AppointmentDetail & { invitation: 'accepted' | 'failed' | 'not_sent' }>('POST', `${OWNER}/appointments`, input)

export const patchAppointment = (
  id: string,
  input: { revision: number; startsAt?: string; name?: string; email?: string; phone?: string; company?: string; note?: string; notify: boolean },
) => send<AppointmentDetail>('PATCH', `${OWNER}/appointments/${id}`, input)

export const sendInvitation = (id: string) =>
  send<{ alreadySent: boolean; delivery: 'accepted' | 'failed' | 'not_sent' }>('POST', `${OWNER}/appointments/${id}/send-invitation`)

export const cancelAppointment = (id: string, input: { reason: string; notify: boolean }) =>
  send<AppointmentDetail>('POST', `${OWNER}/appointments/${id}/cancel`, input)

export const setOutcome = (id: string, status: 'completed' | 'no_show') =>
  send<AppointmentDetail>('POST', `${OWNER}/appointments/${id}/status`, { status })

export const joinVideo = (id: string) => send<VideoAccess>('POST', `${OWNER}/appointments/${id}/video/join`)

export const endVideo = (id: string) => send<{ endedAt: string }>('POST', `${OWNER}/appointments/${id}/video/end`)

export const listTypes = (page: number, pageSize = 25) => request<Page<BookingType>>(`${OWNER}/types${toSearch({ page, pageSize })}`)

export type TypeInput = {
  slug: string
  enabled: boolean
  durationMinutes: number
  bufferMinutes: number
  slotStepMinutes: number
  methods: BookingMethod[]
  texts: TypeTexts
}

export const createType = (input: TypeInput) => send<BookingType>('POST', `${OWNER}/types`, input)

export const patchType = (id: string, input: Partial<TypeInput>) => send<BookingType>('PATCH', `${OWNER}/types/${id}`, input)

export const deleteType = (id: string) => send<{ deleted: true }>('DELETE', `${OWNER}/types/${id}`)

export const readSettings = () => request<BookingSettings>(`${OWNER}/settings`)

export const saveSettings = (input: Omit<BookingSettings, 'timeZone'>) => send<BookingSettings>('PUT', `${OWNER}/settings`, input)

export const readAvailability = () => request<Availability>(`${OWNER}/availability`)

export const saveAvailability = (input: Availability) => send<Availability>('PUT', `${OWNER}/availability`, input)
