import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiRequestError } from '#/frontend/api/response'
import {
  type AppointmentQuery,
  type ManualInput,
  type TypeInput,
  cancelAppointment,
  createAppointment,
  createType,
  deleteType,
  endVideo,
  joinVideo,
  listAppointments,
  listTypes,
  patchAppointment,
  patchType,
  readAppointment,
  readAvailability,
  readSettings,
  saveAvailability,
  saveSettings,
  sendInvitation,
  setOutcome,
} from './api'

/**
 * What the Calendar reads, and what is re-read after each write. One prefix,
 * invalidated whole: moving an appointment changes the week, the list and
 * the detail at once.
 */
export const calendarKeys = {
  all: ['backend2', 'calendar'] as const,
  appointments: (query: AppointmentQuery) => [...calendarKeys.all, 'appointments', query] as const,
  appointment: (id: string) => [...calendarKeys.all, 'appointment', id] as const,
  types: (page: number, pageSize: number) => [...calendarKeys.all, 'types', page, pageSize] as const,
  settings: () => [...calendarKeys.all, 'settings'] as const,
  availability: () => [...calendarKeys.all, 'availability'] as const,
}

const retry = (attempt: number, error: unknown) =>
  !(error instanceof ApiRequestError && error.status < 500) && attempt < 2

export const useAppointments = (query: AppointmentQuery, enabled = true) =>
  useQuery({
    queryKey: calendarKeys.appointments(query),
    queryFn: () => listAppointments(query),
    placeholderData: (previous) => previous,
    enabled,
    retry,
  })

export const useAppointment = (id: string | null) =>
  useQuery({ queryKey: calendarKeys.appointment(id ?? ''), queryFn: () => readAppointment(id!), enabled: id !== null, retry })

export const useTypes = (page = 1, pageSize = 25) =>
  useQuery({ queryKey: calendarKeys.types(page, pageSize), queryFn: () => listTypes(page, pageSize), placeholderData: (previous) => previous, retry })

export const useBookingSettings = () => useQuery({ queryKey: calendarKeys.settings(), queryFn: readSettings, retry })

export const useAvailability = () => useQuery({ queryKey: calendarKeys.availability(), queryFn: readAvailability, retry })

const useCalendarMutation = <TInput, TResult>(fn: (input: TInput) => Promise<TResult>) => {
  const client = useQueryClient()

  return useMutation({
    mutationFn: fn,
    // An email may have gone into the Inbox too.
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: calendarKeys.all }),
        client.invalidateQueries({ queryKey: ['backend2', 'inbox'] }),
      ]),
  })
}

export const useCreateAppointment = () => useCalendarMutation((input: ManualInput) => createAppointment(input))
export const usePatchAppointment = () =>
  useCalendarMutation((input: { id: string } & Parameters<typeof patchAppointment>[1]) => {
    const { id, ...rest } = input

    return patchAppointment(id, rest)
  })
export const useSendInvitation = () => useCalendarMutation(sendInvitation)
export const useCancelAppointment = () =>
  useCalendarMutation((input: { id: string; reason: string; notify: boolean }) => cancelAppointment(input.id, input))
export const useSetOutcome = () =>
  useCalendarMutation((input: { id: string; status: 'completed' | 'no_show' }) => setOutcome(input.id, input.status))
export const useJoinVideo = () => useCalendarMutation(joinVideo)
export const useEndVideo = () => useCalendarMutation(endVideo)
export const useCreateType = () => useCalendarMutation((input: TypeInput) => createType(input))
export const usePatchType = () =>
  useCalendarMutation((input: { id: string } & Partial<TypeInput>) => {
    const { id, ...rest } = input

    return patchType(id, rest)
  })
export const useDeleteType = () => useCalendarMutation(deleteType)
export const useSaveSettings = () => useCalendarMutation(saveSettings)
export const useSaveAvailability = () => useCalendarMutation(saveAvailability)
