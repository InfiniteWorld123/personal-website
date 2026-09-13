import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  cancelBooking,
  cancelBookingAsAdmin,
  createAvailabilityException,
  createBooking,
  createBookingAsAdmin,
  createBookingType,
  deleteAvailabilityException,
  deleteBookingType,
  fetchAdminBooking,
  fetchAdminBookingType,
  fetchAdminBookingTypes,
  fetchAdminBookings,
  fetchAvailability,
  fetchBooking,
  fetchBookingTypes,
  fetchSlots,
  rescheduleBooking,
  saveAvailabilityRules,
  setBookingStatus,
  updateBookingType,
} from '#/frontend/api/booking.api'
import type { Language } from '#/frontend/i18n/language'
import type {
  BookingFilterInput,
  BookingTypeWriteInput,
  SlotQueryInput,
} from '#/shared/validation/booking.validation'

/* -------------------------------------------------------------------------- */
/* Public                                                                     */
/* -------------------------------------------------------------------------- */

export const bookingTypesQuery = (language: Language) =>
  queryOptions({
    queryKey: ['booking', 'types', language],
    queryFn: () => fetchBookingTypes(language),
  })

export const slotsQuery = (slug: string, language: Language, query: SlotQueryInput) =>
  queryOptions({
    queryKey: ['booking', 'slots', slug, language, query.from, query.to, query.timezone],
    queryFn: () => fetchSlots(slug, language, query),
    /**
     * Somebody else can take a time while this calendar is on screen. Short
     * enough that a stale slot is rare; the submit path re-checks anyway, so a
     * stale one costs a message rather than a double booking.
     */
    staleTime: 30_000,
  })

export const bookingQuery = (reference: string, token: string) =>
  queryOptions({
    queryKey: ['booking', 'booking', reference],
    queryFn: () => fetchBooking(reference, token),
    enabled: token.length > 0,
    retry: false,
  })

export const useCreateBooking = () => useMutation({ mutationFn: createBooking })

export const useCancelBooking = (reference: string, token: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Parameters<typeof cancelBooking>[2]) => cancelBooking(reference, token, input),
    onSuccess: (booking) => {
      // Cancellation revokes the management token on the server. Keep this
      // page in its confirmed local state instead of immediately refetching a
      // link that is intentionally no longer valid.
      queryClient.setQueryData(bookingQuery(reference, token).queryKey, booking)
      return queryClient.invalidateQueries({ queryKey: ['booking', 'slots'] })
    },
  })
}

export const useRescheduleBooking = (reference: string, token: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Parameters<typeof rescheduleBooking>[2]) =>
      rescheduleBooking(reference, token, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['booking', 'slots'] }),
  })
}

/* -------------------------------------------------------------------------- */
/* Admin                                                                      */
/* -------------------------------------------------------------------------- */

export const adminBookingTypesQuery = () =>
  queryOptions({ queryKey: ['admin', 'booking', 'types'], queryFn: fetchAdminBookingTypes })

export const adminBookingTypeQuery = (id: string) =>
  queryOptions({
    queryKey: ['admin', 'booking', 'types', id],
    queryFn: () => fetchAdminBookingType(id),
  })

export const availabilityQuery = () =>
  queryOptions({ queryKey: ['admin', 'booking', 'availability'], queryFn: fetchAvailability })

export const adminBookingsQuery = (filter: BookingFilterInput) =>
  queryOptions({
    queryKey: ['admin', 'booking', 'bookings', filter],
    queryFn: () => fetchAdminBookings(filter),
  })

export const adminBookingQuery = (id: string) =>
  queryOptions({
    queryKey: ['admin', 'booking', 'bookings', 'detail', id],
    queryFn: () => fetchAdminBooking(id),
  })

/** Everything under the admin booking tree, after any write. */
const invalidateAdminBooking = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.invalidateQueries({ queryKey: ['admin', 'booking'] })

export const useCreateBookingType = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: BookingTypeWriteInput) => createBookingType(input),
    onSuccess: () => invalidateAdminBooking(queryClient),
  })
}

export const useUpdateBookingType = (id: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: BookingTypeWriteInput) => updateBookingType(id, input),
    onSuccess: () => invalidateAdminBooking(queryClient),
  })
}

export const useDeleteBookingType = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteBookingType(id),
    onSuccess: () => invalidateAdminBooking(queryClient),
  })
}

export const useSaveAvailabilityRules = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: saveAvailabilityRules,
    onSuccess: () => invalidateAdminBooking(queryClient),
  })
}

export const useCreateAvailabilityException = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createAvailabilityException,
    onSuccess: () => invalidateAdminBooking(queryClient),
  })
}

export const useDeleteAvailabilityException = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteAvailabilityException(id),
    onSuccess: () => invalidateAdminBooking(queryClient),
  })
}

/** Placing a call from the admin. The client is emailed exactly as always. */
export const useCreateBookingAsAdmin = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createBookingAsAdmin,
    onSuccess: () => invalidateAdminBooking(queryClient),
  })
}

export const useCancelBookingAsAdmin = (id: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Parameters<typeof cancelBookingAsAdmin>[1]) =>
      cancelBookingAsAdmin(id, input),
    onSuccess: () => invalidateAdminBooking(queryClient),
  })
}

export const useSetBookingStatus = (id: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Parameters<typeof setBookingStatus>[1]) => setBookingStatus(id, input),
    onSuccess: () => invalidateAdminBooking(queryClient),
  })
}
