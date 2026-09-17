import { errors } from '../../lib/errors.js'
import { encodeCursor, decodeCursor } from '../../lib/pagination.js'
import type { Queryable } from '../../database/pool.js'

export interface PoliceRequestFilter {
  status?: string
  priority?: string
  from?: string
  to?: string
  limit?: number
  cursor?: string
}

const MAX_LIMIT = 200

function numeric(value: unknown): number {
  return typeof value === 'string' ? Number(value) : (value as number)
}

/** P-01: police-only live view with full PII (senior + assigned volunteer). */
export async function listPoliceRequests(
  db: Queryable,
  filter: PoliceRequestFilter,
): Promise<{ requests: unknown[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), MAX_LIMIT)
  const cursor = decodeCursor(filter.cursor)

  const params: unknown[] = []
  const where: string[] = []

  if (filter.status) {
    params.push(filter.status)
    where.push(`hr.status = $${params.length}`)
  }
  if (filter.priority) {
    params.push(filter.priority)
    where.push(`hr.priority = $${params.length}`)
  }
  if (filter.from) {
    params.push(filter.from)
    where.push(`hr.created_at >= $${params.length}::timestamptz`)
  }
  if (filter.to) {
    params.push(filter.to)
    where.push(`hr.created_at <= $${params.length}::timestamptz`)
  }
  if (cursor) {
    params.push(cursor.createdAt, cursor.id)
    where.push(`(hr.created_at, hr.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`)
  }
  params.push(limit)

  const sql = `
    SELECT hr.*, u.email AS senior_email,
           s.full_name AS senior_full_name, s.phone_number AS senior_phone, s.home_latitude, s.home_longitude,
           vp.full_name AS volunteer_full_name, vp.phone_number AS volunteer_phone, vp.organization
    FROM help_requests hr
    JOIN users u ON u.id = hr.senior_id
    LEFT JOIN senior_profiles s ON s.user_id = hr.senior_id
    LEFT JOIN volunteer_profiles vp ON vp.user_id = hr.assigned_volunteer_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY hr.created_at DESC, hr.id DESC
    LIMIT $${params.length}`

  const res = await db.query(sql, params)
  const rows = res.rows
  const next =
    rows.length === limit ? encodeCursor(rows[rows.length - 1].created_at, rows[rows.length - 1].id) : null

  const requests = rows.map((r) => ({
    id: r.id,
    category: r.category,
    description: r.description,
    details: r.details,
    latitude: numeric(r.latitude),
    longitude: numeric(r.longitude),
    priority: r.priority,
    source: r.source,
    status: r.status,
    dispatch_attempt: r.dispatch_attempt,
    dispatch_batch: r.dispatch_batch,
    created_at: r.created_at,
    updated_at: r.updated_at,
    dispatched_at: r.dispatched_at,
    accepted_at: r.accepted_at,
    completed_at: r.completed_at,
    cancelled_at: r.cancelled_at,
    senior: {
      id: r.senior_id,
      email: r.senior_email,
      full_name: r.senior_full_name,
      phone_number: r.senior_phone,
    },
    assigned_volunteer: r.assigned_volunteer_id
      ? {
          id: r.assigned_volunteer_id,
          full_name: r.volunteer_full_name,
          phone_number: r.volunteer_phone,
          organization: r.organization,
        }
      : null,
  }))

  return { requests, next_cursor: next }
}