import { errors } from '../../lib/errors.js'
import { writeAudit } from '../../database/audit.js'
import { encodeCursor, decodeCursor } from '../../lib/pagination.js'
import type { Queryable } from '../../database/pool.js'

export type TriggerType = 'semantic_llm' | 'acoustic_distress' | 'keyword_repetition'
export type EmergencyStatus = 'LOGGED' | 'REVIEWED'

export interface CreateEmergencyInput {
  trigger_type: TriggerType
  source: 'voice_agent' | 'flutter_app'
  help_request_id?: string | null
  detail?: Record<string, unknown> | null
  latitude?: number | null
  longitude?: number | null
}

/** E-01 (BR-11): emergencies are logged independently of request lifecycle. */
export async function createEmergency(
  db: Queryable,
  seniorId: string,
  input: CreateEmergencyInput,
): Promise<{ event_id: string; status: EmergencyStatus; escalated_to_112: true }> {
  if (input.help_request_id) {
    const hr = await db.query('SELECT id FROM help_requests WHERE id = $1 AND senior_id = $2', [
      input.help_request_id,
      seniorId,
    ])
    if (hr.rowCount === 0) {
      throw errors.badRequest('help_request_id does not exist or does not belong to you')
    }
  }

  const res = await db.query(
    `INSERT INTO emergency_events
      (senior_id, trigger_type, source, help_request_id, detail, latitude, longitude,
       escalated_to_112, escalated_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true, now(), 'LOGGED')
     RETURNING id, status, escalated_to_112`,
    [
      seniorId,
      input.trigger_type,
      input.source,
      input.help_request_id ?? null,
      input.detail ? JSON.stringify(input.detail) : null,
      input.latitude ?? null,
      input.longitude ?? null,
    ],
  )
  const r = res.rows[0]

  await writeAudit(db, {
    actorId: seniorId,
    action: 'emergency.created',
    entityType: 'emergency_event',
    entityId: r.id,
    after: {
      trigger_type: input.trigger_type,
      source: input.source,
      escalated_to_112: true,
      status: 'LOGGED',
    },
  })

  return { event_id: r.id, status: r.status, escalated_to_112: r.escalated_to_112 }
}

export interface EmergencyListFilter {
  status?: string
  senior_id?: string
  from?: string
  to?: string
  limit?: number
  cursor?: string
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? Number(value) : (value as number)
}

/** E-02: police-only emergency event feed with full context. */
export async function listEmergencyEvents(
  db: Queryable,
  filter: EmergencyListFilter,
): Promise<{ events: unknown[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200)
  const cursor = decodeCursor(filter.cursor)
  const params: unknown[] = []
  const where: string[] = []

  if (filter.status) {
    params.push(filter.status)
    where.push(`ee.status = $${params.length}`)
  }
  if (filter.senior_id) {
    params.push(filter.senior_id)
    where.push(`ee.senior_id = $${params.length}::uuid`)
  }
  if (filter.from) {
    params.push(filter.from)
    where.push(`ee.created_at >= $${params.length}::timestamptz`)
  }
  if (filter.to) {
    params.push(filter.to)
    where.push(`ee.created_at <= $${params.length}::timestamptz`)
  }
  if (cursor) {
    params.push(cursor.createdAt, cursor.id)
    where.push(`(ee.created_at, ee.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`)
  }
  params.push(limit)

  const sql = `
    SELECT ee.*, u.email AS senior_email,
           s.full_name AS senior_full_name, s.phone_number AS senior_phone
    FROM emergency_events ee
    JOIN users u ON u.id = ee.senior_id
    LEFT JOIN senior_profiles s ON s.user_id = ee.senior_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ee.created_at DESC, ee.id DESC
    LIMIT $${params.length}`

  const res = await db.query(sql, params)
  const rows = res.rows
  const next =
    rows.length === limit ? encodeCursor(rows[rows.length - 1].created_at, rows[rows.length - 1].id) : null

  const events = rows.map((r) => ({
    id: r.id,
    senior_id: r.senior_id,
    trigger_type: r.trigger_type,
    source: r.source,
    help_request_id: r.help_request_id,
    detail: r.detail,
    latitude: numeric(r.latitude),
    longitude: numeric(r.longitude),
    escalated_to_112: r.escalated_to_112,
    escalated_at: r.escalated_at,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    senior: {
      id: r.senior_id,
      email: r.senior_email,
      full_name: r.senior_full_name,
      phone_number: r.senior_phone,
    },
  }))

  return { events, next_cursor: next }
}

/** E-03: LOGGED → REVIEWED. */
export async function reviewEmergency(
  db: Queryable,
  eventId: string,
  policeId: string,
): Promise<{ event_id: string; status: 'REVIEWED' }> {
  const res = await db.query('SELECT status FROM emergency_events WHERE id = $1', [eventId])
  if (res.rowCount === 0) throw errors.notFound('Emergency event not found')
  const current = res.rows[0].status as EmergencyStatus
  if (current !== 'LOGGED') {
    throw errors.invalidState('Only LOGGED events can be reviewed')
  }

  await db.query('UPDATE emergency_events SET status = $1 WHERE id = $2', ['REVIEWED', eventId])
  await writeAudit(db, {
    actorId: policeId,
    action: 'emergency.reviewed',
    entityType: 'emergency_event',
    entityId: eventId,
    before: { status: 'LOGGED' },
    after: { status: 'REVIEWED' },
  })

  return { event_id: eventId, status: 'REVIEWED' }
}