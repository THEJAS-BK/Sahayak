import { errors } from '../../lib/errors.js'
import { encodeCursor, decodeCursor } from '../../lib/pagination.js'
import type { Queryable } from '../../database/pool.js'

/**
 * Police read access to registered seniors.
 *
 * Separate from `senior_profiles` writes, which only the owning senior and the
 * registration flow touch. This is a read surface for the console, and it is
 * the only place a police officer sees another user's contact details.
 *
 * A senior is a `users` row with `role = 'senior'` and exactly one
 * `senior_profiles` row. A user can be `role = 'senior'` with no profile yet —
 * that is the window between approval and completing the form — so those users
 * are listed with `verification_status` set and null profile fields rather than
 * being hidden. An officer deciding whether to approve someone needs to see them.
 */

export interface SeniorListFilter {
  search?: string
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NONE'
  limit: number
  cursor?: string
}

const MAX_LIMIT = 200

function numeric(value: unknown): number | null {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? Number(value) : (value as number)
}

/** Newest first, matching the other police lists so the console feels uniform. */
export async function listSeniors(
  db: Queryable,
  filter: SeniorListFilter,
): Promise<{ seniors: unknown[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), MAX_LIMIT)
  const cursor = decodeCursor(filter.cursor)
  const params: unknown[] = []
  const where: string[] = [`u.role = 'senior'`]

  if (filter.search) {
    params.push(`%${filter.search}%`)
    where.push(
      `(sp.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR sp.phone_number ILIKE $${params.length})`,
    )
  }

  // verification_status is derived (a deliberate project decision: never stored),
  // so the filter has to be expressed against the same EXISTS the SELECT uses or
  // a filter would disagree with the rows it returns.
  const verified = `EXISTS (
    SELECT 1 FROM user_verifications uv
    WHERE uv.user_id = u.id AND uv.status = 'APPROVED'
  )`
  if (filter.status === 'NONE') {
    where.push(`NOT ${verified}`)
  } else if (filter.status) {
    params.push(filter.status)
    where.push(
      `EXISTS (SELECT 1 FROM user_verifications uv
               WHERE uv.user_id = u.id AND uv.status = $${params.length})`,
    )
  }

  if (cursor) {
    params.push(cursor.createdAt, cursor.id)
    where.push(
      `(u.created_at, u.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
    )
  }
  params.push(limit)

  const res = await db.query(
    `SELECT u.id, u.email, u.is_active, u.created_at,
            sp.full_name, sp.phone_number, sp.home_latitude, sp.home_longitude,
            sp.preferred_language,
            ${verified} AS is_verified,
            (SELECT uv.status FROM user_verifications uv
              WHERE uv.user_id = u.id ORDER BY uv.created_at DESC LIMIT 1) AS verification_status,
            (SELECT count(*)::int FROM help_requests hr WHERE hr.senior_id = u.id) AS request_count
     FROM users u
     LEFT JOIN senior_profiles sp ON sp.user_id = u.id
     WHERE ${where.join(' AND ')}
     ORDER BY u.created_at DESC, u.id DESC
     LIMIT $${params.length}`,
    params,
  )

  const rows = res.rows
  const next =
    rows.length === limit
      ? encodeCursor(rows[rows.length - 1].created_at, rows[rows.length - 1].id)
      : null

  return {
    seniors: rows.map((r) => ({
      id: r.id,
      email: r.email,
      is_active: Boolean(r.is_active),
      full_name: r.full_name,
      phone_number: r.phone_number,
      home_latitude: numeric(r.home_latitude),
      home_longitude: numeric(r.home_longitude),
      preferred_language: r.preferred_language,
      is_verified: Boolean(r.is_verified),
      verification_status: r.verification_status ?? 'NONE',
      request_count: r.request_count,
      created_at: r.created_at,
    })),
    next_cursor: next,
  }
}

/**
 * Full senior record for the console's profile page.
 *
 * Returns `null` rather than throwing 404 when the id belongs to a volunteer or
 * an unverified user: the route turns that into a 404, and a police officer
 * following a stale link should get "not found", not a leak that the account
 * exists but is of another role.
 */
export async function getSeniorDetail(
  db: Queryable,
  userId: string,
): Promise<Record<string, unknown> | null> {
  // The three derived fields below have to be computed exactly as listSeniors
  // computes them: the console renders the detail page from the same shape as
  // the list row, and a detail response missing `is_verified` /
  // `verification_status` / `request_count` shows an approved senior as
  // "not approved" with an empty badge.
  const senior = await db.query(
    `SELECT u.id, u.email, u.is_active, u.created_at,
            sp.full_name, sp.phone_number, sp.home_latitude, sp.home_longitude,
            sp.preferred_language, sp.emergency_contact, sp.aadhaar_number,
            EXISTS (SELECT 1 FROM user_verifications uv
                     WHERE uv.user_id = u.id AND uv.status = 'APPROVED') AS is_verified,
            (SELECT uv.status FROM user_verifications uv
              WHERE uv.user_id = u.id ORDER BY uv.created_at DESC LIMIT 1) AS verification_status,
            (SELECT count(*)::int FROM help_requests hr WHERE hr.senior_id = u.id) AS request_count
     FROM users u
     LEFT JOIN senior_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1 AND u.role = 'senior'`,
    [userId],
  )
  if (senior.rowCount === 0) return null
  const s = senior.rows[0]

  // Verification history newest first: the console needs to show what was
  // rejected and why, not just the current state.
  const verifications = await db.query(
    `SELECT uv.id, uv.role, uv.status, uv.review_reason, uv.reviewed_at, uv.created_at,
            uv.form_data,
            (SELECT email FROM users WHERE id = uv.reviewed_by) AS reviewer_email
     FROM user_verifications uv
     WHERE uv.user_id = $1
     ORDER BY uv.created_at DESC`,
    [userId],
  )

  const requests = await db.query(
    `SELECT hr.id, hr.category, hr.status, hr.priority, hr.created_at, hr.completed_at
     FROM help_requests hr
     WHERE hr.senior_id = $1
     ORDER BY hr.created_at DESC
     LIMIT 50`,
    [userId],
  )

  const emergencies = await db.query(
    `SELECT id, trigger_type, status, created_at
     FROM emergency_events
     WHERE senior_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId],
  )

  // Aadhaar is deliberately not returned. It is a government identifier, the
  // console has no use for it, and surfacing it would widen the blast radius of
  // a compromised police session for no benefit.
  return {
    id: s.id,
    email: s.email,
    is_active: Boolean(s.is_active),
    full_name: s.full_name,
    phone_number: s.phone_number,
    home_latitude: numeric(s.home_latitude),
    home_longitude: numeric(s.home_longitude),
    preferred_language: s.preferred_language,
    is_verified: Boolean(s.is_verified),
    verification_status: s.verification_status ?? 'NONE',
    request_count: s.request_count,
    emergency_contact: s.emergency_contact ?? null,
    created_at: s.created_at,
    verifications: verifications.rows.map((v) => ({
      id: v.id,
      role: v.role,
      status: v.status,
      review_reason: v.review_reason ?? null,
      reviewer_email: v.reviewer_email ?? null,
      reviewed_at: v.reviewed_at ?? null,
      created_at: v.created_at,
    })),
    requests: requests.rows,
    emergencies: emergencies.rows,
  }
}

export function assertSeniorExists(detail: Record<string, unknown> | null): Record<string, unknown> {
  if (!detail) throw errors.notFound('Senior not found')
  return detail
}
