import { describe, expect, it, afterEach } from 'vitest'
import {
  assertDestructiveAllowed,
  assertTestDatabaseIsolated,
  databaseIdentity,
  describeTarget,
} from '../src/lib/db-guard.js'

/**
 * The shared-database guards.
 *
 * These protect the one database everyone uses, so the failure mode they exist
 * to prevent — tests or a reset silently wiping teammates' work — is worth
 * pinning precisely, including the credential leak that printing a URL would
 * cause.
 */

const SHARED = 'postgresql://owner:sup3rsecret@db.example.neon.tech/neondb?sslmode=require'
const SHARED_POOLER = 'postgresql://owner:sup3rsecret@db-pooler.example.neon.tech/neondb?sslmode=require'
const TEST_DB = 'postgresql://owner:sup3rsecret@db.example.neon.tech/sahayak_test'

describe('databaseIdentity', () => {
  it('reduces a connection string to host, port and database', () => {
    expect(databaseIdentity(SHARED)).toEqual({
      host: 'db.example.neon.tech',
      port: '5432',
      database: 'neondb',
    })
  })

  it('keeps an explicit port and lowercases the host', () => {
    expect(databaseIdentity('postgres://u:p@DB.Example.COM:14604/mydb')).toEqual({
      host: 'db.example.com',
      port: '14604',
      database: 'mydb',
    })
  })
})

describe('describeTarget', () => {
  it('never includes the password or query string', () => {
    const printed = describeTarget(SHARED)
    expect(printed).toBe('db.example.neon.tech:5432/neondb')
    expect(printed).not.toContain('sup3rsecret')
    expect(printed).not.toContain('sslmode')
  })
})

describe('assertTestDatabaseIsolated', () => {
  it('passes when the test database is unset', () => {
    expect(() => assertTestDatabaseIsolated(SHARED, undefined)).not.toThrow()
  })

  it('passes when the test database is genuinely separate', () => {
    expect(() => assertTestDatabaseIsolated(SHARED, TEST_DB)).not.toThrow()
  })

  it('throws when tests would truncate the shared database', () => {
    expect(() => assertTestDatabaseIsolated(SHARED, SHARED)).toThrow(
      /same database as DATABASE_URL/,
    )
  })

  it('allows a test database reached through a different endpoint hostname', () => {
    // A Neon test branch has its own hostname as well as its own database name.
    // Note the limit of this check: identity is host + port + database, so a
    // pooler and direct endpoint aliasing the *same* database would not be
    // caught. That pairing is not a realistic test setup, since tests get their
    // own branch, and the alternative is guessing at provider internals.
    expect(() => assertTestDatabaseIsolated(SHARED, SHARED_POOLER)).not.toThrow()
  })

  it('does not leak the password in the failure message', () => {
    let message = ''
    try {
      assertTestDatabaseIsolated(SHARED, SHARED)
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).not.toContain('sup3rsecret')
  })
})

describe('assertDestructiveAllowed', () => {
  afterEach(() => {
    delete process.env.SAHAYAK_ALLOW_DESTRUCTIVE
  })

  it('refuses by default', () => {
    expect(() => assertDestructiveAllowed(SHARED, 'drop the schema')).toThrow(
      /Refusing to drop the schema/,
    )
  })

  it('allows an explicit override', () => {
    process.env.SAHAYAK_ALLOW_DESTRUCTIVE = '1'
    expect(() => assertDestructiveAllowed(SHARED, 'drop the schema')).not.toThrow()
  })

  it('names the target so the operator knows what they are about to lose', () => {
    expect(() => assertDestructiveAllowed(SHARED, 'drop the schema')).toThrow(
      /db\.example\.neon\.tech:5432\/neondb/,
    )
  })
})
