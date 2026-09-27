import { pool } from '../../database/pool.js'
import { logger } from '../../lib/logger.js'
import { applyWrites, documentIdFor, MIRROR_TABLES, type SyncWrite } from './firestore.js'

/**
 * One-time full export of the mirrored tables into Firestore.
 *
 * The outbox only records writes made from the moment its trigger was
 * installed, so on a database that already holds data it starts with no history
 * and the mirror would be missing every pre-existing row. This walks the tables
 * directly instead.
 *
 * Safe to re-run: every document is written with `set()` on a primary-key ID, so
 * a second run converges rather than duplicating.
 */

export interface BackfillResult {
  tables: Record<string, number>
  total: number
}

/** Rows per read. Keeps each result set comfortably inside memory limits. */
const PAGE_SIZE = 500

export async function backfillToFirestore(): Promise<BackfillResult> {
  const result: BackfillResult = { tables: {}, total: 0 }

  for (const table of MIRROR_TABLES) {
    let exported = 0
    let offset = 0

    for (;;) {
      const res = await pool.query(
        `SELECT * FROM ${table.table} ORDER BY ${table.keyColumns.join(', ')} LIMIT $1 OFFSET $2`,
        [PAGE_SIZE, offset],
      )
      if (res.rows.length === 0) break

      const writes: SyncWrite[] = res.rows.map((row) => ({
        table,
        op: 'upsert',
        rowId: documentIdFor(table, row),
        row,
      }))

      await applyWrites(writes)
      exported += res.rows.length
      offset += PAGE_SIZE

      if (res.rows.length < PAGE_SIZE) break
    }

    result.tables[table.table] = exported
    result.total += exported
    logger.info(`[firebase-sync] backfilled ${table.table}: ${exported} row(s)`)
  }

  return result
}

/**
 * Marks every mirrored row as already synced.
 *
 * Run after a backfill so the drain does not immediately re-export the same rows
 * through the outbox. Only safe directly after a successful backfill.
 */
export async function markMirrorSyncedAfterBackfill(): Promise<number> {
  const names = MIRROR_TABLES.map((t) => `'${t.table}'`).join(', ')
  const res = await pool.query(
    `UPDATE firebase_sync_outbox SET synced_at = now()
      WHERE synced_at IS NULL AND table_name IN (${names})`,
  )
  return res.rowCount ?? 0
}
