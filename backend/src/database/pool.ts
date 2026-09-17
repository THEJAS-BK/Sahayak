import pg from 'pg'
import { config } from '../config/index.js'

export type Queryable = pg.Pool | pg.PoolClient

const url = config.isTest ? config.databaseUrlTest ?? config.databaseUrl : config.databaseUrl

export const pool = new pg.Pool({
  connectionString: url,
  max: 10,
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