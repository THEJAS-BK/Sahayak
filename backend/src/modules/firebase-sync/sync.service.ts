import { pool, withTransaction, type Queryable } from '../../database/pool.js'
import { logger } from '../../lib/logger.js'
import { isFirebaseConfigured } from '../../lib/firebase-admin.js'
import { config } from '../../config/index.js'
import {
  applyWrites,
  documentIdFor,
  mirrorTableFor,
  MIRRORED_TABLE_NAMES,
  type SyncWrite,
} from './firestore.js'

/**
 * Drains `firebase_sync_outbox` into Firestore.
 *
 * Delivery is at-least-once on purpose. `applyWrites` uses `set()` keyed on the
 * primary key, so replaying an entry is a no-op once it has landed, which makes
 * a crash between the Firestore commit and the `synced_at` update harmless —
 * the entry is simply replayed and converges. The alternative (marking synced
 * first) would silently lose writes, which is the one failure mode a mirror of
 * safety-relevant data must not have.
 */

export interface DrainOutcome {
  attempted: number
  written: number
  deleted: number
  failed: number
  deadLettered: number
}

export interface SyncStatus {
  pending: number
  oldestPendingAt: string | null
  failed: number
  deadLettered: number
  enabled: boolean
  configured: boolean
}

export interface OutboxRow {
  id: string
  table_name: string
  op: 'upsert' | 'delete'
  row_id: string
  attempts: number
}

/**
 * Collapses a claimed batch down to one entry per row.
 *
 * A request moving PENDING -> MATCHING -> DISPATCHED enqueues three entries for
 * one document, and only the final state is worth writing. Deletes win over
 * upserts for the same row: if a row was updated and then deleted, the delete is
 * the truth, and applying the upsert afterwards would resurrect a document that
 * should not exist.
 */
export function collapseEntries(claimed: OutboxRow[]): OutboxRow[] {
  const latest = new Map<string, OutboxRow>()

  for (const row of claimed) {
    const key = `${row.table_name}:${row.row_id}`
    const prior = latest.get(key)
    if (!prior) {
      latest.set(key, row)
      continue
    }
    const deleteWins = prior.op === 'delete' || row.op === 'delete'
    const newer = Number(row.id) > Number(prior.id) ? row : prior
    latest.set(key, deleteWins ? { ...newer, op: 'delete' } : newer)
  }

  return [...latest.values()]
}

/**
 * Claims a batch of pending entries and applies them.
 *
 * `FOR UPDATE SKIP LOCKED` is what makes this safe to run on more than one
 * instance: each drain takes a disjoint set of rows instead of blocking on the
 * rows another drain already claimed.
 */
export async function drainFirebaseSync(limit?: number): Promise<DrainOutcome> {
  const outcome: DrainOutcome = {
    attempted: 0,
    written: 0,
    deleted: 0,
    failed: 0,
    deadLettered: 0,
  }

  if (!config.firebaseSync.enabled) return outcome
  if (!isFirebaseConfigured()) {
    logger.warn('[firebase-sync] enabled but no service account configured; skipping')
    return outcome
  }

  const batchSize = limit ?? config.firebaseSync.batchSize
  const claimed = await withTransaction((db) => claimBatch(db, batchSize))
  if (claimed.length === 0) return outcome

  outcome.attempted = claimed.length

  const effective = collapseEntries(claimed)

  const writes: SyncWrite[] = []
  /** Every entry this drain intends to resolve, marked synced only after the writes land. */
  const resolvedIds: string[] = []
  const upsertsByTable = new Map<string, OutboxRow[]>()

  for (const row of effective) {
    resolvedIds.push(row.id)

    const table = mirrorTableFor(row.table_name)
    if (!table) {
      // The trigger only fires on mirrored tables, so this means the mirror set
      // and the trigger list have drifted apart. Resolve it rather than retrying
      // a row that can never succeed.
      logger.error('[firebase-sync] outbox row for unmirrored table', {
        table: row.table_name,
        rowId: row.row_id,
      })
      continue
    }

    if (row.op === 'delete') {
      writes.push({ table, op: 'delete', rowId: row.row_id })
      continue
    }

    upsertsByTable.set(table.table, [...(upsertsByTable.get(table.table) ?? []), row])
  }

  // Re-read current rows rather than trusting anything the trigger captured: by
  // the time an entry drains, the row may have moved on, and mirroring the latest
  // state is both correct and self-healing. Batched per table so a 200-entry
  // drain costs 7 queries rather than 200.
  for (const [tableName, rows] of upsertsByTable) {
    const table = mirrorTableFor(tableName)!
    const current = await readRowsByKey(table, rows.map((r) => r.row_id))

    for (const row of current) {
      writes.push({
        table,
        op: 'upsert',
        rowId: documentIdFor(table, row),
        row,
      })
    }

    // Any entry whose row is gone was deleted after being enqueued, so the
    // trigger has already queued a delete for it. There is nothing to write, and
    // the entry still counts as resolved — leaving it pending would retry it on
    // every tick until it was dead-lettered as if it had failed.
  }

  try {
    const applied = await applyWrites(writes)
    outcome.written = applied.written
    outcome.deleted = applied.deleted
    await markSynced(resolvedIds)
  } catch (err) {
    outcome.failed = effective.length
    const message = err instanceof Error ? err.message : String(err)
    const ids = effective.map((r) => r.id)
    await recordFailure(ids, message)
    outcome.deadLettered = await countNewlyDeadLettered(ids)
    logger.error('[firebase-sync] drain failed', { error: message, entries: ids.length })
    return outcome
  }

  return outcome
}

/**
 * Fetches the current state of every row named by `rowIds`.
 *
 * `row_id` is the key columns joined with '_', which is reversible because UUIDs
 * contain no underscore — the same convention the trigger uses to build it.
 */
async function readRowsByKey(
  table: { table: string; keyColumns: string[] },
  rowIds: string[],
): Promise<Record<string, unknown>[]> {
  if (rowIds.length === 0) return []

  const parts = table.keyColumns.map((_, i) => rowIds.map((id) => id.split('_')[i]))
  const where =
    table.keyColumns.length === 1
      ? `${table.keyColumns[0]}::text = ANY($1::text[])`
      : `(${table.keyColumns.map((c) => `${c}::text`).join(', ')}) IN (SELECT * FROM unnest($1::text[]${', $2::text[]'.repeat(parts.length - 1)}))`

  const res = await pool.query(`SELECT * FROM ${table.table} WHERE ${where}`, parts)
  return res.rows as Record<string, unknown>[]
}

async function claimBatch(db: Queryable, limit: number): Promise<OutboxRow[]> {
  const res = await db.query(
    `SELECT id, table_name, op, row_id, attempts
       FROM firebase_sync_outbox
      WHERE synced_at IS NULL
      ORDER BY id
      LIMIT $1
        FOR UPDATE SKIP LOCKED`,
    [limit],
  )
  return res.rows as OutboxRow[]
}

async function markSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await pool.query(
    `UPDATE firebase_sync_outbox
        SET synced_at = now(), last_error = NULL
      WHERE id = ANY($1::bigint[])`,
    [ids],
  )
}

async function recordFailure(ids: string[], message: string): Promise<void> {
  if (ids.length === 0) return
  await pool.query(
    `UPDATE firebase_sync_outbox
        SET attempts = attempts + 1, last_error = $2
      WHERE id = ANY($1::bigint[])`,
    [ids, message.slice(0, 1000)],
  )
}

/**
 * A row past `maxAttempts` is abandoned: marked synced so the drain stops
 * re-reading it every 10 seconds, but logged as an error because the mirror is
 * now permanently missing that document. `npm run firebase:sync:retry` puts
 * them back in the queue once the underlying cause is fixed.
 */
async function countNewlyDeadLettered(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const res = await pool.query(
    `UPDATE firebase_sync_outbox
        SET synced_at = now()
      WHERE id = ANY($1::bigint[])
        AND attempts >= $2
      RETURNING id`,
    [ids, config.firebaseSync.maxAttempts],
  )
  if (res.rowCount && res.rowCount > 0) {
    logger.error('[firebase-sync] abandoned entries after max attempts', {
      count: res.rowCount,
      maxAttempts: config.firebaseSync.maxAttempts,
      hint: 'run npm run firebase:sync:retry after fixing the cause',
    })
  }
  return res.rowCount ?? 0
}

/**
 * Lag report. The mirror is eventually consistent, so "is it healthy" is a
 * question about queue depth and age, not about a boolean.
 */
export async function firebaseSyncStatus(): Promise<SyncStatus> {
  const res = await pool.query<{ pending: string; oldest: Date | null; failed: string; dead: string }>(
    `SELECT
       count(*) FILTER (WHERE synced_at IS NULL)                                   AS pending,
       min(created_at) FILTER (WHERE synced_at IS NULL)                             AS oldest,
       count(*) FILTER (WHERE synced_at IS NULL AND attempts > 0)                   AS failed,
       count(*) FILTER (WHERE synced_at IS NOT NULL AND attempts >= $1)             AS dead
     FROM firebase_sync_outbox`,
    [config.firebaseSync.maxAttempts],
  )
  const row = res.rows[0]
  return {
    pending: Number(row?.pending ?? 0),
    oldestPendingAt: row?.oldest ? new Date(row.oldest).toISOString() : null,
    failed: Number(row?.failed ?? 0),
    deadLettered: Number(row?.dead ?? 0),
    enabled: config.firebaseSync.enabled,
    configured: isFirebaseConfigured(),
  }
}

/** Returns abandoned entries to the queue. */
export async function retryDeadLettered(): Promise<number> {
  const res = await pool.query(
    `UPDATE firebase_sync_outbox
        SET synced_at = NULL, attempts = 0, last_error = NULL
      WHERE synced_at IS NOT NULL AND attempts >= $1`,
    [config.firebaseSync.maxAttempts],
  )
  return res.rowCount ?? 0
}

export { MIRRORED_TABLE_NAMES }
