import { errors } from '../../lib/errors.js'
import { writeAudit } from '../../database/audit.js'
import type { Queryable } from '../../database/pool.js'

export interface SeniorForm {
  full_name: string
  phone_number: string
  home_latitude: number
  home_longitude: number
  preferred_language: 'kannada' | 'english' | 'tulu'
  aadhaar_number: string
  emergency_contact?: { name: string; phone: string; relation: string } | null
  fcm_token?: string
}

export interface VolunteerForm {
  full_name: string
  phone_number: string
  organization?: string | null
  skills: string[]
  base_latitude: number
  base_longitude: number
  id_proof_ref?: string | null
  aadhaar_number: string
  club_id?: string | null
  fcm_token?: string
}

export async function hasOpenVerification(db: Queryable, userId: string): Promise<boolean> {
  const res = await db.query(
    `SELECT id FROM user_verifications
     WHERE user_id = $1 AND status IN ('PENDING', 'APPROVED') LIMIT 1`,
    [userId],
  )
  return (res.rowCount ?? 0) > 0
}

interface SubmitResult {
  verification_id: string
  status: 'PENDING'
}

export async function submitVerification(
  db: Queryable,
  input: { userId: string; role: 'senior' | 'volunteer'; form: SeniorForm | VolunteerForm; fcmToken: string | null },
): Promise<SubmitResult> {
  if (await hasOpenVerification(db, input.userId)) {
    throw errors.conflict('VERIFICATION_EXISTS', 'A pending or approved verification already exists for this account')
  }

  const { fcm_token: _omit, ...formData } = input.form
  const res = await db.query(
    `INSERT INTO user_verifications (user_id, role, form_data, fcm_token, status)
     VALUES ($1, $2, $3, $4, 'PENDING')
     RETURNING id, status`,
    [input.userId, input.role, JSON.stringify(formData), input.fcmToken],
  )

  if (input.fcmToken) {
    await db.query('UPDATE users SET fcm_token = $1 WHERE id = $2', [input.fcmToken, input.userId])
  }

  await writeAudit(db, {
    actorId: input.userId,
    action: `registration.${input.role}.submitted`,
    entityType: 'user_verification',
    entityId: res.rows[0].id,
    after: { role: input.role, status: 'PENDING' },
  })

  return { verification_id: res.rows[0].id, status: 'PENDING' }
}

export interface MyVerification {
  verification_id: string
  role: 'senior' | 'volunteer'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  created_at: Date
  reviewed_at: Date | null
  review_reason: string | null
}

export async function getMyVerification(db: Queryable, userId: string): Promise<MyVerification | null> {
  const res = await db.query(
    `SELECT id AS verification_id, role, status, created_at, reviewed_at, review_reason
     FROM user_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  )
  if (res.rowCount === 0) return null
  const r = res.rows[0]
  return {
    verification_id: r.verification_id,
    role: r.role,
    status: r.status,
    created_at: r.created_at,
    reviewed_at: r.reviewed_at,
    review_reason: r.review_reason,
  }
}