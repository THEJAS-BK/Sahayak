import { Router } from 'express'
import { z } from 'zod'
import { errors } from '../../lib/errors.js'
import { asyncHandler, ok } from '../../lib/http.js'
import { pool, withTransaction } from '../../database/pool.js'
import { authenticate, requireActive, requireRole } from '../../middleware/auth.js'
import { setVolunteerAvailability, updateVolunteerLocation } from './volunteers.service.js'

const router = Router()

const locationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
})

const availabilitySchema = z.object({
  is_available: z.boolean(),
})

/** L-01 */
router.patch(
  '/me/location',
  authenticate,
  requireRole('volunteer'),
  requireActive,
  asyncHandler(async (req, res) => {
    const parsed = locationSchema.safeParse(req.body)
    if (!parsed.success) throw errors.badRequest('Invalid coordinates')
    const result = await withTransaction((db) => updateVolunteerLocation(db, req.user!.id, parsed.data))
    ok(res, { location: result })
  }),
)

/** L-02 */
router.patch(
  '/me/availability',
  authenticate,
  requireRole('volunteer'),
  requireActive,
  asyncHandler(async (req, res) => {
    const parsed = availabilitySchema.safeParse(req.body)
    if (!parsed.success) throw errors.badRequest('is_available must be a boolean')
    const result = await withTransaction((db) =>
      setVolunteerAvailability(db, req.user!.id, parsed.data.is_available),
    )
    ok(res, { availability: result })
  }),
)

export default router