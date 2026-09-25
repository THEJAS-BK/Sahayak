import 'dotenv/config'
import pg from 'pg'
import { runner } from 'node-pg-migrate'

function testUrl(): string {
  const url = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL_TEST (or DATABASE_URL) must be set for tests')
  return url
}

export function testConfig() {
  return {
    url: testUrl(),
    dbName: new URL(testUrl()).pathname.slice(1),
  }
}

async function createTestDatabase(): Promise<void> {
  const { url, dbName } = testConfig()
  const server = new URL(url)
  server.pathname = '/postgres'
  const client = new pg.Client({ connectionString: server.toString() })
  await client.connect()
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`)
    }
  } finally {
    await client.end()
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
        audit_logs, emergency_events, help_requests, refresh_tokens,
        otp_attempts, otp_codes, user_verifications, senior_profiles,
        volunteer_profiles, users
       CASCADE`,
    )
  } finally {
    await client.end()
  }
}

export async function dropTestDatabase(): Promise<void> {
  const { url, dbName } = testConfig()
  const server = new URL(url)
  server.pathname = '/postgres'
  const client = new pg.Client({ connectionString: server.toString() })
  await client.connect()
  try {
    await client.query(`DROP DATABASE IF EXISTS "${dbName.replace(/"/g, '""')}" WITH (FORCE)`)
  } finally {
    await client.end()
  }
}

export async function setup(): Promise<void> {
  await createTestDatabase()
  await migrateTestDatabase()
  await resetDb()
}

export async function teardown(): Promise<void> {
  await dropTestDatabase()
}