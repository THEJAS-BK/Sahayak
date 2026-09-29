import type { Queryable } from '../../database/pool.js'

/**
 * P-08: the console's landing numbers.
 *
 * The Dashboard used to derive every tile from `GET /police/requests?limit=200`
 * and add up what came back. That is wrong twice over: 200 is a page size, not a
 * population, and the endpoint answers with the newest slice, so "completed
 * today" silently became "completed today among the newest 200 requests ever
 * created" — which is 0 for any station older than 200 requests. One aggregate
 * query per table is both correct and cheaper than shipping 200 rows to count
 * them on the client.
 *
 * Every count is a plain `COUNT(*)` against the same status columns the list
 * endpoints filter on, so a tile and the list behind it can never disagree.
 */

export interface PoliceOverview {
  /** P-01 statuses that still need a volunteer or an outcome. */
  open_requests: number
  /** DISPATCHED / ACCEPTED / IN_PROGRESS — somebody is on it right now. */
  active_operations: number
  /** Open requests nobody has taken yet. */
  unassigned_requests: number
  /** Open requests flagged urgent. */
  urgent_requests: number
  /** COMPLETED with `completed_at` inside the current local day. */
  completed_today: number
  /** E-02: SOS events still in the LOGGED queue. */
  emergencies_awaiting_review: number
  /** V-01: registrations waiting on an officer. */
  verifications_pending: number
  /** Volunteers approved, on duty and not already on a job. */
  volunteers_available: number
  /** When this snapshot was taken, so the console can say so honestly. */
  generated_at: string
}

function count(value: unknown): number {
  return typeof value === 'string' ? Number(value) : ((value as number) ?? 0)
}

/**
 * `completed_today` is bounded by the request body rather than by
 * `now()::date`: a Neon connection runs in UTC, so an officer in IST reading
 * the tile at 07:00 would see yesterday's completions. The console sends its
 * own day start and end and the counts agree with the filters on the list page.
 */
export function getPoliceOverview(
  db: Queryable,
  window: { todayStart: Date; todayEnd: Date },
): Promise<PoliceOverview> {
  const requests = db.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE hr.status IN ('PENDING','MATCHING','DISPATCHED','ACCEPTED','IN_PROGRESS')
       ) AS open_requests,
       COUNT(*) FILTER (
         WHERE hr.status IN ('DISPATCHED','ACCEPTED','IN_PROGRESS')
       ) AS active_operations,
       COUNT(*) FILTER (
         WHERE hr.status IN ('PENDING','MATCHING') AND hr.assigned_volunteer_id IS NULL
       ) AS unassigned_requests,
       COUNT(*) FILTER (
         WHERE hr.priority = 'urgent'
           AND hr.status IN ('PENDING','MATCHING','DISPATCHED','ACCEPTED','IN_PROGRESS')
       ) AS urgent_requests,
       COUNT(*) FILTER (
         WHERE hr.status = 'COMPLETED' AND hr.completed_at >= $1 AND hr.completed_at < $2
       ) AS completed_today
     FROM help_requests hr`,
    [window.todayStart, window.todayEnd],
  )

  const emergencies = db.query(
    `SELECT COUNT(*) AS awaiting_review FROM emergency_events WHERE status = 'LOGGED'`,
  )

  const verifications = db.query(
    `SELECT COUNT(*) AS pending FROM user_verifications WHERE status = 'PENDING'`,
  )

  // Mirrors the `can_assign` verdict in volunteers.service.ts: approved, on
  // duty, no job in flight. A volunteer unapproved for a month is on neither
  // this tile nor the assignable list, so the two agree by construction.
  const volunteers = db.query(
    `SELECT COUNT(*) AS available
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
         WHERE hr.assigned_volunteer_id = u.id
           AND hr.status IN ('ACCEPTED','IN_PROGRESS')
       )`,
  )

  return Promise.all([requests, emergencies, verifications, volunteers]).then(
    ([req, emg, ver, vol]) => ({
      open_requests: count(req.rows[0].open_requests),
      active_operations: count(req.rows[0].active_operations),
      unassigned_requests: count(req.rows[0].unassigned_requests),
      urgent_requests: count(req.rows[0].urgent_requests),
      completed_today: count(req.rows[0].completed_today),
      emergencies_awaiting_review: count(emg.rows[0].awaiting_review),
      verifications_pending: count(ver.rows[0].pending),
      volunteers_available: count(vol.rows[0].available),
      generated_at: new Date().toISOString(),
    }),
  )
}
