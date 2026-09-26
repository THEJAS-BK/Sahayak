import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { errors } from '../../lib/errors.js'
import { config } from '../../config/index.js'
import type { Queryable } from '../../database/pool.js'

export const OTP_TTL_MS = 10 * 60 * 1000
export const MAX_ISSUANCE_PER_EMAIL = 3
export const MAX_FAILED_ATTEMPTS = 5

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function generateCode(): string {
  if (!config.isProduction && config.otpDevCode) return config.otpDevCode
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * 3 OTPs per email per 10 minutes (DB-backed, restart-safe).
 *
 * Skipped when RATE_LIMIT_DISABLED=true. Unlike the per-IP limiter this one
 * lives in `otp_codes`, so it survives a server restart and will lock a real
 * user out for up to 10 minutes with no way to clear it but waiting.
 */
export async function assertCanIssue(db: Queryable, email: string): Promise<void> {
  if (config.rateLimitDisabled) return
  const res = await db.query(
    `SELECT count(*)::int AS n FROM otp_codes
     WHERE email = $1 AND created_at > now() - interval '10 minutes'`,
    [email],
  )
  if (res.rows[0].n >= MAX_ISSUANCE_PER_EMAIL) {
    throw errors.tooMany('Too many OTP requests for this email')
  }
}

export async function persistCode(db: Queryable, email: string, code: string): Promise<void> {
  const hash = await bcrypt.hash(code, 10)
  await db.query('INSERT INTO otp_codes (email, code_hash, expires_at) VALUES ($1, $2, $3)', [
    email,
    hash,
    new Date(Date.now() + OTP_TTL_MS),
  ])
}

export async function countFailedAttempts(db: Queryable, email: string): Promise<number> {
  const res = await db.query(
    `SELECT count(*)::int AS n FROM otp_attempts
     WHERE email = $1 AND success = false AND created_at > now() - interval '10 minutes'`,
    [email],
  )
  return res.rows[0].n
}

export async function recordAttempt(db: Queryable, email: string, success: boolean): Promise<void> {
  await db.query('INSERT INTO otp_attempts (email, success) VALUES ($1, $2)', [email, success])
}

interface UnusedCode {
  id: string
  code_hash: string
}

/**
 * The newest unused, unexpired code for an email, or null.
 */
export async function findUnusedCode(db: Queryable, email: string): Promise<UnusedCode | null> {
  const res = await db.query<UnusedCode>(
    `SELECT id, code_hash FROM otp_codes
     WHERE email = $1 AND used = false AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [email],
  )
  if (res.rowCount === 0) return null
  return res.rows[0]
}

/**
 * Marks a code used, but only if it is still unused (single-use, race-safe).
 * Returns false if the code was already consumed.
 */
export async function consumeCode(db: Queryable, id: string): Promise<boolean> {
  const res = await db.query('UPDATE otp_codes SET used = true WHERE id = $1 AND used = false RETURNING id', [id])
  return (res.rowCount ?? 0) > 0
}