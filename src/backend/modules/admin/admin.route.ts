import { Elysia } from 'elysia'
import { adminBookingRoutes } from '#/backend/modules/bookings/booking.route'
import { adminContentRoutes } from '#/backend/modules/content/content.route'
import { adminInboxRoutes } from '#/backend/modules/inbox/inbox.route'
import { adminInvoiceRoutes } from '#/backend/modules/invoices/invoice.route'
import { adminLeadRoutes } from '#/backend/modules/leads/lead.route'
import { adminPostRoutes } from '#/backend/modules/posts/post.route'
import { adminProjectRoutes } from '#/backend/modules/projects/project.route'
import { responseOk } from '#/backend/shared/response'
import { adminGuard } from './admin.guard'

/**
 * Every route mounted here is behind the admin guard. Feature modules are
 * added to this group in later blocks.
 */
export const adminRoutes = new Elysia({ prefix: '/admin' })
  .use(adminGuard)
  .use(adminProjectRoutes)
  .use(adminPostRoutes)
  .use(adminBookingRoutes)
  .use(adminContentRoutes)
  .use(adminInboxRoutes)
  .use(adminLeadRoutes)
  .use(adminInvoiceRoutes)
  .get('/me', ({ adminUser }) =>
    responseOk({
      data: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
      },
      message: 'Admin session active',
    }),
  )
