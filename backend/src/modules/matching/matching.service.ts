import { config } from '../../config/index.js'
import type { Queryable } from '../../database/pool.js'

export interface Candidate {
  id: string
  fcmToken: string | null
  distanceM: number
  skillMatch: boolean
  latitude: number
  longitude: number
}

export interface DispatchResult {
  candidates: Candidate[]
  dispatched: boolean
}

/**
 * Candidate selection (BR-02, BR-05) + Haversine distance in SQL with a
 * bounding-box prefilter. Location = fresh `current_*` (< 10 min) else
 * `base_*`, via COALESCE. Urgent doubles the radius.
 */
export async function findCandidates(
  db: Queryable,
  opts: { latitude: number; longitude: number; radiusM: number; category: string; limit: number; excludeIds?: string[] },
): Promise<Candidate[]> {
  const radius = Math.max(opts.radiusM, 100)

  // Bounding box prefilter (110km per degree lat, ~111km·cos(lat) per degree lng).
  const dLat = radius / 111000
  const dLng = radius / (111000 * Math.max(Math.cos((opts.latitude * Math.PI) / 180), 0.1))

  const params: unknown[] = [opts.latitude, opts.longitude, opts.category, dLat, dLng, radius, opts.limit]
  let excludeSql = ''
  if (opts.excludeIds && opts.excludeIds.length > 0) {
    params.push(opts.excludeIds)
    excludeSql = ` AND NOT (u.id = ANY($${params.length}::uuid[]))`
  }

  const res = await db.query(
    `
    WITH candidates AS (
      SELECT
        u.id,
        u.fcm_token,
        COALESCE(
          CASE WHEN vp.location_updated_at > now() - interval '10 minutes' THEN vp.current_latitude END,
          vp.base_latitude
        ) AS lat,
        COALESCE(
          CASE WHEN vp.location_updated_at > now() - interval '10 minutes' THEN vp.current_longitude END,
          vp.base_longitude
        ) AS lng,
        vp.skills,
        6371000 * 2 * asin(sqrt(
          power(sin(radians((COALESCE(CASE WHEN vp.location_updated_at > now() - interval '10 minutes' THEN vp.current_latitude END, vp.base_latitude) - $1) / 2)), 2) +
          cos(radians(COALESCE(CASE WHEN vp.location_updated_at > now() - interval '10 minutes' THEN vp.current_latitude END, vp.base_latitude))) *
          cos(radians($1)) *
          power(sin(radians((COALESCE(CASE WHEN vp.location_updated_at > now() - interval '10 minutes' THEN vp.current_longitude END, vp.base_longitude) - $2) / 2)), 2)
        )) AS distance_m
      FROM volunteer_profiles vp
      JOIN users u ON u.id = vp.user_id
      WHERE u.is_active = true
        AND vp.is_available = true
        AND EXISTS (
          SELECT 1 FROM user_verifications uv
          WHERE uv.user_id = u.id AND uv.status = 'APPROVED'
        )
        AND NOT EXISTS (
          SELECT 1 FROM help_requests hr
          WHERE hr.assigned_volunteer_id = u.id AND hr.status IN ('ACCEPTED', 'IN_PROGRESS')
        )${excludeSql}
    )
    SELECT c.id, c.fcm_token, c.distance_m, (c.skills ? $3) AS skill_match, c.lat, c.lng
    FROM candidates c
    WHERE c.lat BETWEEN ($1 - $4) AND ($1 + $4)
      AND c.lng BETWEEN ($2 - $5) AND ($2 + $5)
      AND c.distance_m <= $6
    ORDER BY c.distance_m ASC, skill_match DESC, c.id
    LIMIT $7
    `,
    params,
  )

  return res.rows.map((r) => ({
    id: r.id,
    fcmToken: r.fcm_token,
    distanceM: Number(r.distance_m),
    skillMatch: Boolean(r.skill_match),
    latitude: Number(r.lat),
    longitude: Number(r.lng),
  }))
}

/**
 * Marks a request DISPATCHED and records the batch entries (id + position
 * snapshot + distance). Caller commits; the returned candidates fuel the
 * post-commit FCM fan-out.
 *
 * The batch is CUMULATIVE. Q-04 gates on membership, so overwriting it with
 * only the newly-found candidates would silently un-offer the request to
 * everyone who was already notified. `excludeIds` therefore only controls who
 * gets a *fresh notification* on a retry; it never removes anyone from the
 * batch. Re-dispatching with the previous batch excluded used to erase the
 * batch on the first sweep and leave the request with nobody able to accept it.
 */
export async function markDispatched(
  db: Queryable,
  request: { id: string; category: string; latitude: number; longitude: number; priority: 'normal' | 'urgent' },
  attempt: number,
  opts: { excludeIds?: string[] } = {},
): Promise<DispatchResult> {
  const radius = request.priority === 'urgent' ? config.matching.radiusM * 2 : config.matching.radiusM
  const candidates = await findCandidates(db, {
    latitude: request.latitude,
    longitude: request.longitude,
    radiusM: radius,
    category: request.category,
    limit: config.matching.batchSize,
    excludeIds: opts.excludeIds,
  })

  const prior = await db.query(
    'SELECT dispatch_batch FROM help_requests WHERE id = $1',
    [request.id],
  )
  const priorBatch: unknown[] =
    prior.rowCount && Array.isArray(prior.rows[0].dispatch_batch) ? (prior.rows[0].dispatch_batch as unknown[]) : []

  const batch = [...priorBatch]
  const seen = new Set(
    priorBatch.map((e) => (e as { id?: string })?.id).filter((id): id is string => typeof id === 'string'),
  )
  for (const c of candidates) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    batch.push({
      id: c.id,
      latitude: c.latitude,
      longitude: c.longitude,
      distance_m: c.distanceM,
    })
  }

  await db.query(
    `UPDATE help_requests
     SET status = 'DISPATCHED', dispatch_attempt = $2, dispatched_at = now(), dispatch_batch = $3
     WHERE id = $1`,
    [request.id, attempt, JSON.stringify(batch)],
  )

  return { candidates, dispatched: batch.length > 0 }
}