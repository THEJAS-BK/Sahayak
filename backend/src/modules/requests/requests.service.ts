import { errors } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { writeAudit } from '../../database/audit.js'
import { config } from '../../config/index.js'
import type { Queryable } from '../../database/pool.js'
import { markDispatched } from '../matching/matching.service.js'
import { ACTIVE_STATUSES, ASSIGNMENT_STATUSES, canTransition, type RequestStatus } from './state.js'

export type RequestPriority = 'normal' | 'urgent'

export interface CreateRequestInput {
  category: string
  description: string
  details?: Record<string, unknown> | null
  latitude: number
  longitude: number
  priority: RequestPriority
  source: 'voice_agent' | 'flutter_app'
}

export interface CreateRequestResult {
  request_id: string
  /**
   * The status actually stored on the row. Dispatch is synchronous, so by the
   * time this returns the request is always DISPATCHED — it went through
   * PENDING inside the transaction and nobody can observe that. Reporting
   * PENDING here used to contradict both the database and the portal.
   */
  status: 'DISPATCHED'
  /** Volunteer ids offered the request. Empty when nobody was in range. */
  dispatched_to: string[]
  /**
   * False when dispatch found no candidate. The request is still live and
   * other volunteers may take it, so this is not an error — but nobody was
   * notified, and the caller has to say so rather than let the senior sit
   * waiting on a dispatch that never reached anyone.
   */
  notified: boolean
}

function numeric(value: unknown): number {
  return typeof value === 'string' ? Number(value) : (value as number)
}

export function shapeRow<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row }
  for (const key of Object.keys(out)) {
    const c: string = key.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase())
    if (c !== key) {
      out[c] = out[key]
      delete out[key]
    }
    if (c === 'latitude' || c === 'longitude') out[c] = numeric(out[c])
  }
  return out
}

/** Q-01 */
export async function createRequest(
  db: Queryable,
  userId: string,
  input: CreateRequestInput,
): Promise<CreateRequestResult> {
  const res = await db.query(
    `INSERT INTO help_requests
      (senior_id, category, description, details, latitude, longitude, priority, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, category, priority, latitude, longitude`,
    [
      userId,
      input.category,
      input.description,
      input.details ? JSON.stringify(input.details) : null,
      input.latitude,
      input.longitude,
      input.priority,
      input.source,
    ],
  )
  const request = res.rows[0]

  await writeAudit(db, {
    actorId: userId,
    action: 'request.created',
    entityType: 'help_request',
    entityId: request.id,
    after: {
      category: input.category,
      priority: input.priority,
      latitude: input.latitude,
      longitude: input.longitude,
      status: 'PENDING',
    },
  })

  const { candidate } = await markDispatched(
    db,
    { id: request.id, category: input.category, latitude: numeric(input.latitude), longitude: numeric(input.longitude), priority: input.priority },
    0,
  )

  await writeAudit(db, {
    actorId: null,
    action: 'request.dispatched',
    entityType: 'help_request',
    entityId: request.id,
    after: {
      status: 'DISPATCHED',
      dispatch_attempt: 0,
      dispatch_batch: candidate ? [candidate.id] : [],
    },
  })

  const dispatchedTo = candidate ? [candidate.id] : []

  if (dispatchedTo.length === 0) {
    logger.warn(
      { requestId: request.id, category: input.category, priority: input.priority },
      'dispatch found no volunteers in range; request is live but nobody was notified',
    )
  }

  return { request_id: request.id, status: 'DISPATCHED', dispatched_to: dispatchedTo, notified: dispatchedTo.length > 0 }
}

/**
 * Q-02 — a senior's own requests, or a volunteer's assignments.
 *
 * The volunteer's name rides along so the senior's list can answer "did
 * somebody accept, and who" without an extra request per row. Only the name:
 * the phone number stays behind Q-08, which gates on an active assignment.
 * Without this the app had to call Q-03 per row just to render a name.
 */
export async function listMyRequests(db: Queryable, user: { id: string; role: string }): Promise<unknown[]> {
  const where = user.role === 'senior' ? 'hr.senior_id = $1' : 'hr.assigned_volunteer_id = $1'
  const res = await db.query(
    `SELECT hr.*, vp.full_name AS assigned_volunteer_name
     FROM help_requests hr
     LEFT JOIN volunteer_profiles vp ON vp.user_id = hr.assigned_volunteer_id
     WHERE ${where}
     ORDER BY hr.created_at DESC`,
    [user.id],
  )
  return res.rows.map((r) => {
    const row = shapeRow(r)
    // The alias is only a carrier for the nested object below.
    delete row.assignedVolunteerName
    row.assigned_volunteer = r.assigned_volunteer_id
      ? { id: r.assigned_volunteer_id, full_name: r.assigned_volunteer_name ?? null }
      : null
    return row
  })
}

async function loadRequest(db: Queryable, id: string) {
  const res = await db.query(
    `SELECT hr.*, s.full_name AS senior_full_name, s.phone_number AS senior_phone, s.home_latitude, s.home_longitude,
            vp.full_name AS volunteer_full_name, vp.phone_number AS volunteer_phone, vp.organization, vp.skills
     FROM help_requests hr
     LEFT JOIN senior_profiles s ON s.user_id = hr.senior_id
     LEFT JOIN volunteer_profiles vp ON vp.user_id = hr.assigned_volunteer_id
     WHERE hr.id = $1`,
    [id],
  )
  if (res.rowCount === 0) return null
  return res.rows[0]
}

interface RequestRow {
  id: string
  senior_id: string
  assigned_volunteer_id: string | null
  status: string
  category: string
  description: string
  details: Record<string, unknown> | null
  latitude: string | number
  longitude: string | number
  priority: string
  source: string
  created_at: Date
  updated_at: Date
  accepted_at: Date | null
  completed_at: Date | null
  cancelled_at: Date | null
  dispatched_at: Date | null
  dispatch_attempt: number
  dispatch_batch: unknown
  senior_full_name: string | null
  senior_phone: string | null
  volunteer_full_name: string | null
  volunteer_phone: string | null
  volunteer_organization: string | null
  volunteer_skills: unknown
}

/**
 * Role-filtered projection (Q-03). Volunteer phone is exposed ONLY through
 * Q-08; senior phone is visible to the assigned volunteer and to police.
 */
function projectRequest(row: RequestRow, role: string): Record<string, unknown> {
  const base = {
    id: row.id,
    category: row.category,
    description: row.description,
    details: row.details,
    latitude: numeric(row.latitude),
    longitude: numeric(row.longitude),
    priority: row.priority,
    source: row.source,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    accepted_at: row.accepted_at,
    completed_at: row.completed_at,
    cancelled_at: row.cancelled_at,
    dispatched_at: row.dispatched_at,
    dispatch_attempt: row.dispatch_attempt,
  }

  if (role === 'senior') {
    return {
      ...base,
      senior: { id: row.senior_id },
      assigned_volunteer: row.assigned_volunteer_id
        ? { id: row.assigned_volunteer_id, full_name: row.volunteer_full_name }
        : null,
    }
  }

  if (role === 'volunteer') {
    return {
      ...base,
      senior: { id: row.senior_id, full_name: row.senior_full_name, phone_number: row.senior_phone },
    }
  }

  return {
    ...base,
    senior: { id: row.senior_id, full_name: row.senior_full_name, phone_number: row.senior_phone },
    assigned_volunteer: row.assigned_volunteer_id
      ? { id: row.assigned_volunteer_id, full_name: row.volunteer_full_name, phone_number: row.volunteer_phone }
      : null,
  }
}

/** Q-03. 404 for requests the caller has no relationship with (no leak). */
export async function getRequest(db: Queryable, user: { id: string; role: string }, id: string): Promise<unknown> {
  const row = (await loadRequest(db, id)) as RequestRow | null
  if (!row) throw errors.notFound('Request not found')

  const allowed =
    user.role === 'police' ||
    row.senior_id === user.id ||
    (user.role === 'volunteer' && row.assigned_volunteer_id === user.id)

  if (!allowed) throw errors.notFound('Request not found')
  return projectRequest(row, user.role)
}

/** Q-05: first-accept-wins via a single conditional UPDATE (BR-06). */
export async function acceptRequest(
  db: Queryable,
  user: { id: string },
  requestId: string,
): Promise<{ request_id: string; status: 'ACCEPTED' }> {
  const volunteer = await db.query(
    'SELECT vp.is_available FROM volunteer_profiles vp WHERE vp.user_id = $1',
    [user.id],
  )
  if (volunteer.rowCount === 0 || !volunteer.rows[0].is_available) {
    throw errors.forbidden('VOLUNTEER_UNAVAILABLE', 'You must be available to accept a request')
  }
  const active = await db.query(
    `SELECT 1 FROM help_requests WHERE assigned_volunteer_id = $1 AND status IN ('ACCEPTED', 'IN_PROGRESS')`,
    [user.id],
  )
  if ((active.rowCount ?? 0) > 0) {
    throw errors.forbidden('ALREADY_ON_REQUEST', 'You already have an active assignment (BR-05)')
  }

  const res = await db.query(
    `UPDATE help_requests
     SET status = 'ACCEPTED', assigned_volunteer_id = $1, accepted_at = now()
     WHERE id = $2 AND status = 'DISPATCHED'
     RETURNING id, senior_id`,
    [user.id, requestId],
  )
  if (res.rowCount === 0) {
    throw errors.conflict('ALREADY_ASSIGNED', 'This request is no longer available to accept')
  }
  const r = res.rows[0]

  await writeAudit(db, {
    actorId: user.id,
    action: 'request.accepted',
    entityType: 'help_request',
    entityId: r.id,
    before: { status: 'DISPATCHED' },
    after: { status: 'ACCEPTED', assigned_volunteer_id: user.id },
  })

  return { request_id: r.id, status: 'ACCEPTED' }
}

/**
 * Q-05 sibling: a volunteer turning down a request they were offered.
 *
 * This deliberately does NOT move the request out of DISPATCHED — other
 * volunteers can still take it, and the senior should not be told anything has
 * failed. What changes is that this volunteer stops being offered it, which is
 * what the previous in-app "skip" failed to do (it only hid the card in RAM, so
 * the request reappeared on the next refresh).
 *
 * Idempotent: declining twice is a no-op, not an error, because a double tap on
 * a phone is routine. Being police-assigned later still works — the offer is
 * explicit and outranks an earlier decline.
 */
export async function declineRequest(
  db: Queryable,
  user: { id: string },
  requestId: string,
  reason?: string,
): Promise<{ request_id: string; declined: true; already_declined: boolean }> {
  const res = await db.query(
    `SELECT hr.id, hr.status, hr.assigned_volunteer_id, hr.dispatch_batch
     FROM help_requests hr
     WHERE hr.id = $1
     FOR UPDATE OF hr`,
    [requestId],
  )
  if (res.rowCount === 0) throw errors.notFound('Request not found')
  const request = res.rows[0]

  if (request.status !== 'DISPATCHED') {
    throw errors.conflict(
      'NOT_DISPATCHED',
      request.assigned_volunteer_id === user.id
        ? 'You already accepted this request, so you cannot decline it'
        : 'This request is no longer open for new volunteers',
    )
  }

  // You may only decline what was actually offered to you.
  const offered =
    request.assigned_volunteer_id === user.id ||
    (Array.isArray(request.dispatch_batch) &&
      (request.dispatch_batch as Array<{ id: string }>).some((e) => e.id === user.id))
  if (!offered) {
    throw errors.forbidden('FORBIDDEN', 'This request was not offered to you')
  }

  const inserted = await db.query(
    `INSERT INTO request_declines (request_id, volunteer_id, reason)
     VALUES ($1, $2, $3)
     ON CONFLICT (request_id, volunteer_id) DO NOTHING
     RETURNING request_id`,
    [requestId, user.id, reason ?? null],
  )
  const alreadyDeclined = (inserted.rowCount ?? 0) === 0

  if (!alreadyDeclined) {
    // Release a police earmark (P-05). While the request is DISPATCHED,
    // `assigned_volunteer_id` only records who an officer picked — the
    // volunteer has not committed to anything and `accepted_at` is still null.
    // Keeping it would make the volunteer who just said no the permanent
    // assignee of a request nobody is coming to, and the "assignment outranks a
    // decline" override in Q-04 would keep showing them the card they rejected.
    const wasEarmarked = request.assigned_volunteer_id === user.id
    if (wasEarmarked) {
      await db.query(
        'UPDATE help_requests SET assigned_volunteer_id = NULL, updated_at = now() WHERE id = $1',
        [requestId],
      )
    }

    await writeAudit(db, {
      actorId: user.id,
      action: 'request.declined',
      entityType: 'help_request',
      entityId: requestId,
      before: { status: 'DISPATCHED', declined_by: null, assigned_volunteer_id: request.assigned_volunteer_id },
      after: { status: 'DISPATCHED', declined_by: user.id, reason: reason ?? null, assigned_volunteer_id: null },
    })
  }

  return { request_id: requestId, declined: true, already_declined: alreadyDeclined }
}

/** Q-06: ACCEPTED → IN_PROGRESS → COMPLETED, only by the assigned volunteer. */
export async function updateRequestStatus(
  db: Queryable,
  user: { id: string },
  requestId: string,
  target: 'IN_PROGRESS' | 'COMPLETED',
): Promise<{ request_id: string; status: 'IN_PROGRESS' | 'COMPLETED' }> {
  const res = await db.query(
    'SELECT status, assigned_volunteer_id FROM help_requests WHERE id = $1',
    [requestId],
  )
  if (res.rowCount === 0) throw errors.notFound('Request not found')
  const current = res.rows[0]

  if (current.assigned_volunteer_id !== user.id) {
    throw errors.forbidden('FORBIDDEN', 'Only the assigned volunteer can update this request')
  }
  if (!canTransition(current.status as RequestStatus, target)) {
    throw errors.invalidState(`Cannot transition request from ${current.status} to ${target}`)
  }

  const extra = target === 'COMPLETED' ? ', completed_at = now()' : ''
  const updated = await db.query(
    `UPDATE help_requests SET status = $1 ${extra} WHERE id = $2 RETURNING id, status, assigned_volunteer_id`,
    [target, requestId],
  )
  const r = updated.rows[0]

  await writeAudit(db, {
    actorId: user.id,
    action: `request.${target === 'IN_PROGRESS' ? 'in_progress' : 'completed'}`,
    entityType: 'help_request',
    entityId: r.id,
    before: { status: current.status },
    after: { status: target },
  })

  if (target === 'COMPLETED') {
    await db.query(
      `UPDATE volunteer_profiles
       SET current_latitude = NULL, current_longitude = NULL, location_updated_at = NULL
       WHERE user_id = $1`,
      [user.id],
    )
    await writeAudit(db, {
      actorId: user.id,
      action: 'volunteer.location_cleared',
      entityType: 'volunteer_profile',
      entityId: user.id,
      after: { current_latitude: null, current_longitude: null, location_updated_at: null },
    })
  }

  return { request_id: r.id, status: r.status }
}

/** Q-07: senior cancels only before ACCEPTED. */
export async function cancelRequest(
  db: Queryable,
  user: { id: string },
  requestId: string,
): Promise<{ request_id: string; status: 'CANCELLED' }> {
  const res = await db.query('SELECT status, senior_id FROM help_requests WHERE id = $1', [requestId])
  if (res.rowCount === 0) throw errors.notFound('Request not found')
  const row = res.rows[0]

  if (row.senior_id !== user.id) throw errors.forbidden('FORBIDDEN', 'Only the senior who created it can cancel')
  if (!canTransition(row.status as RequestStatus, 'CANCELLED')) {
    throw errors.invalidState(`Cannot cancel a request in state ${row.status}`)
  }

  const updated = await db.query(
    `UPDATE help_requests SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1 RETURNING id`,
    [requestId],
  )
  await writeAudit(db, {
    actorId: user.id,
    action: 'request.cancelled',
    entityType: 'help_request',
    entityId: requestId,
    before: { status: row.status },
    after: { status: 'CANCELLED' },
  })
  return { request_id: updated.rows[0].id, status: 'CANCELLED' }
}

/** Q-08: volunteer contact, only to the owning senior on an active request (BR-08). */
export async function getVolunteerContact(
  db: Queryable,
  user: { id: string },
  requestId: string,
): Promise<{ full_name: string; phone_number: string; organization: string | null; skills: string[] }> {
  const res = await db.query(
    `SELECT hr.senior_id, hr.status, hr.assigned_volunteer_id, vp.full_name, vp.phone_number, vp.organization, vp.skills
     FROM help_requests hr
     LEFT JOIN volunteer_profiles vp ON vp.user_id = hr.assigned_volunteer_id
     WHERE hr.id = $1`,
    [requestId],
  )
  if (res.rowCount === 0) throw errors.notFound('Request not found')
  const row = res.rows[0]

  if (row.senior_id !== user.id) throw errors.forbidden('FORBIDDEN', 'Only the owning senior can view this')
  if (!ASSIGNMENT_STATUSES.includes(row.status)) {
    throw errors.forbidden('REQUEST_NOT_ACTIVE', 'Volunteer contact is visible only after a volunteer is assigned')
  }
  if (!row.assigned_volunteer_id) throw errors.notFound('No volunteer assigned')

  return {
    full_name: row.full_name,
    phone_number: row.phone_number,
    organization: row.organization,
    skills: Array.isArray(row.skills) ? row.skills : [],
  }
}

/**
 * Q-04: DISPATCHED requests whose dispatch batch includes the caller.
 *
 * The radius is enforced here as well as at dispatch time. Dispatch already
 * picked these volunteers while they were in range, but the batch is a
 * snapshot: without re-checking distance, somebody offered a request at 4 km
 * keeps seeing it after walking to the other side of the city.
 */
export async function nearbyRequests(
  db: Queryable,
  user: { id: string },
  opts: { latitude: number; longitude: number; radiusM: number },
): Promise<unknown[]> {
  const res = await db.query(
    `WITH nearby AS (
       SELECT hr.id, hr.category, hr.description, hr.latitude, hr.longitude, hr.priority, hr.created_at,
              6371000 * 2 * asin(sqrt(
                power(sin(radians((hr.latitude - $1) / 2)), 2) +
                cos(radians(hr.latitude)) * cos(radians($1)) *
                power(sin(radians((hr.longitude - $2) / 2)), 2)
              )) AS distance_m
       FROM help_requests hr
       WHERE hr.status = 'DISPATCHED'
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(hr.dispatch_batch) e WHERE e->>'id' = $3)
         AND NOT EXISTS (SELECT 1 FROM help_requests mine WHERE mine.assigned_volunteer_id = $3::uuid AND mine.status IN ('ACCEPTED','IN_PROGRESS'))
         AND (
           -- A decline only hides the request from the volunteer who made it...
           NOT EXISTS (SELECT 1 FROM request_declines rd WHERE rd.request_id = hr.id AND rd.volunteer_id = $3::uuid)
           -- ...unless police assigned it to them by hand afterwards (P-05), which
           -- is an explicit human decision and outranks an earlier decline. A
           -- decline made *after* the assignment clears the earmark, so this can
           -- only ever resurrect a request declined before the officer stepped in.
           OR hr.assigned_volunteer_id = $3::uuid
         )
     )
     SELECT * FROM nearby WHERE distance_m <= $4 ORDER BY distance_m ASC LIMIT 50`,
    [opts.latitude, opts.longitude, user.id, opts.radiusM],
  )
  return res.rows.map((r) => ({
    id: r.id,
    category: r.category,
    description: r.description,
    latitude: numeric(r.latitude),
    longitude: numeric(r.longitude),
    priority: r.priority,
    created_at: r.created_at,
    distance_m: numeric(r.distance_m),
  }))
}

export async function countOpenRequestsForSenior(db: Queryable, seniorId: string): Promise<boolean> {
  const res = await db.query(
    `SELECT 1 FROM help_requests WHERE senior_id = $1 AND status = ANY($2) LIMIT 1`,
    [seniorId, ACTIVE_STATUSES],
  )
  return (res.rowCount ?? 0) > 0
}

export { ACTIVE_STATUSES }