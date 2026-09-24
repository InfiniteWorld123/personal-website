import { lazyPage } from '#/frontend/features/booking/v2/lazy-page'

/** The Backend2 Contact form, in its own chunk, fetched by the route's loader. */
export const contactFormV2 = lazyPage(() => import('./ContactFormV2').then((module) => module.ContactFormV2))
