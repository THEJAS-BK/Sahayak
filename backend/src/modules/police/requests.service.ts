import { errors } from '../../lib/errors.js'
import { encodeCursor, decodeCursor } from '../../lib/pagination.js'
import { writeAudit } from '../../database/audit.js'
import type { Queryable } from '../../database/pool.js'
import { ASSIGNABLE_STATUSES, isAssignableStatus } from './volunteers.service.js'

/** Great-circle distance, mirroring the haversine used in the matcher. */
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(a))
}

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
    image_url: r.image_url ?? null,
    has_photo: r.image_url != null,
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
export interface PoliceAssignmentResult {
  request_id: string
  status: 'DISPATCHED'
  category: string
  volunteer: { id: string; full_name: string | null; phone_number: string | null; email: string }
  senior: { id: string; full_name: string | null; phone_number: string | null; email: string }
  /**
   * Device push tokens for the two people involved, kept out of the HTTP body.
   * A push token is a delivery credential for someone's device; the police
   * console has no use for it, and the console is a browser. The route passes
   * this to the notifier and responds with everything else.
   */
  notify: {
    volunteer: { email: string; fcmToken: string | null; fullName: string | null }
    senior: { email: string; fcmToken: string | null }
  }
}

/**
 * P-03: a police officer hands a request to one named volunteer.
 *
 * The volunteer still has to accept it, so the request only reaches DISPATCHED
 * and `accepted_at` stays null — police chooses who gets asked, the volunteer
 * decides whether to take it on. Assigning adds the volunteer to
 * `dispatch_batch`, without which Q-04 would never surface the request to them.
 *
 * What police may override is the matcher's radius and batch size, not the
 * volunteer's own availability: Q-05 would refuse the accept, so an off-duty
 * volunteer is rejected rather than handed a request they cannot take.
 *
 * Volunteers are listed ready-first rather than nearest-first because volunteer
 * coordinates are not trustworthy yet — see `plans/deferred-before-production.md`
 * §2 and P-04.
 */
export async function assignRequestToVolunteer(
  db: Queryable,
  police: { id: string },
  requestId: string,
  volunteerId: string,
): Promise<PoliceAssignmentResult> {
  const reqRes = await db.query(
    `SELECT hr.id, hr.status, hr.category, hr.latitude, hr.longitude, hr.dispatch_batch,
            hr.assigned_volunteer_id,
            u.id AS senior_id, u.email AS senior_email, u.fcm_token AS senior_fcm,
            s.full_name AS senior_name, s.phone_number AS senior_phone
     FROM help_requests hr
     JOIN users u ON u.id = hr.senior_id
     LEFT JOIN senior_profiles s ON s.user_id = hr.senior_id
     WHERE hr.id = $1
     FOR UPDATE OF hr`,
    [requestId],
  )
  if (reqRes.rowCount === 0) throw errors.notFound('Request not found')
  const request = reqRes.rows[0]

  if (!isAssignableStatus(request.status)) {
    if (request.assigned_volunteer_id) {
      throw errors.conflict(
        'ALREADY_ASSIGNED',
        `This request is ${request.status} and a volunteer is already on it`,
      )
    }
    throw errors.conflict(
      'INVALID_STATUS',
      `A request can only be assigned while it is ${ASSIGNABLE_STATUSES.join(', ')} (it is ${request.status})`,
    )
  }

  const volRes = await db.query(
    `SELECT u.id, u.email, u.is_active, u.fcm_token, u.role,
            vp.full_name, vp.phone_number, vp.is_available,
            COALESCE(
              CASE WHEN vp.location_updated_at > now() - interval '10 minutes' THEN vp.current_latitude END,
              vp.base_latitude
            ) AS latitude,
            COALESCE(
              CASE WHEN vp.location_updated_at > now() - interval '10 minutes' THEN vp.current_longitude END,
              vp.base_longitude
            ) AS longitude,
            EXISTS (
              SELECT 1 FROM user_verifications uv
              WHERE uv.user_id = u.id AND uv.status = 'APPROVED'
            ) AS is_verified,
            (
              SELECT hr.id FROM help_requests hr
              WHERE hr.assigned_volunteer_id = u.id AND hr.status IN ('ACCEPTED','IN_PROGRESS')
                AND hr.id <> $1
              LIMIT 1
            ) AS other_active_request_id
     FROM users u
     LEFT JOIN volunteer_profiles vp ON vp.user_id = u.id
     WHERE u.id = $2`,
    [requestId, volunteerId],
  )
  if (volRes.rowCount === 0) throw errors.notFound('Volunteer not found')
  const volunteer = volRes.rows[0]

  if (volunteer.role !== 'volunteer' || !volunteer.is_active) {
    throw errors.badRequest('That user is not an active volunteer')
  }
  if (!volunteer.is_verified) {
    throw errors.conflict('NOT_VERIFIED', 'That volunteer has not been approved yet')
  }
  // Q-05 refuses an accept from a volunteer who is off duty, so handing the
  // request to one would strand the senior with a request nobody can take.
  if (!volunteer.is_available) {
    throw errors.conflict(
      'VOLUNTEER_UNAVAILABLE',
      'That volunteer is off duty and could not accept the request',
    )
  }
  if (volunteer.other_active_request_id) {
    throw errors.conflict('ALREADY_ON_REQUEST', 'That volunteer is already on an active assignment (BR-05)')
  }

  const distanceM =
    volunteer.latitude === null || volunteer.longitude === null
      ? null
      : haversineM(
          numeric(request.latitude),
          numeric(request.longitude),
          Number(volunteer.latitude),
          Number(volunteer.longitude),
        )

  const existing: unknown[] = Array.isArray(request.dispatch_batch) ? (request.dispatch_batch as unknown[]) : []
  const batch = existing.filter(
    (e) => (e as { id?: string })?.id !== volunteerId,
  )
  batch.push({
    id: volunteerId,
    latitude: volunteer.latitude === null ? null : Number(volunteer.latitude),
    longitude: volunteer.longitude === null ? null : Number(volunteer.longitude),
    distance_m: distanceM === null ? null : Math.round(distanceM),
  })

  await db.query(
    `UPDATE help_requests
     SET status = 'DISPATCHED',
         assigned_volunteer_id = $2,
         dispatch_batch = $3,
         dispatched_at = COALESCE(dispatched_at, now()),
         updated_at = now()
     WHERE id = $1`,
    [requestId, volunteerId, JSON.stringify(batch)],
  )

  await writeAudit(db, {
    actorId: police.id,
    action: 'request.assigned_by_police',
    entityType: 'help_request',
    entityId: requestId,
    before: { status: request.status, assigned_volunteer_id: request.assigned_volunteer_id },
    after: { status: 'DISPATCHED', assigned_volunteer_id: volunteerId, distance_m: distanceM },
  })

  return {
    request_id: requestId,
    status: 'DISPATCHED',
    category: request.category,
    volunteer: {
      id: volunteer.id,
      full_name: volunteer.full_name,
      phone_number: volunteer.phone_number,
      email: volunteer.email,
    },
    senior: {
      id: request.senior_id,
      full_name: request.senior_name,
      phone_number: request.senior_phone,
      email: request.senior_email,
    },
    notify: {
      volunteer: {
        email: volunteer.email,
        fcmToken: volunteer.fcm_token,
        fullName: volunteer.full_name,
      },
      senior: { email: request.senior_email, fcmToken: request.senior_fcm },
    },
  }
}
