import type { Queryable } from '../../database/pool.js'

/** Statuses a police officer may hand a request to a named volunteer (BR-04). */
export const ASSIGNABLE_STATUSES = ['PENDING', 'MATCHING', 'DISPATCHED'] as const

export type AssignableStatus = (typeof ASSIGNABLE_STATUSES)[number]

export function isAssignableStatus(status: string): status is AssignableStatus {
  return (ASSIGNABLE_STATUSES as readonly string[]).includes(status)
}

export interface AssignableVolunteer {
  id: string
  email: string
  full_name: string | null
  phone_number: string | null
  organization: string | null
  skills: string[]
  is_available: boolean
  is_verified: boolean
  latitude: number | null
  longitude: number | null
  distance_m: number | null
  has_active_assignment: boolean
  active_request_id: string | null
  /** Everything P-05 checks, precomputed so the UI cannot drift from the rule. */
  can_assign: boolean
}

export interface VolunteerFilter {
  latitude?: number
  longitude?: number
  available?: boolean
  search?: string
  limit: number
}

/**
 * P-04: volunteers a police officer can dispatch to by hand.
 *
 * Ordering is "anyone who can actually take it", not "nearest". Volunteer
 * location is not trustworthy yet — `current_*` only exists once BR-09 lets a
 * volunteer update it during a job, and `base_*` is whatever was typed at
 * registration — so a distance sort would be false precision. Pass `lat`/`lng`
 * and the list comes back distance-ordered for when real positions arrive; see
 * `plans/deferred-before-production.md`.
 *
 * Off-duty volunteers and volunteers already on a job are still listed, with
 * `can_assign` false, so the UI can say why a row is refused instead of hiding
 * people.
 */
export async function listAssignableVolunteers(
  db: Queryable,
  filter: VolunteerFilter,
): Promise<{ volunteers: AssignableVolunteer[]; next_cursor: string | null }> {
  const params: unknown[] = []
  const where: string[] = [`u.role = 'volunteer'`, `u.is_active = true`]

  // Reused in both the SELECT and the ORDER BY so readiness cannot drift.
  const effLat = `COALESCE(
      CASE WHEN vp.location_updated_at > now() - interval '10 minutes' THEN vp.current_latitude END,
      vp.base_latitude
    )`
  const effLng = `COALESCE(
      CASE WHEN vp.location_updated_at > now() - interval '10 minutes' THEN vp.current_longitude END,
      vp.base_longitude
    )`
  const verified = `EXISTS (
    SELECT 1 FROM user_verifications uv
    WHERE uv.user_id = u.id AND uv.status = 'APPROVED'
  )`
  const onAJob = `EXISTS (
    SELECT 1 FROM help_requests hr
    WHERE hr.assigned_volunteer_id = u.id AND hr.status IN ('ACCEPTED','IN_PROGRESS')
  )`
  const canAssign = `(${verified} AND vp.is_available AND NOT (${onAJob}))`

  const hasCoords = filter.latitude !== undefined && filter.longitude !== undefined
  if (hasCoords) {
    params.push(filter.latitude, filter.longitude)
    where.push(`${effLat} IS NOT NULL`)
  }
  if (filter.available !== undefined) {
    params.push(filter.available)
    where.push(`vp.is_available = $${params.length}`)
  }
  if (filter.search) {
    params.push(`%${filter.search}%`)
    where.push(
      `(vp.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR vp.organization ILIKE $${params.length})`,
    )
  }

  const lat = hasCoords ? '$1' : 'NULL'
  const lng = hasCoords ? '$2' : 'NULL'
  const distance = hasCoords
    ? `6371000 * 2 * asin(sqrt(
         power(sin(radians((${effLat} - ${lat}) / 2)), 2) +
         cos(radians(${effLat})) * cos(radians(${lat})) *
         power(sin(radians((${effLng} - ${lng}) / 2)), 2)
       ))`
    : 'NULL::double precision'

  params.push(filter.limit)
  // Available-and-free first either way; distance only breaks ties when we
  // actually have a position to measure from.
  const orderBy = hasCoords
    ? `can_assign DESC, distance_m ASC NULLS LAST, vp.full_name ASC NULLS LAST`
    : `can_assign DESC, vp.full_name ASC NULLS LAST`

  const res = await db.query(
    `SELECT u.id, u.email,
            vp.full_name, vp.phone_number, vp.organization, vp.skills, vp.is_available,
            ${verified} AS is_verified,
            ${effLat} AS latitude, ${effLng} AS longitude,
            ${distance} AS distance_m,
            ${onAJob} AS has_active_assignment,
            (
              SELECT hr.id FROM help_requests hr
              WHERE hr.assigned_volunteer_id = u.id AND hr.status IN ('ACCEPTED','IN_PROGRESS')
              LIMIT 1
            ) AS active_request_id,
            ${canAssign} AS can_assign
     FROM volunteer_profiles vp
     JOIN users u ON u.id = vp.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT $${params.length}`,
    params,
  )

  return {
    volunteers: res.rows.map((r) => ({
      id: r.id,
      email: r.email,
      full_name: r.full_name,
      phone_number: r.phone_number,
      organization: r.organization,
      skills: Array.isArray(r.skills) ? r.skills : [],
      is_available: Boolean(r.is_available),
      is_verified: Boolean(r.is_verified),
      latitude: r.latitude === null ? null : Number(r.latitude),
      longitude: r.longitude === null ? null : Number(r.longitude),
      distance_m: r.distance_m === null ? null : Number(r.distance_m),
      has_active_assignment: Boolean(r.has_active_assignment),
      active_request_id: r.active_request_id ?? null,
      can_assign: Boolean(r.can_assign),
    })),
    next_cursor: null,
  }
}
