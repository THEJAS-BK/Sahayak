import { Router } from 'express'
import { z } from 'zod'
import { errors } from '../../lib/errors.js'
import { asyncHandler, ok } from '../../lib/http.js'
import { pool } from '../../database/pool.js'
import { authenticate, requireActive, requireRole } from '../../middleware/auth.js'
import { assertSeniorExists, getSeniorDetail, listSeniors } from './seniors.service.js'

const router = Router()

const listQuerySchema = z.object({
  search: z.string().min(1).max(120).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'NONE']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).optional(),
})

/** P-06: seniors known to the police console. */
router.get(
  '/',
  authenticate,
  requireRole('police'),
  requireActive,
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) throw errors.badRequest('Invalid senior query')
    ok(res, await listSeniors(pool, parsed.data))
  }),
)

/** P-07: one senior's profile, verifications, requests and emergencies. */
router.get(
  '/:id',
  authenticate,
  requireRole('police'),
  requireActive,
  asyncHandler(async (req, res) => {
    const id = z.uuid().safeParse(req.params.id)
    if (!id.success) throw errors.badRequest('Invalid senior id')
    ok(res, { senior: assertSeniorExists(await getSeniorDetail(pool, id.data)) })
  }),
)

export default router
