import 'dotenv/config'
import { closePool, withTransaction, type Queryable } from '../src/database/pool.js'
import { config } from '../src/config/index.js'
import { assertDestructiveAllowed } from '../src/lib/db-guard.js'
import { markDispatched } from '../src/modules/matching/matching.service.js'
import { logger } from '../src/lib/logger.js'

const FRESH = process.argv.includes('--fresh')
const DEMO = process.argv.includes('--demo')

const ALL_TABLES = [
  'emergency_events',
  'audit_logs',
  'help_requests',
  'refresh_tokens',
  'otp_codes',
  'otp_attempts',
  'user_verifications',
  'senior_profiles',
  'volunteer_profiles',
  'users',
]

/**
 * Demo dataset, opt-in via `npm run db:seed -- --demo`.
 *
 * One approved senior, one approved on-duty volunteer, and two requests: one
 * closed and one live. The coordinates are in Bengaluru and deliberately close
 * together, so the matcher actually finds the volunteer — a demo where dispatch
 * silently finds nobody teaches the wrong lesson.
 *
 * Both requests belong to the one senior because BR-13 allows a single open
 * request each, so the completed one is closed and only the second is live.
 */
const DEMO_SENIOR = {
  email: 'senior@example.com',
  fullName: 'Demo Senior',
  phone: '+919000000001',
  latitude: 12.9716,
  longitude: 77.5946,
}

const DEMO_VOLUNTEER = {
  email: 'volunteer@example.com',
  fullName: 'Demo Volunteer',
  phone: '+919000000002',
  latitude: 12.9722,
  longitude: 77.5952,
  skills: ['medical_help', 'medicine_delivery'],
}

function policeEmail(): string {
  const email = process.env.POLICE_BOOTSTRAP_EMAIL?.trim()
  if (!email) {
    logger.error(
      'POLICE_BOOTSTRAP_EMAIL is not set. Add it to backend/.env (see backend/.env.example) — it is the email of the single police account used to review registration verifications in dev.',
    )
    process.exit(1)
  }
  return email.toLowerCase()
}

async function upsertPolice(db: Queryable, email: string, now: Date): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO users (email, role, is_active, created_at, updated_at)
     VALUES ($1, 'police', true, $2, $2)
     ON CONFLICT (lower(email)) DO UPDATE
       SET role = 'police', is_active = true, updated_at = $2
     RETURNING id`,
    [email, now],
  )
  return res.rows[0].id
}

async function upsertPerson(
  db: Queryable,
  email: string,
  role: 'senior' | 'volunteer',
  now: Date,
): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO users (email, role, is_active, created_at, updated_at)
     VALUES ($1, $2, true, $3, $3)
     ON CONFLICT (lower(email)) DO UPDATE
       SET role = $2, is_active = true, updated_at = $3
     RETURNING id`,
    [email, role, now],
  )
  return res.rows[0].id
}

/**
 * Approved, so the matcher will consider them. The partial unique index allows
 * one PENDING-or-APPROVED verification per user, hence the index predicate in
 * the conflict target.
 */
async function approveVerification(db: Queryable, userId: string, role: 'senior' | 'volunteer'): Promise<void> {
  await db.query(
    `INSERT INTO user_verifications (user_id, role, form_data, status)
     VALUES ($1, $2, '{}'::jsonb, 'APPROVED')
     ON CONFLICT (user_id) WHERE status = ANY (ARRAY['PENDING', 'APPROVED'])
     DO UPDATE SET status = 'APPROVED', updated_at = now()`,
    [userId, role],
  )
}

interface DemoResult {
  senior_user_id: string
  volunteer_user_id: string
  request_ids: string[]
  dispatched_to: string | null
}

async function seedDemo(db: Queryable): Promise<DemoResult> {
  const now = new Date()

  const seniorId = await upsertPerson(db, DEMO_SENIOR.email, 'senior', now)
  await approveVerification(db, seniorId, 'senior')
  await db.query(
    `INSERT INTO senior_profiles (user_id, full_name, phone_number, home_latitude, home_longitude, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     ON CONFLICT (user_id) DO UPDATE
       SET full_name = $2, phone_number = $3, home_latitude = $4, home_longitude = $5, updated_at = $6`,
    [seniorId, DEMO_SENIOR.fullName, DEMO_SENIOR.phone, DEMO_SENIOR.latitude, DEMO_SENIOR.longitude, now],
  )

  const volunteerId = await upsertPerson(db, DEMO_VOLUNTEER.email, 'volunteer', now)
  await approveVerification(db, volunteerId, 'volunteer')
  await db.query(
    `INSERT INTO volunteer_profiles
       (user_id, full_name, phone_number, base_latitude, base_longitude, is_available, skills, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, true, $6::jsonb, $7, $7)
     ON CONFLICT (user_id) DO UPDATE
       SET full_name = $2, phone_number = $3, base_latitude = $4, base_longitude = $5,
           is_available = true, skills = $6::jsonb, updated_at = $7`,
    [
      volunteerId,
      DEMO_VOLUNTEER.fullName,
      DEMO_VOLUNTEER.phone,
      DEMO_VOLUNTEER.latitude,
      DEMO_VOLUNTEER.longitude,
      JSON.stringify(DEMO_VOLUNTEER.skills),
      now,
    ],
  )

  const requestIds: string[] = []

  // A closed request, so the demo shows history rather than only a live row.
  // Re-running replaces it rather than piling up duplicates.
  await db.query(
    `DELETE FROM help_requests WHERE description LIKE '[demo]%' AND status = 'COMPLETED'`,
  )
  const done = await db.query<{ id: string }>(
    `INSERT INTO help_requests
       (senior_id, category, description, latitude, longitude, priority, source, status,
        assigned_volunteer_id, dispatch_attempt, dispatched_at, dispatch_batch,
        accepted_at, completed_at, created_at, updated_at)
     VALUES ($1, 'medical_help', '[demo] Prescription pickup from the pharmacy',
             $2, $3, 'normal', 'flutter_app', 'COMPLETED',
             $4, 0, now(), $5::jsonb, now(), now(), now() - interval '2 days', now() - interval '2 days')
     RETURNING id`,
    [
      seniorId,
      DEMO_SENIOR.latitude,
      DEMO_SENIOR.longitude,
      volunteerId,
      JSON.stringify([
        { id: volunteerId, latitude: DEMO_VOLUNTEER.latitude, longitude: DEMO_VOLUNTEER.longitude, distance_m: 80 },
      ]),
    ],
  )
  requestIds.push(done.rows[0].id)

  // The live one. Dispatch goes through the real matcher rather than a
  // hand-written batch, so the seeded state is exactly what the app produces —
  // and it exercises the single-target path while seeding.
  await db.query(`DELETE FROM help_requests WHERE description LIKE '[demo]%' AND status <> 'COMPLETED'`)
  const live = await db.query<{ id: string }>(
    `INSERT INTO help_requests
       (senior_id, category, description, latitude, longitude, priority, source, status, created_at, updated_at)
     VALUES ($1, 'medicine_delivery', '[demo] Need medicines delivered this evening',
             $2, $3, 'urgent', 'flutter_app', 'PENDING', now(), now())
     RETURNING id`,
    [seniorId, DEMO_SENIOR.latitude, DEMO_SENIOR.longitude],
  )
  const liveId = live.rows[0].id
  const { candidate, dispatched } = await markDispatched(
    db,
    {
      id: liveId,
      category: 'medicine_delivery',
      latitude: DEMO_SENIOR.latitude,
      longitude: DEMO_SENIOR.longitude,
      priority: 'urgent',
    },
    0,
  )
  if (!dispatched) {
    logger.warn(
      { requestId: liveId },
      'demo: the live request found no eligible volunteer. Check the demo coordinates and that the volunteer is on duty.',
    )
  }
  requestIds.push(liveId)

  return {
    senior_user_id: seniorId,
    volunteer_user_id: volunteerId,
    request_ids: requestIds,
    dispatched_to: candidate ? candidate.id : null,
  }
}

async function main(): Promise<void> {
  const email = policeEmail()

  // --fresh truncates every business table, which on the single shared database
  // would delete every teammate's work. Guarded for the same reason as db:reset.
  if (FRESH) {
    assertDestructiveAllowed(config.databaseUrl, 'truncate every business table to reseed')
  }

  const result = await withTransaction(async (db) => {
    // --fresh wipes every business table before the insert; without it this run only touches the police row
    if (FRESH) await db.query(`TRUNCATE TABLE ${ALL_TABLES.join(', ')} CASCADE`)
    const policeId = await upsertPolice(db, email, new Date())
    const demo = DEMO ? await seedDemo(db) : null
    return { policeId, demo }
  })

  logger.info('Bootstrap complete:', {
    police_email: email,
    police_user_id: result.policeId,
    fresh: FRESH,
    ...(result.demo ? { demo: result.demo } : {}),
  })
  await closePool()
}

main().catch((err) => {
  logger.error('Bootstrap failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
