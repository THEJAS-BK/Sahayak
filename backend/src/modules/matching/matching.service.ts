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
  /** The one volunteer this request is now waiting on, or null if nobody was. */
  candidate: Candidate | null
  dispatched: boolean
}

/**
 * Picks the single best available volunteer for a request (BR-02, BR-05).
 *
 * Haversine distance is computed in SQL behind a bounding-box prefilter.
 * Location = fresh `current_*` (< 10 min) else `base_*`, via COALESCE. Urgent
 * doubles the radius.
 *
 * A request is offered to ONE volunteer, not a fan-out. The nearest eligible
 * volunteer wins; `skills` only breaks a distance tie. The previous design
 * notified up to `DISPATCH_BATCH_SIZE` volunteers at once and let the first to
 * accept take it, which meant the same request was pushed at several phones for
 * one job, and whoever happened to be awake won it rather than whoever was
 * closest. Offering it to one person keeps the notification honest: exactly one
 * phone is told, and that is the phone the senior is waiting on.
 *
 * Eligibility is unchanged, and is the whole safety of this function: an active
 * user, an APPROVED verification, currently on duty, not already mid-job, and
 * inside the radius.
 */
export async function findBestCandidate(
  db: Queryable,
  opts: {
    latitude: number
    longitude: number
    radiusM: number
    category: string
    excludeIds?: string[]
  },
): Promise<Candidate | null> {
  const radius = Math.max(opts.radiusM, 100)

  // Bounding box prefilter (110km per degree lat, ~111km·cos(lat) per degree lng).
  const dLat = radius / 111000
  const dLng = radius / (111000 * Math.max(Math.cos((opts.latitude * Math.PI) / 180), 0.1))

  const params: unknown[] = [opts.latitude, opts.longitude, opts.category, dLat, dLng, radius]
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
    LIMIT 1
    `,
    params,
  )

  const row = res.rows[0]
  if (!row) return null

  return {
    id: row.id,
    fcmToken: row.fcm_token,
    distanceM: Number(row.distance_m),
    skillMatch: Boolean(row.skill_match),
    latitude: Number(row.lat),
    longitude: Number(row.lng),
  }
}

/**
 * Marks a request DISPATCHED to one volunteer, and records them as the batch.
 * Caller commits; the returned candidate fuels the post-commit notification.
 *
 * `dispatch_batch` stays a JSONB array because it is load-bearing well beyond
 * this module: Q-04 (`/nearby`) gates on membership, accept and decline check
 * it, and the police directory reads it for assignment history. It simply holds
 * one entry now — the volunteer being waited on — rather than a fan-out.
 *
 * On a retry, `excludeIds` names the volunteer already tried so the next sweep
 * moves to somebody else instead of re-notifying the same phone. When no fresh
 * volunteer turns up, the previous batch is left intact rather than cleared: the
 * volunteer it names is still entitled to accept, and blanking it would drop the
 * request out of `/nearby` for everyone and leave it stranded in DISPATCHED.
 *
 * `onlyIfCandidate` is for the recovery sweep, which is polling rather than
 * dispatching: with it set, finding nobody leaves the row untouched. Without it
 * an `UNASSIGNED` request would be rewritten to `DISPATCHED` before anyone was
 * available, which reads as "help is on the way" when nobody was ever told.
 */
export async function markDispatched(
  db: Queryable,
  request: { id: string; category: string; latitude: number; longitude: number; priority: 'normal' | 'urgent' },
  attempt: number,
  opts: { excludeIds?: string[]; onlyIfCandidate?: boolean } = {},
): Promise<DispatchResult> {
  const radius = request.priority === 'urgent' ? config.matching.radiusM * 2 : config.matching.radiusM
  const candidate = await findBestCandidate(db, {
    latitude: request.latitude,
    longitude: request.longitude,
    radiusM: radius,
    category: request.category,
    excludeIds: opts.excludeIds,
  })

  if (!candidate && opts.onlyIfCandidate) {
    return { candidate: null, dispatched: false }
  }

  const prior = await db.query(
    'SELECT dispatch_batch FROM help_requests WHERE id = $1',
    [request.id],
  )
  const priorBatch: unknown[] =
    prior.rowCount && Array.isArray(prior.rows[0].dispatch_batch) ? (prior.rows[0].dispatch_batch as unknown[]) : []

  // No fresh volunteer: keep whoever was already offered it.
  const batch = candidate
    ? [{ id: candidate.id, latitude: candidate.latitude, longitude: candidate.longitude, distance_m: candidate.distanceM }]
    : priorBatch

  await db.query(
    `UPDATE help_requests
     SET status = 'DISPATCHED', dispatch_attempt = $2, dispatched_at = now(), dispatch_batch = $3
     WHERE id = $1`,
    [request.id, attempt, JSON.stringify(batch)],
  )

  return { candidate, dispatched: batch.length > 0 }
}
