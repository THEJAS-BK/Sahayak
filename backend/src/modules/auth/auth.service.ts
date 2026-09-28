import bcrypt from 'bcryptjs'
import { errors } from '../../lib/errors.js'
import { pool, withTransaction } from '../../database/pool.js'
import { sendOtpEmail } from '../notifications/email.js'
import {
  MAX_FAILED_ATTEMPTS,
  assertCanIssue,
  consumeCode,
  countFailedAttempts,
  findUnusedCode,
  generateCode,
  normalizeEmail,
  persistCode,
  recordAttempt,
} from './otp.service.js'
import {
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  signAccessToken,
  toUserAccount,
  type UserAccount,
} from './tokens.service.js'

export interface VerifiedSession {
  user: UserAccount
  accessToken: string
  refreshToken?: string
}

export async function requestOtp(emailInput: string): Promise<void> {
  const email = normalizeEmail(emailInput)
  await withTransaction(async (db) => {
    await assertCanIssue(db, email)
    const code = generateCode()
    await persistCode(db, email, code)
    await sendOtpEmail(email, code)
  })
}

async function upsertUserByEmail(email: string): Promise<UserAccount> {
  const inserted = await pool.query(
    'INSERT INTO users (email) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id, email, role, is_active',
    [email],
  )
  if ((inserted.rowCount ?? 0) > 0) {
    return { id: inserted.rows[0].id, email, role: null, isActive: false }
  }
  const found = await pool.query('SELECT id, email, role, is_active FROM users WHERE email = $1', [email])
  return toUserAccount(found.rows[0])
}

/**
 * Failed attempts and the family revocation must survive (auto-commit), so the
 * failure path runs on the pool directly; only the success path is
 * transactional.
 */
export async function verifyOtpAndIssueTokens(emailInput: string, code: string): Promise<VerifiedSession> {
  const email = normalizeEmail(emailInput)

  if ((await countFailedAttempts(pool, email)) >= MAX_FAILED_ATTEMPTS) {
    throw errors.tooMany('Too many failed verification attempts')
  }

  const unused = await findUnusedCode(pool, email)
  if (!unused) {
    await recordAttempt(pool, email, false)
    throw errors.unauthorized('Invalid or expired code')
  }

  const matches = await bcrypt.compare(code, unused.code_hash)
  if (!matches) {
    await recordAttempt(pool, email, false)
    throw errors.unauthorized('Invalid or expired code')
  }

  const user = await upsertUserByEmail(email)

  return withTransaction(async (db) => {
    const consumed = await consumeCode(db, unused.id)
    if (!consumed) throw errors.unauthorized('Invalid or expired code')
    await recordAttempt(db, email, true)

    if (user.role === 'police') {
      return { user, accessToken: signAccessToken(user, '8h') }
    }
    const refreshToken = await createRefreshToken(db, user.id)
    return { user, accessToken: signAccessToken(user,'8h'), refreshToken }
  })
}

export async function refreshSession(rawToken: string): Promise<VerifiedSession> {
  const { refreshToken, user } = await rotateRefreshToken(pool, rawToken)
  return { user, accessToken: signAccessToken(user,'8h'), refreshToken }
}

export async function logout(rawToken: string): Promise<void> {
  await revokeRefreshToken(pool, rawToken)
}