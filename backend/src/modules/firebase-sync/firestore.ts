import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from '../../lib/firebase-admin.js'
import { logger } from '../../lib/logger.js'
import { config } from '../../config/index.js'

/**
 * Firestore side of the Postgres mirror.
 *
 * Every mirrored Postgres table becomes one Firestore collection of the same
 * name, and every row becomes one document whose ID is the row's primary key.
 * That mapping is what makes the mirror safe to retry: `set()` on a fixed
 * document ID is idempotent, so replaying an outbox entry converges on the same
 * state instead of duplicating anything.
 *
 * Reads are never served from Firestore. It is a mirror for inspection and
 * analytics, not a second source of truth.
 */

export type SyncOp = 'upsert' | 'delete'

export interface MirrorTable {
  /** Postgres table name; must match a table carrying the enqueue trigger. */
  table: string
  /** Firestore collection, kept identical to the table name for a 1:1 mental map. */
  collection: string
  /** Columns identifying the row, in primary-key order. */
  keyColumns: string[]
  /**
   * Columns that are `numeric` in Postgres. node-pg returns those as strings to
   * preserve precision, and every one of them here is a lat/lng. Left as strings
   * they serialise fine but any distance arithmetic in Firestore silently
   * yields NaN, so they are converted to numbers.
   */
  numericColumns: string[]
  /**
   * Columns deliberately dropped on the way into Firestore.
   *
   * The mirror is narrower than Postgres on purpose. `aadhaar_number` is a
   * government identity number that exists only to verify an account at
   * registration — the police console already refuses to return it, and copying
   * it here would hand the one field with the strictest handling rules to any
   * client that can read Firestore. `fcm_token` is a device push token: harmless
   * in Postgres, but in a client-readable store it lets anyone who can read it
   * address arbitrary notifications to somebody else's phone.
   *
   * Listing them per table rather than globally keeps the rule auditable: a new
   * sensitive column is an explicit, reviewable edit instead of a silent copy.
   */
  redactedColumns: string[]
}

export const MIRROR_TABLES: MirrorTable[] = [
  {
    table: 'users',
    collection: 'users',
    keyColumns: ['id'],
    numericColumns: [],
    redactedColumns: ['fcm_token'],
  },
  {
    table: 'user_verifications',
    collection: 'user_verifications',
    keyColumns: ['id'],
    numericColumns: [],
    redactedColumns: ['fcm_token'],
  },
  {
    table: 'senior_profiles',
    collection: 'senior_profiles',
    keyColumns: ['id'],
    numericColumns: ['home_latitude', 'home_longitude'],
    redactedColumns: ['aadhaar_number'],
  },
  {
    table: 'volunteer_profiles',
    collection: 'volunteer_profiles',
    keyColumns: ['id'],
    numericColumns: [
      'base_latitude',
      'base_longitude',
      'current_latitude',
      'current_longitude',
    ],
    redactedColumns: ['aadhaar_number'],
  },
  {
    table: 'help_requests',
    collection: 'help_requests',
    keyColumns: ['id'],
    numericColumns: ['latitude', 'longitude'],
    redactedColumns: [],
  },
  {
    table: 'emergency_events',
    collection: 'emergency_events',
    keyColumns: ['id'],
    numericColumns: ['latitude', 'longitude'],
    redactedColumns: [],
  },
  {
    // Pure join table: no surrogate key, so the document ID is the pair. The
    // trigger builds row_id the same way; the two must stay in step.
    table: 'request_declines',
    collection: 'request_declines',
    keyColumns: ['request_id', 'volunteer_id'],
    numericColumns: [],
    redactedColumns: [],
  },
]

export const MIRRORED_TABLE_NAMES = new Set(MIRROR_TABLES.map((t) => t.table))

export function mirrorTableFor(name: string): MirrorTable | undefined {
  return MIRROR_TABLES.find((t) => t.table === name)
}

/** Document ID for a row: the key columns joined with '_', matching the trigger. */
export function documentIdFor(table: MirrorTable, row: Record<string, unknown>): string {
  return table.keyColumns.map((c) => String(row[c])).join('_')
}

/**
 * Converts a Postgres row into a Firestore document.
 *
 * - `numeric` strings become numbers (see MirrorTable.numericColumns).
 * - Columns in `redactedColumns` are dropped (see MirrorTable.redactedColumns).
 * - `timestamptz` arrives as a JS Date and is stored as an ISO string rather
 *   than a Firestore Timestamp, so the mirror stays readable with plain `curl`
 *   and the Firestore console without importing any timestamp library.
 * - `jsonb` is already an object from the driver and passes through untouched,
 *   which is what keeps `dispatch_batch` and `form_data` queryable.
 * - `users.email` gains a derived `emailLower`. Postgres enforces uniqueness
 *   case-insensitively via an index on `lower(email)`; Firestore has no
 *   equivalent, so a mirror query that filters on `email` directly would miss
 *   rows typed in a different case.
 */
export function toFirestoreDocument(
  table: MirrorTable,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue

    if (table.redactedColumns.includes(key)) continue

    if (value instanceof Date) {
      out[key] = value.toISOString()
      continue
    }

    if (table.numericColumns.includes(key) && typeof value === 'string') {
      const n = Number(value)
      // A non-numeric value here means the column drifted; keeping the original
      // string is safer than writing NaN, which Firestore would reject anyway.
      if (Number.isFinite(n)) {
        out[key] = n
        continue
      }
      logger.warn('[firebase-sync] non-numeric value in numeric column', { table, key, value })
    }

    out[key] = value
  }

  if (table.table === 'users' && typeof row.email === 'string') {
    out.emailLower = row.email.toLowerCase()
  }

  return out
}

function firestore() {
  const app = getAdminApp()
  if (!app) throw new Error('Firebase is not configured (FCM_SERVICE_ACCOUNT_JSON unset)')
  return getFirestore(app, config.firebaseSync.databaseId)
}

export interface SyncWrite {
  table: MirrorTable
  op: SyncOp
  /** Primary-key values, used to build the document ID. */
  rowId: string
  /** Present for `upsert` only. */
  row?: Record<string, unknown>
}

export interface SyncWriteResult {
  written: number
  deleted: number
}

/**
 * Applies a set of writes to Firestore in batches.
 *
 * A Firestore batch is capped at 500 operations and commits atomically, so
 * entries are chunked rather than sent individually: one round trip per chunk
 * instead of one per row, which matters on the first backfill.
 */
export async function applyWrites(writes: SyncWrite[]): Promise<SyncWriteResult> {
  if (writes.length === 0) return { written: 0, deleted: 0 }

  const db = firestore()
  const result: SyncWriteResult = { written: 0, deleted: 0 }

  for (let i = 0; i < writes.length; i += config.firebaseSync.batchSize) {
    const chunk = writes.slice(i, i + config.firebaseSync.batchSize)
    const batch = db.batch()

    for (const write of chunk) {
      const ref = db.collection(write.table.collection).doc(write.rowId)
      if (write.op === 'delete') {
        batch.delete(ref)
      } else {
        batch.set(ref, toFirestoreDocument(write.table, write.row ?? {}), { merge: false })
      }
    }

    await batch.commit()
    result.written += chunk.filter((w) => w.op === 'upsert').length
    result.deleted += chunk.filter((w) => w.op === 'delete').length
  }

  return result
}

/** Row counts per mirrored collection, for `npm run firebase:sync:status`. */
export async function firestoreCounts(): Promise<Record<string, number>> {
  const db = firestore()
  const out: Record<string, number> = {}
  for (const table of MIRROR_TABLES) {
    const snap = await db.collection(table.collection).count().get()
    out[table.table] = snap.data().count
  }
  return out
}
