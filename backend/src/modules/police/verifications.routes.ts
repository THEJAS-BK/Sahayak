import { Router } from 'express'
import { z } from 'zod'
import { errors } from '../../lib/errors.js'
import { asyncHandler, ok } from '../../lib/http.js'
import { pool, withTransaction } from '../../database/pool.js'
import { authenticate, requireActive, requireRole } from '../../middleware/auth.js'
import { notifyVerificationResult } from '../notifications/verification.js'
import {
  getVerification,
  listVerifications,
  reviewVerification,
} from './verifications.service.js'

const router = Router()

const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

/** V-01 */
router.get(
  '/',
  authenticate,
  requireRole('police'),
  requireActive,
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) throw errors.badRequest('Invalid query parameters')
    const result = await listVerifications(pool, parsed.data)
    ok(res, result)
  }),
)

/** V-02 */
router.get(
  '/:id',
  authenticate,
  requireRole('police'),
  requireActive,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id)
    const verification = await getVerification(pool, id)
    ok(res, { verification })
  }),
)

const reviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().min(1).max(500).optional(),
})

/** V-03 */
router.patch(
  '/:id',
  authenticate,
  requireRole('police'),
  requireActive,
  asyncHandler(async (req, res) => {
    const parsed = reviewSchema.safeParse(req.body)
    if (!parsed.success) throw errors.badRequest('status must be APPROVED or REJECTED')

    const id = String(req.params.id)
    const result = await withTransaction((db) =>
      reviewVerification(db, id, req.user!.id, parsed.data),
    )
    res.status(200).json({ success: true, data: { verification: result } })

    // After commit, fire notifications (failures logged, never propagated).
    void notifyVerificationResult({
      email: result.email,
      fcmToken: result.fcm_token,
      role: result.role,
      status: result.status,
      fullName: result.full_name,
      reason: result.reason,
    })
  }),
)

export default router