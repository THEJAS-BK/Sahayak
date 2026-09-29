import { Router } from 'express'
import { z } from 'zod'
import { errors } from '../../lib/errors.js'
import { asyncHandler, ok } from '../../lib/http.js'
import { pool } from '../../database/pool.js'
import { authenticate, requireActive, requireRole } from '../../middleware/auth.js'
import { withTransaction } from '../../database/pool.js'
import { notifyPoliceAssignment } from '../notifications/request.js'
import { assignRequestToVolunteer, listPoliceRequests } from './requests.service.js'

const router = Router()

const listQuerySchema = z.object({
  status: z
    .enum(['PENDING', 'MATCHING', 'DISPATCHED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'UNASSIGNED'])
    .optional(),
  priority: z.enum(['normal', 'urgent']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().min(1).optional(),
})

const assignSchema = z.object({
  volunteer_id: z.string().uuid(),
})

/** P-01 */
router.get(
  '/',
  authenticate,
  requireRole('police'),
  requireActive,
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) throw errors.badRequest('Invalid query parameters')
    const result = await listPoliceRequests(pool, parsed.data)
    ok(res, result)
  }),
)

/** P-03: hand a request to one named volunteer. */
router.patch(
  '/:id/assign',
  authenticate,
  requireRole('police'),
  requireActive,
  asyncHandler(async (req, res) => {
    const parsed = assignSchema.safeParse(req.body)
    if (!parsed.success) throw errors.badRequest('volunteer_id must be a UUID')

    const requestId = String(req.params.id)
    const { notify, ...body } = await withTransaction((db) =>
      assignRequestToVolunteer(db, req.user as { id: string }, requestId, parsed.data.volunteer_id),
    )
    ok(res, body)

    void notifyPoliceAssignment(notify.volunteer, notify.senior, {
      id: body.request_id,
      category: body.category,
    })
  }),
)

export default router