import pg from 'pg'
import { config } from '../config/index.js'

export type Queryable = pg.Pool | pg.PoolClient

/**
 * Under test the pool talks to the test database, and only the test database.
 *
 * There is deliberately no fallback to `config.databaseUrl` when
 * `DATABASE_URL_TEST` is unset. The fallback used to be here, and it was a trap
 * waiting for the switch to a single shared Neon database: a teammate missing
 * the variable would run `npm test`, truncate every table through `resetDb()`,
 * and erase the seeded accounts everyone else was working against. Failing here
 * turns that into a clear config error instead.
 *
 * The matching "is the test database actually a different database?" check
 * cannot live here: `vitest.config.ts` rewrites `DATABASE_URL` to the test
 * database so the request pipeline under test talks to the right place, which
 * makes the two indistinguishable by this point. It runs there instead, where
 * the real `.env` values are still intact.
 */
const url = config.isTest ? requireTestDatabaseUrl() : config.databaseUrl

function requireTestDatabaseUrl(): string {
  if (!config.databaseUrlTest) {
    throw new Error(
      'DATABASE_URL_TEST must be set to run tests. It must point at a dedicated ' +
        'test database, never at the shared one, because tests truncate every table.',
    )
  }
  return config.databaseUrlTest
}

export const pool = new pg.Pool({
  connectionString: url,
  max: config.pool.max,
  idleTimeoutMillis: 30_000,
  statement_timeout: 15_000,
})

export async function closePool(): Promise<void> {
  await pool.end()
}

/**
 * Runs `fn` inside a single transaction. Rolls back on throw.
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * Convenience row mapper: camelizes snake_case keys returned by the driver.
 */
export function row<T extends Record<string, unknown>>(r: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(r)) {
    out[camel(k)] = v
  }
  return out as T
}

export function rows<T extends Record<string, unknown>>(rs: Record<string, unknown>[]): T[] {
  return rs.map((r) => row<T>(r))
}

function camel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}