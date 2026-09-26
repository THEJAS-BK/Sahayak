import { Router } from 'express'
import { z } from 'zod'
import { errors } from '../../lib/errors.js'
import { asyncHandler, ok } from '../../lib/http.js'
import { pool } from '../../database/pool.js'
import { authenticate, requireActive, requireRole } from '../../middleware/auth.js'
import { listAssignableVolunteers } from './volunteers.service.js'

const router = Router()

const listQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  available: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  search: z.string().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

/** P-02: volunteers available for a manual police assignment. */
router.get(
  '/',
  authenticate,
  requireRole('police'),
  requireActive,
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) throw errors.badRequest('Invalid volunteer query')
    // Query params are lat/lng for consistency with Q-04; the service speaks
    // latitude/longitude.
    const { lat, lng, ...rest } = parsed.data
    const result = await listAssignableVolunteers(pool, { ...rest, latitude: lat, longitude: lng })
    ok(res, result)
  }),
)

export default router
