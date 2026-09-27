import 'dotenv/config'
import { closePool, pool } from '../src/database/pool.js'
import { logger } from '../src/lib/logger.js'
import { config } from '../src/config/index.js'
import { firestoreCounts } from '../src/modules/firebase-sync/firestore.js'
import { firebaseSyncStatus, retryDeadLettered } from '../src/modules/firebase-sync/sync.service.js'
import { backfillToFirestore, markMirrorSyncedAfterBackfill } from '../src/modules/firebase-sync/backfill.js'

/**
 * Operational commands for the Postgres -> Firestore mirror.
 *
 *   npm run firebase:backfill          one-time full export of existing rows
 *   npm run firebase:sync:status       queue depth and lag
 *   npm run firebase:sync:retry        requeue entries abandoned at max attempts
 *
 * Backfill does not go through the outbox on purpose: it reads the tables
 * directly, because replaying the queue only covers rows that have been written
 * since the trigger was installed and would leave everything older untouched.
 */
const COMMAND = process.argv[2] ?? 'status'

async function main(): Promise<void> {
  switch (COMMAND) {
    case 'backfill': {
      const result = await backfillToFirestore()
      logger.info('Backfill complete:', result)
      // Everything that existed before the trigger is now in Firestore, so the
      // queue's pre-backfill entries are redundant. Leaving them pending would
      // make the next drain re-export the same rows for no reason.
      const marked = await markMirrorSyncedAfterBackfill()
      logger.info(`Marked ${marked} pre-existing outbox entr${marked === 1 ? 'y' : 'ies'} as synced`)
      break
    }

    case 'retry': {
      const requeued = await retryDeadLettered()
      logger.info(`Requeued ${requeued} abandoned entr${requeued === 1 ? 'y' : 'ies'}`)
      break
    }

    case 'status':
    default: {
      const status = await firebaseSyncStatus()
      logger.info('Firestore mirror status', status)
      if (!status.enabled) {
        logger.info('  Mirror is OFF. Set FIREBASE_SYNC_ENABLED=true to drain the queue.')
      }
      if (!status.configured) {
        logger.info('  No service account: FCM_SERVICE_ACCOUNT_JSON is unset.')
      }
      if (status.oldestPendingAt) {
        logger.info(`  Oldest unsynced entry: ${status.oldestPendingAt}`)
      }
      if (status.pending === 0) {
        logger.info('  Queue is empty — the mirror is up to date.')
      }
      if (status.deadLettered > 0) {
        logger.info(
          `  ${status.deadLettered} entries were abandoned. Fix the cause, then npm run firebase:sync:retry`,
        )
      }
      if (config.firebaseSync.enabled && config.firebaseServiceAccountPathOrJson) {
        try {
          logger.info('Firestore document counts:', await firestoreCounts())
        } catch (err) {
          logger.warn('  Could not read Firestore counts', err)
        }
      }
      break
    }
  }

  await closePool()
}

main()
  .catch((err) => {
    logger.error('Command failed', err instanceof Error ? err.message : err)
    process.exitCode = 1
    void pool.end()
  })
