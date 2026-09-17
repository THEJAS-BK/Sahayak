import { Router } from 'express'
import { z } from 'zod'
import { errors } from '../../lib/errors.js'
import { asyncHandler, ok } from '../../lib/http.js'
import { pool, withTransaction } from '../../database/pool.js'
import { authenticate, requireActive, requireRole } from '../../middleware/auth.js'
import { notifyPolice } from '../notifications/police.js'
import { createEmergency, listEmergencyEvents, reviewEmergency } from './emergency.service.js'

const createSchema = z.object({
  trigger_type: z.enum(['semantic_llm', 'acoustic_distress', 'keyword_repetition']),
  source: z.enum(['voice_agent', 'flutter_app']),
  help_request_id: z.uuid().optional(),
  detail: z.record(z.string(), z.unknown()).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
})

/** E-01 */
export const emergencyRoutes = Router()
emergencyRoutes.post(
  '/',
  authenticate,
  requireRole('senior'),
  requireActive,
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) throw errors.badRequest('Invalid emergency event payload')

    const result = await withTransaction((db) => createEmergency(db, req.user!.id, parsed.data))
    res.status(201).json({ success: true, data: { event: result } })

    void notifyPolice('Emergency alert', `SOS event (${parsed.data.trigger_type}) from a senior.`, {
      type: 'emergency_logged',
      event_id: result.event_id,
    })
  }),
)

const listSchema = z.object({
  status: z.enum(['LOGGED', 'REVIEWED']).optional(),
  senior_id: z.uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().min(1).optional(),
})

const reviewSchema = z.object({ status: z.enum(['REVIEWED']) })

/** E-02 + E-03 (mounted under /police) */
export const policeEmergencyRoutes = Router()
policeEmergencyRoutes.get(
  '/',
  authenticate,
  requireRole('police'),
  requireActive,
  asyncHandler(async (req, res) => {
    const parsed = listSchema.safeParse(req.query)
    if (!parsed.success) throw errors.badRequest('Invalid query parameters')
    const result = await listEmergencyEvents(pool, parsed.data)
    ok(res, result)
  }),
)

policeEmergencyRoutes.patch(
  '/:id',
  authenticate,
  requireRole('police'),
  requireActive,
  asyncHandler(async (req, res) => {
    const parsed = reviewSchema.safeParse(req.body)
    if (!parsed.success) throw errors.badRequest('status must be REVIEWED')
    const id = String(req.params.id)
    const result = await withTransaction((db) => reviewEmergency(db, id, req.user!.id))
    ok(res, { event: result })
  }),
)