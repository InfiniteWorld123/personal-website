import { lazyPage } from '#/frontend/features/booking/v2/lazy-page'

/** The Backend2 Contact form, downloaded only when the contact switch is on. */
export const contactFormV2 = lazyPage(() => import('./ContactFormV2').then((module) => module.ContactFormV2))
