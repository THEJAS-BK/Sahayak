import { Router } from 'express'
import { z } from 'zod'
import { config } from '../../config/index.js'
import { errors } from '../../lib/errors.js'
import { asyncHandler, ok } from '../../lib/http.js'
import { logger } from '../../lib/logger.js'
import { pool, withTransaction } from '../../database/pool.js'
import { authenticate, requireActive, requireRole } from '../../middleware/auth.js'
import { notifyDispatch, notifyRequestAccepted, notifyRequestStatus } from '../notifications/request.js'
import {
  acceptRequest,
  cancelRequest,
  createRequest,
  declineRequest,
  getRequest,
  getVolunteerContact,
  listMyRequests,
  nearbyRequests,
  updateRequestStatus,
} from './requests.service.js'

const router = Router()

const createSchema = z.object({
  category: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  details: z.record(z.string(), z.unknown()).optional(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  priority: z.enum(['normal', 'urgent']).default('normal'),
  source: z.enum(['voice_agent', 'flutter_app']),
})

/** Q-01 */
router.post(
  '/',
  authenticate,
  requireRole('senior'),
  requireActive,
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) throw errors.badRequest('Invalid help request')

    logger.info('[voice] help request', { userId: req.user!.id, request: parsed.data })

    // Dry run: print the body and acknowledge without persisting, dispatching or
    // notifying. Enabled with REQUESTS_DRY_RUN=true while the mobile review
    // flow is being built; remove the block once real requests are wanted.
    if (config.requests.dryRun) {
      console.log(
        `\n[requests] DRY RUN — POST /api/requests from ${req.user!.id} (${req.user!.role}) at ${new Date().toISOString()}\n` +
          JSON.stringify(parsed.data, null, 2),
      )
      ok(res, { dry_run: true, request_id: null, status: 'PENDING', dispatched_to: [] }, 201)
      return
    }

    const pending = await pool.query(
      `SELECT 1 FROM help_requests WHERE senior_id = $1 AND status IN ('PENDING','MATCHING','DISPATCHED','ACCEPTED','IN_PROGRESS') LIMIT 1`,
      [req.user!.id],
    )
    if ((pending.rowCount ?? 0) > 0) {
      throw errors.conflict('REQUEST_ALREADY_OPEN', 'You already have an open help request (BR-13)')
    }

    let candidates: Array<{ id: string; fcmToken: string | null }> = []
    let result: Awaited<ReturnType<typeof createRequest>>
    try {
      result = await withTransaction(async (db) => {
        const created = await createRequest(db, req.user!.id, parsed.data)
        candidates = created.dispatched_to.map((id) => ({ id, fcmToken: null }))
        return created
      })
    } catch (err) {
      // Race-safe BR-13: unique partial index on (senior_id) for open statuses.
      if ((err as { code?: string }).code === '23505') {
        throw errors.conflict('REQUEST_ALREADY_OPEN', 'You already have an open help request (BR-13)')
      }
      throw err
    }

    // Post-commit FCM fan-out (fire-and-forget).
    if (candidates.length > 0) {
      const tokensRes = await pool.query(
        'SELECT id, fcm_token FROM users WHERE id = ANY($1::uuid[])',
        [candidates.map((c) => c.id)],
      )
      const withTokens = tokensRes.rows.map((r): { id: string; fcmToken: string | null } => ({
        id: r.id,
        fcmToken: r.fcm_token,
      }))
      void notifyDispatch(withTokens, result.request_id, parsed.data.category)
    }

    ok(res, result, 201)
  }),
)

/** Q-02 */
router.get(
  '/me',
  authenticate,
  requireRole('senior', 'volunteer'),
  requireActive,
  asyncHandler(async (req, res) => {
    const requests = await listMyRequests(pool, req.user as { id: string; role: 'senior' | 'volunteer' })
    ok(res, { requests })
  }),
)

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius_m: z.coerce.number().int().min(1).max(20000).default(5000),
})

/** Q-04 */
router.get(
  '/nearby',
  authenticate,
  requireRole('volunteer'),
  requireActive,
  asyncHandler(async (req, res) => {
    const parsed = nearbyQuerySchema.safeParse(req.query)
    if (!parsed.success) throw errors.badRequest('Invalid location query')
    const requests = await nearbyRequests(pool, req.user as { id: string }, {
      latitude: parsed.data.lat,
      longitude: parsed.data.lng,
      radiusM: parsed.data.radius_m,
    })
    ok(res, { requests })
  }),
)

/** Q-03 */
router.get(
  '/:id',
  authenticate,
  requireRole('senior', 'volunteer', 'police'),
  requireActive,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id)
    const request = await getRequest(pool, req.user as { id: string; role: string }, id)
    ok(res, { request })
  }),
)

/** Q-05 */
router.patch(
  '/:id/accept',
  authenticate,
  requireRole('volunteer'),
  requireActive,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id)
    const accepted = await withTransaction((db) => acceptRequest(db, req.user as { id: string }, id))

    const senior = await pool.query(
      `SELECT u.email, u.fcm_token, vp.full_name
       FROM help_requests hr
       JOIN users u ON u.id = hr.senior_id
       LEFT JOIN volunteer_profiles vp ON vp.user_id = $1
       WHERE hr.id = $2`,
      [req.user!.id, id],
    )
    const row = senior.rows[0]
    void notifyRequestAccepted({ email: row.email, fcmToken: row.fcm_token }, row.full_name)

    ok(res, accepted)
  }),
)

const declineSchema = z.object({ reason: z.string().trim().max(280).optional() })

/**
 * Q-05 sibling: turn down a request you were offered. The request stays
 * DISPATCHED for other volunteers; the senior is not notified, because nothing
 * has failed yet.
 */
router.patch(
  '/:id/decline',
  authenticate,
  requireRole('volunteer'),
  requireActive,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id)
    const body = declineSchema.safeParse(req.body ?? {})
    if (!body.success) throw errors.badRequest('Invalid decline payload')
    const declined = await withTransaction((db) =>
      declineRequest(db, req.user as { id: string }, id, body.data.reason),
    )
    ok(res, declined)
  }),
)

const statusSchema = z.object({ status: z.enum(['IN_PROGRESS', 'COMPLETED']) })

/** Q-06 */
router.patch(
  '/:id/status',
  authenticate,
  requireRole('volunteer'),
  requireActive,
  asyncHandler(async (req, res) => {
    const parsed = statusSchema.safeParse(req.body)
    if (!parsed.success) throw errors.badRequest('status must be IN_PROGRESS or COMPLETED')
    const id = String(req.params.id)

    const result = await withTransaction((db) =>
      updateRequestStatus(db, req.user as { id: string }, id, parsed.data.status),
    )

    const senior = await pool.query(
      `SELECT u.email, u.fcm_token FROM help_requests hr JOIN users u ON u.id = hr.senior_id WHERE hr.id = $1`,
      [id],
    )
    if ((senior.rowCount ?? 0) > 0) {
      const s = senior.rows[0]
      void notifyRequestStatus({ email: s.email, fcmToken: s.fcm_token }, parsed.data.status)
    }

    ok(res, result)
  }),
)

/** Q-07 */
router.patch(
  '/:id/cancel',
  authenticate,
  requireRole('senior'),
  requireActive,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id)
    const result = await withTransaction((db) => cancelRequest(db, req.user as { id: string }, id))
    ok(res, result)
  }),
)

/** Q-08 */
router.get(
  '/:id/volunteer',
  authenticate,
  requireRole('senior'),
  requireActive,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id)
    const contact = await getVolunteerContact(pool, req.user as { id: string }, id)
    ok(res, { volunteer: contact })
  }),
)

export default router