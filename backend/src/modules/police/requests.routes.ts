import { Router } from 'express'
import { z } from 'zod'
import { errors } from '../../lib/errors.js'
import { asyncHandler, ok } from '../../lib/http.js'
import { pool } from '../../database/pool.js'
import { authenticate, requireActive, requireRole } from '../../middleware/auth.js'
import { listPoliceRequests } from './requests.service.js'

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

export default router