import { errors } from '../../lib/errors.js'
import { writeAudit } from '../../database/audit.js'
import { encodeCursor, decodeCursor } from '../../lib/pagination.js'
import type { Queryable } from '../../database/pool.js'

const PAGE_SIZE = 20

export interface VerificationSummary {
  id: string
  email: string
  full_name: string | null
  role: 'senior' | 'volunteer'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  created_at: Date
  reviewed_at: Date | null
}

export interface VerificationListResult {
  verifications: VerificationSummary[]
  next_cursor: string | null
}

export async function listVerifications(
  db: Queryable,
  filter: { status?: string; cursor?: string; limit?: number },
): Promise<VerificationListResult> {
  const limit = Math.min(Math.max(filter.limit ?? PAGE_SIZE, 1), 100)
  const cursor = decodeCursor(filter.cursor)
  const params: unknown[] = []
  const where: string[] = []

  if (filter.status) {
    params.push(filter.status)
    where.push(`uv.status = $${params.length}`)
  }
  if (cursor) {
    params.push(cursor.createdAt, cursor.id)
    where.push(`(uv.created_at, uv.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`)
  }
  params.push(limit)
  const sql = `
    SELECT uv.id, uv.role, uv.status, uv.created_at, uv.reviewed_at,
           u.email, uv.form_data->>'full_name' AS full_name
    FROM user_verifications uv
    JOIN users u ON u.id = uv.user_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY uv.created_at DESC, uv.id DESC
    LIMIT $${params.length}`

  const res = await db.query(sql, params)
  const rows = res.rows
  const next = rows.length === limit ? encodeCursor(rows[rows.length - 1].created_at, rows[rows.length - 1].id) : null

  return {
    verifications: rows.map((r) => ({
      id: r.id,
      email: r.email,
      full_name: r.full_name,
      role: r.role,
      status: r.status,
      created_at: r.created_at,
      reviewed_at: r.reviewed_at,
    })),
    next_cursor: next,
  }
}

export interface VerificationDetail {
  id: string
  user_id: string
  role: 'senior' | 'volunteer'
  form_data: Record<string, unknown>
  fcm_token: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  created_at: Date
  reviewed_at: Date | null
  review_reason: string | null
  reviewed_by: string | null
  user: { id: string; email: string }
}

export async function getVerification(db: Queryable, id: string): Promise<VerificationDetail> {
  const res = await db.query(
    `SELECT uv.*, u.email
     FROM user_verifications uv JOIN users u ON u.id = uv.user_id
     WHERE uv.id = $1`,
    [id],
  )
  if (res.rowCount === 0) throw errors.notFound('Verification not found')
  const r = res.rows[0]
  return {
    id: r.id,
    user_id: r.user_id,
    role: r.role,
    form_data: r.form_data,
    fcm_token: r.fcm_token,
    status: r.status,
    created_at: r.created_at,
    reviewed_at: r.reviewed_at,
    review_reason: r.review_reason,
    reviewed_by: r.reviewed_by,
    user: { id: r.user_id, email: r.email },
  }
}

export interface ReviewResult {
  verification_id: string
  user_id: string
  role: 'senior' | 'volunteer'
  status: 'APPROVED' | 'REJECTED'
  email: string
  full_name: string
  fcm_token: string | null
  reason: string | null
}

/**
 * Approve/reject a pending verification. Runs inside a transaction; the caller
 * fires notifications AFTER commit.
 */
export async function reviewVerification(
  db: Queryable,
  verificationId: string,
  policeId: string,
  input: { status: 'APPROVED' | 'REJECTED'; reason?: string },
): Promise<ReviewResult> {
  const existing = await db.query(
    `SELECT uv.*, u.email FROM user_verifications uv JOIN users u ON u.id = uv.user_id WHERE uv.id = $1`,
    [verificationId],
  )
  if (existing.rowCount === 0) throw errors.notFound('Verification not found')
  const v = existing.rows[0]
  if (v.status !== 'PENDING') throw errors.invalidState('Verification is not pending (already reviewed)')

  const reason = input.reason ?? null
  const before = { status: 'PENDING' }

  if (input.status === 'APPROVED') {
    await db.query('UPDATE users SET role = $1, is_active = true WHERE id = $2', [v.role, v.user_id])
    await insertProfile(db, v.role, v.user_id, v.form_data)
  }

  await db.query(
    `UPDATE user_verifications SET status = $1, reviewed_by = $2, reviewed_at = now(), review_reason = $3 WHERE id = $4`,
    [input.status, policeId, reason, verificationId],
  )

  await writeAudit(db, {
    actorId: policeId,
    action: input.status === 'APPROVED' ? 'verification.approved' : 'verification.rejected',
    entityType: 'user_verification',
    entityId: verificationId,
    before,
    after: { status: input.status, user_id: v.user_id, role: v.role },
    metadata: { reason, reviewed_at: new Date().toISOString() },
  })

  const formData = v.form_data ?? {}
  return {
    verification_id: verificationId,
    user_id: v.user_id,
    role: v.role,
    status: input.status,
    email: v.email,
    full_name: typeof formData.full_name === 'string' ? formData.full_name : '',
    fcm_token: v.fcm_token,
    reason,
  }
}

async function insertProfile(db: Queryable, role: string, userId: string, formData: Record<string, unknown>): Promise<void> {
  if (role === 'senior') {
    const ec = formData.emergency_contact as { name?: string; phone?: string; relation?: string } | null | undefined
    await db.query(
      `INSERT INTO senior_profiles
        (user_id, full_name, phone_number, home_latitude, home_longitude, preferred_language, aadhaar_number, emergency_contact)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        formData.full_name ?? null,
        formData.phone_number ?? null,
        formData.home_latitude ?? null,
        formData.home_longitude ?? null,
        formData.preferred_language ?? null,
        formData.aadhaar_number ?? '',
        ec ? JSON.stringify(ec) : null,
      ],
    )
  } else if (role === 'volunteer') {
    await db.query(
      `INSERT INTO volunteer_profiles
        (user_id, full_name, phone_number, organization, skills, base_latitude, base_longitude, id_proof_ref, aadhaar_number, club_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        userId,
        formData.full_name ?? null,
        formData.phone_number ?? null,
        formData.organization ?? null,
        formData.skills ? JSON.stringify(formData.skills) : null,
        formData.base_latitude ?? null,
        formData.base_longitude ?? null,
        formData.id_proof_ref ?? null,
        formData.aadhaar_number ?? '',
        formData.club_id ?? null,
      ],
    )
  }
}