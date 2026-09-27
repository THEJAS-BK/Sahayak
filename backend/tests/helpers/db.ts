import 'dotenv/config'
import pg from 'pg'
import { runner } from 'node-pg-migrate'

/**
 * The test database.
 *
 * This used to create and drop a database per run, connecting to a `postgres`
 * maintenance database to do it. That is impossible here: the project runs on a
 * single shared Neon instance reached through PgBouncer, and a transaction pool
 * cannot execute `CREATE DATABASE` or `DROP DATABASE` at all (Neon also has no
 * `postgres` database to connect to in the first place).
 *
 * So the test database is provisioned once, out of band — on Neon that is a
 * test branch — and every run is migrations plus a truncate. Data isolation is
 * unchanged, because `resetDb` was already the mechanism: it is what each test
 * file's `beforeEach` calls. The only thing given up is a pristine schema per
 * run, and `node-pg-migrate up` is idempotent, so nothing depended on that.
 */
function testUrl(): string {
  const url = process.env.DATABASE_URL_TEST
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST must be set to run tests. It must point at a dedicated ' +
        'test database, never the shared one, because tests truncate every table.',
    )
  }
  return url
}

export function testConfig() {
  return {
    url: testUrl(),
    dbName: new URL(testUrl()).pathname.slice(1),
  }
}

export async function migrateTestDatabase(): Promise<void> {
  await runner({
    databaseUrl: testUrl(),
    dir: 'migrations',
    direction: 'up',
    count: Infinity,
    migrationsTable: 'pgmigrations',
    log: () => undefined,
  })
}

/**
 * Deletes all rows across tables. Called in globalSetup once and by each test
 * file's beforeEach for isolation.
 */
export async function resetDb(): Promise<void> {
  const client = new pg.Client({ connectionString: testUrl() })
  await client.connect()
  try {
    await client.query(
      `TRUNCATE TABLE
        firebase_sync_outbox, audit_logs, emergency_events, help_requests, refresh_tokens,
        otp_attempts, otp_codes, user_verifications, senior_profiles,
        volunteer_profiles, users
       CASCADE`,
    )
  } finally {
    await client.end()
  }
}

export async function setup(): Promise<void> {
  await migrateTestDatabase()
  await resetDb()
}

/**
 * Nothing to tear down.
 *
 * Previously dropped the test database; it now belongs to the project and
 * outlives the run, which is the point of provisioning it once. Kept as an
 * exported no-op so `global-setup.ts` can keep exporting a teardown hook
 * without every reader wondering what it used to do.
 */
export async function teardown(): Promise<void> {}