import { Router } from 'express'
import { z } from 'zod'
import { errors } from '../../lib/errors.js'
import { asyncHandler, ok } from '../../lib/http.js'
import { pool } from '../../database/pool.js'
import { authenticate, requireActive, requireRole } from '../../middleware/auth.js'
import { listAuditLogs } from './audit.service.js'

const router = Router()

const listSchema = z.object({
  entity_type: z.string().min(1).optional(),
  entity_id: z.uuid().optional(),
  actor_id: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().min(1).optional(),
})

/** P-02 */
router.get(
  '/',
  authenticate,
  requireRole('police'),
  requireActive,
  asyncHandler(async (req, res) => {
    const parsed = listSchema.safeParse(req.query)
    if (!parsed.success) throw errors.badRequest('Invalid query parameters')

    const { actor_id, ...rest } = parsed.data
    const filter = { ...rest, actor_id: actor_id === undefined ? undefined : (actor_id !== 'null' ? actor_id : null) }
    const result = await listAuditLogs(pool, filter)
    ok(res, result)
  }),
)

export default router