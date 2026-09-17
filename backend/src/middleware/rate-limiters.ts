import rateLimit from 'express-rate-limit'
import { config } from '../config/index.js'

/**
 * Per-IP OTP-request limiter: 10 / hour. In-memory, best-effort by design.
 * Skipped in tests (supertest always appears from the same IP).
 */
export const otpIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many OTP requests from this IP' },
    })
  },
})