import { Router } from 'express'
import { z } from 'zod'
import { errors } from '../../lib/errors.js'
import { asyncHandler, ok } from '../../lib/http.js'
import { authenticate, requireActive, requireRole } from '../../middleware/auth.js'
import { pool, withTransaction } from '../../database/pool.js'
import { getCurrentUser, updateFcmToken } from './users.service.js'

const router = Router()

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const me = await getCurrentUser(pool, req.user!.id)
    ok(res, {
      id: me.id,
      email: me.email,
      role: me.role,
      is_active: me.isActive,
      verification_status: me.verificationStatus,
      profile: me.profile,
    })
  }),
)

const fcmSchema = z.object({ fcm_token: z.string().min(1).max(1024) })

router.patch(
  '/me/fcm-token',
  authenticate,
  requireRole('senior', 'volunteer', 'police'),
  requireActive,
  asyncHandler(async (req, res) => {
    const body = fcmSchema.safeParse(req.body)
    if (!body.success) throw errors.badRequest('fcm_token is required')
    const fcmToken = await withTransaction((db) => updateFcmToken(db, req.user!.id, body.data.fcm_token))
    ok(res, { fcm_token: fcmToken })
  }),
)

export default router