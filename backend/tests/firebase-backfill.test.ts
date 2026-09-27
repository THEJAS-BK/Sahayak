import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pool } from '../src/database/pool.js'
import { resetDb } from './helpers/db.js'
import { createApprovedSenior, createUser } from './fixtures.js'
import type { SyncWrite } from '../src/modules/firebase-sync/firestore.js'

/**
 * Backfill tests.
 *
 * Firestore is replaced with an in-memory collector: the point of these tests is
 * that backfill *finds every existing row and keys it correctly*, which is a
 * property of the SQL, not of the Firestore client. Only `applyWrites` is
 * replaced, and it still runs the real `toFirestoreDocument`, so the captured
 * documents are exactly what would have been sent to Firestore.
 */
const captured: (SyncWrite & { doc?: Record<string, unknown> })[] = []

vi.mock('../src/modules/firebase-sync/firestore.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/firebase-sync/firestore.js')>()
  return {
    ...actual,
    applyWrites: vi.fn(async (writes: SyncWrite[]) => {
      for (const write of writes) {
        captured.push({
          ...write,
          doc:
            write.op === 'upsert'
              ? actual.toFirestoreDocument(write.table, write.row ?? {})
              : undefined,
        })
      }
      return {
        written: writes.filter((w) => w.op === 'upsert').length,
        deleted: writes.filter((w) => w.op === 'delete').length,
      }
    }),
  }
})

const { backfillToFirestore, markMirrorSyncedAfterBackfill } = await import(
  '../src/modules/firebase-sync/backfill.js'
)

function writeFor(table: string, rowId: string): SyncWrite | undefined {
  return captured.find((w) => w.table.table === table && w.rowId === rowId)
}

async function seed(): Promise<void> {
  const senior = await createApprovedSenior({ email: 'backfill@example.com' })
  const volunteer = await createUser({ email: 'backfill-vol@example.com', role: 'volunteer' })
  const request = await pool.query(
    `INSERT INTO help_requests (senior_id, category, description, latitude, longitude, source)
     VALUES ($1, 'grocery_assistance', 'milk', 12.9716, 77.5946, 'flutter_app') RETURNING id`,
    [senior.id],
  )
  await pool.query(
    `INSERT INTO request_declines (request_id, volunteer_id, reason) VALUES ($1, $2, 'too far')`,
    [request.rows[0].id, volunteer.id],
  )
}

describe('firebase sync: backfill', () => {
  beforeEach(async () => {
    await resetDb()
    captured.length = 0
    await seed()
  })

  it('exports every mirrored row', async () => {
    const result = await backfillToFirestore()

    // createUser makes no volunteer_profiles row, so volunteer_profiles and
    // emergency_events are legitimately empty and contribute 0.
    expect(result.tables).toEqual({
      users: 2,
      user_verifications: 1,
      senior_profiles: 1,
      volunteer_profiles: 0,
      help_requests: 1,
      emergency_events: 0,
      request_declines: 1,
    })
    expect(result.total).toBe(6)
  })

  it('keys documents on the primary key', async () => {
    await backfillToFirestore()

    const user = await pool.query(`SELECT id FROM users WHERE email = 'backfill@example.com'`)
    const request = await pool.query(
      `SELECT id FROM help_requests WHERE category = 'grocery_assistance'`,
    )

    expect(writeFor('users', user.rows[0].id)).toBeDefined()
    expect(writeFor('help_requests', request.rows[0].id)).toBeDefined()
  })

  it('keys the join table on both halves of the composite', async () => {
    await backfillToFirestore()

    const decline = await pool.query(
      `SELECT request_id, volunteer_id FROM request_declines LIMIT 1`,
    )
    const row = decline.rows[0]
    expect(writeFor('request_declines', `${row.request_id}_${row.volunteer_id}`)).toBeDefined()
  })

  it('converts rows on the way out, not just on the live path', async () => {
    await backfillToFirestore()

    const request = await pool.query(`SELECT id FROM help_requests LIMIT 1`)
    const write = writeFor('help_requests', request.rows[0].id)!

    // node-pg hands back numeric as a string. The document that reaches Firestore
    // must already be normalised, or a backfilled request is unreadable — its
    // latitude would compare as text in every distance query.
    expect(write.doc?.latitude).toBe(12.9716)
    expect(typeof write.doc?.latitude).toBe('number')
  })

  it('emits only upserts, never deletes', async () => {
    await backfillToFirestore()
    expect(captured.every((w) => w.op === 'upsert')).toBe(true)
  })

  it('re-running converges instead of duplicating', async () => {
    const first = await backfillToFirestore()
    captured.length = 0
    await backfillToFirestore()

    // The second pass writes the same document IDs again, so it adds no new
    // document. This is what makes an accidental re-run safe.
    const ids = new Set(captured.map((w) => `${w.table.table}:${w.rowId}`))
    expect(captured.length).toBe(first.total)
    expect(ids.size).toBe(first.total)
  })

  it('marks the pre-existing queue synced so the drain does not redo the work', async () => {
    const before = await pool.query(
      `SELECT count(*)::int AS n FROM firebase_sync_outbox WHERE synced_at IS NULL`,
    )
    expect(before.rows[0].n).toBeGreaterThan(0)

    const marked = await markMirrorSyncedAfterBackfill()

    expect(marked).toBe(before.rows[0].n)
    const after = await pool.query(
      `SELECT count(*)::int AS n FROM firebase_sync_outbox WHERE synced_at IS NULL`,
    )
    expect(after.rows[0].n).toBe(0)
  })
})
