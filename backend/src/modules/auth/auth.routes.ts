import { Router } from 'express'
import { z } from 'zod'
import { errors } from '../../lib/errors.js'
import { asyncHandler, ok } from '../../lib/http.js'
import { otpIpLimiter } from '../../middleware/rate-limiters.js'
import { requestOtp, verifyOtpAndIssueTokens, refreshSession, logout } from './auth.service.js'
import { getVerificationStatus } from '../users/users.service.js'
import { pool } from '../../database/pool.js'

const router = Router()

const emailSchema = z.object({ email: z.email() })

router.post(
  '/otp/request',
  otpIpLimiter,
  asyncHandler(async (req, res) => {
    const body = emailSchema.safeParse(req.body)
    if (!body.success) throw errors.badRequest('Invalid email')
    await requestOtp(body.data.email)
    ok(res, { sent: true })
  }),
)

const verifySchema = z.object({
  email: z.email(),
  code: z.string().regex(/^\d{6}$/, 'Code must be exactly 6 digits'),
})

router.post(
  '/otp/verify',
  asyncHandler(async (req, res) => {
    const body = verifySchema.safeParse(req.body)
    if (!body.success) throw errors.badRequest('Invalid email or code')
    const { user, accessToken, refreshToken } = await verifyOtpAndIssueTokens(body.data.email, body.data.code)
    const verificationStatus = await getVerificationStatus(pool, user.id)
    ok(res, {
      access_token: accessToken,
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
      user: {
        id: user.id,
        role: user.role,
        is_active: user.isActive,
        verification_status: verificationStatus,
      },
    })
  }),
)

const refreshSchema = z.object({ refresh_token: z.string().min(1) })

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const body = refreshSchema.safeParse(req.body)
    if (!body.success) throw errors.badRequest('refresh_token is required')
    const { user, accessToken, refreshToken } = await refreshSession(body.data.refresh_token)
    // Mirror the OTP-verify envelope exactly. A client that treats refresh as
    // the source of truth for account state cannot otherwise learn that the
    // account is still awaiting approval.
    const verificationStatus = await getVerificationStatus(pool, user.id)
    ok(res, {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        role: user.role,
        is_active: user.isActive,
        verification_status: verificationStatus,
      },
    })
  }),
)

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const raw = (req.body && typeof req.body.refresh_token === 'string' && req.body.refresh_token) || undefined
    if (!raw) throw errors.badRequest('refresh_token is required')
    await logout(raw)
    ok(res, { logged_out: true })
  }),
)

export default router