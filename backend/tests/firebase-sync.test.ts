import { beforeEach, describe, expect, it } from 'vitest'
import pg from 'pg'
import { pool } from '../src/database/pool.js'
import { resetDb, testConfig } from './helpers/db.js'
import { createUser } from './fixtures.js'
import {
  documentIdFor,
  MIRROR_TABLES,
  mirrorTableFor,
  toFirestoreDocument,
} from '../src/modules/firebase-sync/firestore.js'
import {
  collapseEntries,
  drainFirebaseSync,
  firebaseSyncStatus,
  type OutboxRow,
} from '../src/modules/firebase-sync/sync.service.js'

/**
 * Covers the Postgres half of the mirror: the trigger, the outbox, and the pure
 * conversion/collapse helpers.
 *
 * Firestore itself is never contacted. `drainFirebaseSync` returns immediately
 * while the mirror is disabled (the default), so these tests assert the queue is
 * correct without needing a service account — which is the whole point of
 * keeping the feature off by default.
 */

/**
 * Pending outbox entries, optionally narrowed to one table.
 *
 * Narrowing matters: inserting the user alone already enqueues a `users` row, so
 * a total count would measure the fixture rather than the table under test.
 */
async function pendingRows(table?: string): Promise<OutboxRow[]> {
  const res = await pool.query(
    `SELECT id, table_name, op, row_id, attempts FROM firebase_sync_outbox
      WHERE synced_at IS NULL ${table ? 'AND table_name = $1' : ''} ORDER BY id`,
    table ? [table] : [],
  )
  return res.rows as OutboxRow[]
}

async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: testConfig().url })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function seedHelpRequest(seniorId: string, category = 'grocery_assistance'): Promise<string> {
  const res = await pool.query(
    `INSERT INTO help_requests (senior_id, category, description, latitude, longitude, source)
     VALUES ($1, $2, 'needs help', 12.9716, 77.5946, 'flutter_app') RETURNING id`,
    [seniorId, category],
  )
  return res.rows[0].id as string
}

describe('firebase sync: outbox trigger', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('enqueues an upsert when a mirrored row is inserted', async () => {
    const senior = await createUser({ email: 'outbox-senior@example.com', role: 'senior' })
    const id = await seedHelpRequest(senior.id)

    const rows = await pendingRows('help_requests')
    expect(rows).toHaveLength(1)
    expect(rows[0].table_name).toBe('help_requests')
    expect(rows[0].op).toBe('upsert')
    expect(rows[0].row_id).toBe(id)
  })

  it('enqueues again on update, so state transitions reach the mirror', async () => {
    const senior = await createUser({ email: 'outbox-senior-2@example.com', role: 'senior' })
    const id = await seedHelpRequest(senior.id)
    await pool.query(`UPDATE help_requests SET status = 'MATCHING' WHERE id = $1`, [id])

    const rows = await pendingRows('help_requests')
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.op === 'upsert')).toBe(true)
  })

  it('enqueues a delete when a mirrored row is removed', async () => {
    const senior = await createUser({ email: 'outbox-senior-3@example.com', role: 'senior' })
    const id = await seedHelpRequest(senior.id)
    await pool.query(`DELETE FROM help_requests WHERE id = $1`, [id])

    const rows = await pendingRows('help_requests')
    expect(rows.some((r) => r.op === 'delete' && r.row_id === id)).toBe(true)
  })

  it('uses the composite key for request_declines, which has no id column', async () => {
    const senior = await createUser({ email: 'outbox-senior-4@example.com', role: 'senior' })
    const volunteer = await createUser({ email: 'outbox-vol@example.com', role: 'volunteer' })
    const requestId = await seedHelpRequest(senior.id)

    await pool.query(
      `INSERT INTO request_declines (request_id, volunteer_id, reason) VALUES ($1, $2, 'too far')`,
      [requestId, volunteer.id],
    )

    const rows = await pendingRows()
    const decline = rows.find((r) => r.table_name === 'request_declines')
    expect(decline).toBeDefined()
    expect(decline!.row_id).toBe(`${requestId}_${volunteer.id}`)
  })

  it('survives an update to the join table, which has no id to compare', async () => {
    const senior = await createUser({ email: 'outbox-senior-5@example.com', role: 'senior' })
    const volunteer = await createUser({ email: 'outbox-vol-2@example.com', role: 'volunteer' })
    const requestId = await seedHelpRequest(senior.id)
    await pool.query(
      `INSERT INTO request_declines (request_id, volunteer_id, reason) VALUES ($1, $2, 'too far')`,
      [requestId, volunteer.id],
    )

    // The trigger's primary-key-change check references OLD.id, which this table
    // does not have. Without the table-name guard it raises
    // "record old has no field id" and aborts the caller's transaction.
    await expect(
      pool.query(`UPDATE request_declines SET reason = 'changed mind' WHERE request_id = $1`, [
        requestId,
      ]),
    ).resolves.toBeDefined()
  })

  it('does not enqueue for tables outside the mirror set', async () => {
    const senior = await createUser({ email: 'outbox-senior-6@example.com', role: 'senior' })
    await pool.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id) VALUES ($1, 'a.b', 'help_request', $1)`,
      [senior.id],
    )

    // audit_logs and otp_codes are deliberately not mirrored: the first is
    // write-heavy append-only history, the second is short-lived and contains
    // codes. Neither should ever reach Firestore.
    const tables = new Set((await pendingRows()).map((r) => r.table_name))
    expect(tables.has('audit_logs')).toBe(false)
    expect(tables.has('otp_codes')).toBe(false)
  })

  it('mirrors user_verifications, which the phone-app approval flow reads', async () => {
    const senior = await createUser({ email: 'outbox-senior-8@example.com', role: 'senior' })
    const inserted = await pool.query(
      `INSERT INTO user_verifications (user_id, role, form_data, status) VALUES ($1, 'senior', '{}', 'PENDING')
       RETURNING id`,
      [senior.id],
    )

    const rows = await pendingRows('user_verifications')
    expect(rows).toHaveLength(1)
    // The document is keyed on the verification's own surrogate id, not on
    // user_id — a user can have several verifications over time.
    expect(rows[0].row_id).toBe(inserted.rows[0].id)
    expect(rows[0].row_id).not.toBe(senior.id)
  })

  it('discards the queue entry when the transaction rolls back', async () => {
    const senior = await createUser({ email: 'outbox-senior-7@example.com', role: 'senior' })

    await withClient(async (client) => {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO help_requests (senior_id, category, description, latitude, longitude, source)
         VALUES ($1, 'other', 'rolled back', 1, 2, 'flutter_app')`,
        [senior.id],
      )
      // Visible inside the transaction...
      const inside = await client.query(
        `SELECT count(*)::int AS n FROM firebase_sync_outbox
          WHERE synced_at IS NULL AND table_name = 'help_requests'`,
      )
      expect(inside.rows[0].n).toBeGreaterThan(0)
      await client.query('ROLLBACK')
    })

    // ...and gone afterwards, which is what stops the mirror from replaying a
    // write that Postgres itself discarded.
    expect(await pendingRows('help_requests')).toHaveLength(0)
  })
})

describe('firebase sync: entry collapsing', () => {
  const row = (id: string, op: 'upsert' | 'delete', rowId = 'r1'): OutboxRow => ({
    id,
    table_name: 'help_requests',
    op,
    row_id: rowId,
    attempts: 0,
  })

  it('keeps only the newest entry for a row', () => {
    const collapsed = collapseEntries([row('1', 'upsert'), row('2', 'upsert'), row('3', 'upsert')])
    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].id).toBe('3')
  })

  it('lets a delete win over an upsert for the same row', () => {
    // The row was updated and then removed, so writing the upsert would
    // resurrect a document that should not exist.
    const collapsed = collapseEntries([row('1', 'upsert'), row('2', 'delete')])
    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].op).toBe('delete')
  })

  it('lets a delete win even when it is the older entry', () => {
    const collapsed = collapseEntries([row('2', 'delete'), row('3', 'upsert')])
    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].op).toBe('delete')
  })

  it('does not merge entries for different rows or tables', () => {
    const collapsed = collapseEntries([
      row('1', 'upsert', 'r1'),
      row('2', 'upsert', 'r2'),
      { ...row('3', 'upsert', 'r1'), table_name: 'users' },
    ])
    expect(collapsed).toHaveLength(3)
  })
})

describe('firebase sync: Firestore document conversion', () => {
  it('converts numeric lat/lng strings to numbers', () => {
    // node-pg returns numeric as a string. Left alone, every distance
    // calculation in Firestore yields NaN without erroring.
    const doc = toFirestoreDocument(mirrorTableFor('help_requests')!, {
      id: 'r1',
      latitude: '12.971600',
      longitude: '77.594600',
    })
    expect(doc.latitude).toBe(12.9716)
    expect(doc.longitude).toBe(77.5946)
    expect(typeof doc.latitude).toBe('number')
  })

  it('converts every lat/lng column on each mirrored table', () => {
    for (const table of MIRROR_TABLES) {
      const row: Record<string, unknown> = { id: 'x' }
      for (const col of table.numericColumns) row[col] = '1.5'
      const doc = toFirestoreDocument(table, row)
      for (const col of table.numericColumns) {
        expect(doc[col], `${table.table}.${col}`).toBe(1.5)
      }
    }
  })

  it('serialises timestamps as ISO strings', () => {
    const at = new Date('2026-09-27T10:00:00.000Z')
    const doc = toFirestoreDocument(mirrorTableFor('help_requests')!, { id: 'r1', created_at: at })
    expect(doc.created_at).toBe('2026-09-27T10:00:00.000Z')
  })

  it('passes jsonb through as an object so nested data stays queryable', () => {
    const doc = toFirestoreDocument(mirrorTableFor('help_requests')!, {
      id: 'r1',
      dispatch_batch: [{ id: 'v1', distance_m: 1200 }],
    })
    expect(doc.dispatch_batch).toEqual([{ id: 'v1', distance_m: 1200 }])
  })

  it('derives emailLower, since Firestore has no case-insensitive index', () => {
    const doc = toFirestoreDocument(mirrorTableFor('users')!, {
      id: 'u1',
      email: 'Police@Gmail.com',
    })
    expect(doc.emailLower).toBe('police@gmail.com')
  })

  it('leaves a non-numeric value in a numeric column as a string rather than NaN', () => {
    const doc = toFirestoreDocument(mirrorTableFor('help_requests')!, {
      id: 'r1',
      latitude: 'not-a-number',
    })
    expect(doc.latitude).toBe('not-a-number')
  })

  it('drops aadhaar numbers from both profile tables', () => {
    for (const name of ['senior_profiles', 'volunteer_profiles']) {
      const doc = toFirestoreDocument(mirrorTableFor(name)!, {
        id: 'p1',
        full_name: 'Asha Rao',
        aadhaar_number: '1234 5678 9012',
      })
      expect(doc.aadhaar_number, name).toBeUndefined()
      // The rest of the row still mirrors, so redaction is narrow.
      expect(doc.full_name, name).toBe('Asha Rao')
    }
  })

  it('drops fcm device tokens from users and verifications', () => {
    for (const name of ['users', 'user_verifications']) {
      const doc = toFirestoreDocument(mirrorTableFor(name)!, {
        id: 'u1',
        email: 'senior@gmail.com',
        fcm_token: 'device-token-abc',
      })
      expect(doc.fcm_token, name).toBeUndefined()
      expect(doc.email, name).toBe('senior@gmail.com')
    }
  })

  it('never mirrors a redacted column, whatever the row contains', () => {
    // Guards the whole set at once: a column added to redactedColumns is covered
    // by this loop without needing a bespoke test.
    for (const table of MIRROR_TABLES) {
      const row: Record<string, unknown> = { id: 'x' }
      for (const col of table.redactedColumns) row[col] = `sensitive-${col}`
      const doc = toFirestoreDocument(table, row)
      for (const col of table.redactedColumns) {
        expect(doc[col], `${table.table}.${col}`).toBeUndefined()
      }
    }
  })

  it('builds document ids from the key columns', () => {
    expect(documentIdFor(mirrorTableFor('users')!, { id: 'u1' })).toBe('u1')
    expect(
      documentIdFor(mirrorTableFor('request_declines')!, {
        request_id: 'r1',
        volunteer_id: 'v1',
      }),
    ).toBe('r1_v1')
  })
})

describe('firebase sync: drain is inert while disabled', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('does nothing and leaves the queue intact when the mirror is off', async () => {
    const senior = await createUser({ email: 'sync-off@example.com', role: 'senior' })
    await seedHelpRequest(senior.id)
    expect(await pendingRows('help_requests')).toHaveLength(1)

    const outcome = await drainFirebaseSync()

    expect(outcome.attempted).toBe(0)
    expect(outcome.written).toBe(0)
    // The entry stays queued rather than being discarded, so enabling the mirror
    // later syncs everything that happened while it was off.
    expect(await pendingRows('help_requests')).toHaveLength(1)
  })

  it('reports the queue depth and the disabled state', async () => {
    const status = await firebaseSyncStatus()
    expect(status.enabled).toBe(false)
    expect(status.pending).toBe(0)
    expect(status.deadLettered).toBe(0)
  })
})
