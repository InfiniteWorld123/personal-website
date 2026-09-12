import { Elysia } from 'elysia'
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
