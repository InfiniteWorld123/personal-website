import { lazyPage } from '#/frontend/features/booking/v2/lazy-page'

/** The Backend2 booking pages, downloaded only when the booking switch is on. */
export const typesPageV2 = lazyPage(() => import('./BookingTypesPageV2').then((module) => module.BookingTypesPageV2))
export const flowPageV2 = lazyPage(() => import('./BookingFlowPageV2').then((module) => module.BookingFlowPageV2))
export const managePageV2 = lazyPage(() => import('./BookingManagePageV2').then((module) => module.BookingManagePageV2))
export const roomPageV2 = lazyPage(() => import('./BookingRoomPageV2').then((module) => module.BookingRoomPageV2))
