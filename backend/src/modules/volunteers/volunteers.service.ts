import { errors } from '../../lib/errors.js'
import { writeAudit } from '../../database/audit.js'
import type { Queryable } from '../../database/pool.js'

/** L-01 (BR-09): live location writable only while on an active assignment. */
export async function updateVolunteerLocation(
  db: Queryable,
  userId: string,
  input: { latitude: number; longitude: number },
): Promise<{ latitude: number; longitude: number; updated_at: string }> {
  const active = await db.query(
    `SELECT 1 FROM help_requests
     WHERE assigned_volunteer_id = $1 AND status IN ('ACCEPTED', 'IN_PROGRESS') LIMIT 1`,
    [userId],
  )
  if ((active.rowCount ?? 0) === 0) {
    throw errors.forbidden(
      'NO_ACTIVE_ASSIGNMENT',
      'Location updates are only allowed while you have an active assignment (BR-09)',
    )
  }

  await db.query(
    `UPDATE volunteer_profiles
     SET current_latitude = $1, current_longitude = $2, location_updated_at = now()
     WHERE user_id = $3`,
    [input.latitude, input.longitude, userId],
  )

  await writeAudit(db, {
    actorId: userId,
    action: 'volunteer.location_updated',
    entityType: 'volunteer_profile',
    entityId: userId,
    after: { latitude: input.latitude, longitude: input.longitude },
  })

  return { latitude: input.latitude, longitude: input.longitude, updated_at: new Date().toISOString() }
}

/** L-02 (BR-02): toggle availability for matching. */
export async function setVolunteerAvailability(
  db: Queryable,
  userId: string,
  isAvailable: boolean,
): Promise<{ is_available: boolean }> {
  const before = await db.query('SELECT is_available FROM volunteer_profiles WHERE user_id = $1', [userId])
  if (before.rowCount === 0) throw errors.notFound('Volunteer profile not found')
  const oldValue = Boolean(before.rows[0].is_available)

  await db.query('UPDATE volunteer_profiles SET is_available = $1 WHERE user_id = $2', [isAvailable, userId])

  await writeAudit(db, {
    actorId: userId,
    action: 'volunteer.availability_updated',
    entityType: 'volunteer_profile',
    entityId: userId,
    before: { is_available: oldValue },
    after: { is_available: isAvailable },
  })

  return { is_available: isAvailable }
}