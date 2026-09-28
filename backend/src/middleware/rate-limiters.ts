import rateLimit from 'express-rate-limit'
import { config } from '../config/index.js'

/**
 * Per-IP OTP-request limiter: 10 / hour. In-memory, best-effort by design.
 *
 * Skipped in tests (supertest always appears from the same IP) and when
 * RATE_LIMIT_DISABLED=true, which exists so local development is not throttled
 * by repeatedly re-running the e2e scripts or switching accounts. That flag is
 * ignored in production, so the limiter cannot be shipped off by accident.
 *
 * Before any real deployment, key the limiter on email as well as IP and put a
 * real limit in place — see `plans/deferred-before-production.md`.
 */
export const otpIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest || config.rateLimitDisabled,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many OTP requests from this IP' },
    })
  },
})
