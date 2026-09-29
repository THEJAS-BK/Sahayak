import { errors } from '../../lib/errors.js'
import { writeAudit } from '../../database/audit.js'
import type { Queryable } from '../../database/pool.js'

export type VerificationStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'

export interface CurrentUser {
  id: string
  email: string
  role: string | null
  isActive: boolean
  verificationStatus: VerificationStatus
  profile: Record<string, unknown> | null
}

export async function getVerificationStatus(db: Queryable, userId: string): Promise<VerificationStatus> {
  const res = await db.query(
    `SELECT status FROM user_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  )
  if (res.rowCount === 0) return 'NONE'
  const status = res.rows[0].status as VerificationStatus
  return status === 'APPROVED' || status === 'PENDING' || status === 'REJECTED' ? status : 'NONE'
}

/**
 * Profile columns are passed through untouched, so the row keeps its native
 * snake_case and `GET /api/me` speaks the same convention as every other
 * endpoint in the API.
 *
 * This used to blanket-camelCase the whole `SELECT *`, which produced one
 * response holding `is_active`/`verification_status` next to
 * `profile.fullName`/`profile.isAvailable`. A client reading `profile.full_name`
 * then got `null` and rendered a blank profile with nothing signalling a fault.
 */
function shape(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row }
}

export async function getCurrentUser(db: Queryable, userId: string): Promise<CurrentUser> {
  const user = await db.query(
    'SELECT id, email, role, is_active FROM users WHERE id = $1',
    [userId],
  )
  if (user.rowCount === 0) throw errors.notFound('User not found')

  const u = user.rows[0] as { id: string; email: string; role: string | null; is_active: boolean }
  const [verificationStatus, profile] = await Promise.all([
    getVerificationStatus(db, userId),
    (async () => {
      if (u.role === 'senior') {
        const p = await db.query('SELECT * FROM senior_profiles WHERE user_id = $1', [userId])
        return p.rowCount ? shape(p.rows[0]) : null
      }
      if (u.role === 'volunteer') {
        const p = await db.query('SELECT * FROM volunteer_profiles WHERE user_id = $1', [userId])
        return p.rowCount ? shape(p.rows[0]) : null
      }
      return null
    })(),
  ])

  return {
    id: u.id,
    email: u.email,
    role: u.role,
    isActive: u.is_active,
    verificationStatus,
    profile,
  }
}

export async function updateFcmToken(db: Queryable, userId: string, fcmToken: string): Promise<string> {
  const before = await db.query('SELECT fcm_token FROM users WHERE id = $1', [userId])
  if (before.rowCount === 0) throw errors.notFound('User not found')
  const oldToken = before.rows[0].fcm_token as string | null
  await db.query('UPDATE users SET fcm_token = $1 WHERE id = $2', [fcmToken, userId])
  await writeAudit(db, {
    actorId: userId,
    action: 'user.fcm_token_updated',
    entityType: 'user',
    entityId: userId,
    before: { fcm_token: oldToken },
    after: { fcm_token: fcmToken },
  })
  return fcmToken
}

/**
 * Device tokens for every active police account that has opted in.
 *
 * The police desk is a browser (the web portal registers its own FCM token via
 * `PATCH /api/me/fcm-token`), so there is no single hardcoded token to push to —
 * one row per signed-in, permission-granted browser. DISTINCT because several
 * officers can share a machine, and a revoked token can linger on a stale row.
 */
export async function listPoliceFcmTokens(db: Queryable): Promise<string[]> {
  const res = await db.query(
    `SELECT DISTINCT fcm_token FROM users
      WHERE role = 'police' AND is_active = true AND fcm_token IS NOT NULL`,
  )
  return res.rows.map((r) => r.fcm_token as string).filter(Boolean)
}