import { Router } from 'express'
import { z } from 'zod'
import { errors } from '../../lib/errors.js'
import { asyncHandler, ok } from '../../lib/http.js'
import { pool, withTransaction } from '../../database/pool.js'
import { authenticate, requireAuthenticated } from '../../middleware/auth.js'
import { getMyVerification, submitVerification } from './registrations.service.js'

const router = Router()

const phoneSchema = z.string().min(5).max(20).regex(/^[0-9+\s-]+$/, 'Invalid phone number')
const aadhaarSchema = z.string().regex(/^\d{12}$/, 'Aadhaar number must be 12 digits')
const coordinatesSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
})

const seniorFormSchema = z.object({
  full_name: z.string().min(1).max(200),
  phone_number: phoneSchema,
  home_latitude: coordinatesSchema.shape.latitude,
  home_longitude: coordinatesSchema.shape.longitude,
  preferred_language: z.enum(['kannada', 'english', 'tulu']),
  aadhaar_number: aadhaarSchema,
  emergency_contact: z
    .object({
      name: z.string().min(1).max(200),
      phone: phoneSchema,
      relation: z.string().min(1).max(100),
    })
    .optional(),
  fcm_token: z.string().min(1).max(2048).optional(),
})

const volunteerFormSchema = z.object({
  full_name: z.string().min(1).max(200),
  phone_number: phoneSchema,
  organization: z.string().min(1).max(200).optional(),
  skills: z.array(z.string().min(1).max(100)).min(1).max(50),
  base_latitude: coordinatesSchema.shape.latitude,
  base_longitude: coordinatesSchema.shape.longitude,
  id_proof_ref: z.string().min(1).max(100).optional(),
  aadhaar_number: aadhaarSchema,
  club_id: z.string().min(1).max(100).optional(),
  fcm_token: z.string().min(1).max(2048).optional(),
})

/** R-01 */
router.post(
  '/senior',
  authenticate,
  requireAuthenticated,
  asyncHandler(async (req, res) => {
    const parsed = seniorFormSchema.safeParse(req.body)
    if (!parsed.success) throw errors.badRequest('Invalid senior registration form')
    if (req.user!.role) throw errors.conflict('ROLE_ALREADY_SET', 'This account already has a role')

    const form = parsed.data
    const fcmToken = form.fcm_token ?? null
    delete (form as Partial<typeof form>).fcm_token

    const result = await withTransaction((db) =>
      submitVerification(db, { userId: req.user!.id, role: 'senior', form, fcmToken }),
    )
    ok(res, result, 201)
  }),
)

/** R-02 */
router.post(
  '/volunteer',
  authenticate,
  requireAuthenticated,
  asyncHandler(async (req, res) => {
    const parsed = volunteerFormSchema.safeParse(req.body)
    if (!parsed.success) throw errors.badRequest('Invalid volunteer registration form')
    if (req.user!.role) throw errors.conflict('ROLE_ALREADY_SET', 'This account already has a role')

    const form = parsed.data
    const fcmToken = form.fcm_token ?? null
    delete (form as Partial<typeof form>).fcm_token

    const result = await withTransaction((db) =>
      submitVerification(db, { userId: req.user!.id, role: 'volunteer', form, fcmToken }),
    )
    ok(res, result, 201)
  }),
)

/** R-03 */
router.get(
  '/me',
  authenticate,
  requireAuthenticated,
  asyncHandler(async (req, res) => {
    const verification = await getMyVerification(pool, req.user!.id)
    ok(res, { verification })
  }),
)

export default router