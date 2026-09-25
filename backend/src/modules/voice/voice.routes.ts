import { Router } from 'express'
import { asyncHandler, ok } from '../../lib/http.js'
import { authenticate } from '../../middleware/auth.js'
import { createVoiceSession } from './voice.service.js'

const router = Router()

router.post(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const session = await createVoiceSession(req.user!.id)
    ok(res, session)
  }),
)

export default router