import 'dotenv/config'
import { closePool, withTransaction, type Queryable } from '../src/database/pool.js'
import { logger } from '../src/lib/logger.js'

const FRESH = process.argv.includes('--fresh')

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

async function main(): Promise<void> {
  const email = policeEmail()

  const policeId = await withTransaction(async (db) => {
    // --fresh wipes every business table before the insert; without it this run only touches the police row
    if (FRESH) await db.query(`TRUNCATE TABLE ${ALL_TABLES.join(', ')} CASCADE`)
    return upsertPolice(db, email, new Date())
  })

  logger.info('Bootstrap complete:', { police_email: email, police_user_id: policeId, fresh: FRESH })
  await closePool()
}

main().catch((err) => {
  logger.error('Bootstrap failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
