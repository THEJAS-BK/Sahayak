import { config } from "../config/index.js";
import { withTransaction } from "../database/pool.js";
import { writeAudit } from "../database/audit.js";
import { logger } from "../lib/logger.js";
import { markDispatched } from "../modules/matching/matching.service.js";
import { notifyDispatch } from "../modules/notifications/request.js";
import { notifyPolice } from "../modules/notifications/police.js";
import type { Queryable } from "../database/pool.js";

export interface SweepOutcome {
  redispatched: number;
  unassigned: number;
  newBatches: Array<{
    requestId: string;
    category: string;
    candidates: Array<{ id: string; fcmToken: string | null }>;
  }>;
  policeAlerts: string[];
}

async function sweepOnce(db: Queryable, outcome: SweepOutcome): Promise<void> {
  const timeoutS = config.matching.timeoutS;
  const maxAttempts = config.matching.maxAttempts;

  const res = await db.query(
    `SELECT id, category, latitude, longitude, priority, dispatch_attempt, dispatch_batch
     FROM help_requests
     WHERE status = 'DISPATCHED' AND dispatched_at < now() - ($1 * interval '1 second')`,
    [timeoutS],
  );

  for (const row of res.rows) {
    const requestId: string = row.id;
    const attempt: number = row.dispatch_attempt;
    const priorIds: string[] = Array.isArray(row.dispatch_batch)
      ? (row.dispatch_batch as Array<{ id: string }>).map((e) => e.id)
      : [];

    if (attempt < maxAttempts) {
      const { candidates } = await markDispatched(
        db,
        {
          id: requestId,
          category: row.category,
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
          priority: row.priority,
        },
        attempt + 1,
        { excludeIds: priorIds },
      );
      await writeAudit(db, {
        actorId: null,
        action: "request.redispatched",
        entityType: "help_request",
        entityId: requestId,
        before: { status: "DISPATCHED", dispatch_attempt: attempt },
        after: { status: "DISPATCHED", dispatch_attempt: attempt + 1 },
      });
      outcome.redispatched += 1;
      outcome.newBatches.push({
        requestId,
        category: row.category,
        candidates: candidates.map((c) => ({ id: c.id, fcmToken: c.fcmToken })),
      });
    } else {
      await db.query(
        `UPDATE help_requests SET status = 'UNASSIGNED' WHERE id = $1`,
        [requestId],
      );
      await writeAudit(db, {
        actorId: null,
        action: "request.unassigned",
        entityType: "help_request",
        entityId: requestId,
        before: { status: "DISPATCHED", dispatch_attempt: attempt },
        after: { status: "UNASSIGNED", reason: "dispatch_attempts_exhausted" },
      });
      outcome.unassigned += 1;
      outcome.policeAlerts.push(requestId);
    }
  }
}

/** BG-01: re-dispatch stale DISPATCHED requests; UNASSIGN after max attempts. */
export async function runDispatchSweep(): Promise<SweepOutcome> {
  const outcome: SweepOutcome = {
    redispatched: 0,
    unassigned: 0,
    newBatches: [],
    policeAlerts: [],
  };
  await withTransaction((db) => sweepOnce(db, outcome));
  return outcome;
}

/** BG-02: purge used/expired OTPs and dead refresh tokens. */
export async function runCleanup(): Promise<{
  otpDeleted: number;
  tokensDeleted: number;
}> {
  return withTransaction(async (db) => {
    const otp = await db.query(
      "DELETE FROM otp_codes WHERE used = true OR expires_at < now()",
    );
    const tokens = await db.query(
      "DELETE FROM refresh_tokens WHERE consumed_at IS NOT NULL OR revoked_at IS NOT NULL OR expires_at < now()",
    );
    return {
      otpDeleted: otp.rowCount ?? 0,
      tokensDeleted: tokens.rowCount ?? 0,
    };
  });
}

let dispatchLock = false;
let cleanupLock = false;

async function guardedDispatch(): Promise<void> {
  if (dispatchLock) {
    logger.warn("[bg] dispatch sweep skipped (previous run still active)");
    return;
  }
  dispatchLock = true;
  try {
    const outcome = await runDispatchSweep();
    for (const batch of outcome.newBatches) {
      if (batch.candidates.length > 0) {
        void notifyDispatch(batch.candidates, batch.requestId, batch.category);
      }
    }
    if (outcome.policeAlerts.length > 0) {
      void notifyPolice(
        "Request could not be fulfilled",
        `${outcome.policeAlerts.length} request(s) had no available volunteers after ${config.matching.maxAttempts} attempts.`,
        { type: "request_unassigned" },
      );
    }
    if (outcome.redispatched > 0 || outcome.unassigned > 0) {
      logger.info(
        `[bg] dispatch sweep: ${outcome.redispatched} redispatched, ${outcome.unassigned} unassigned`,
      );
    }
  } catch (err) {
    logger.error("[bg] dispatch sweep failed", err);
  } finally {
    dispatchLock = false;
  }
}

async function guardedCleanup(): Promise<void> {
  if (cleanupLock) return;
  cleanupLock = true;
  try {
    const result = await runCleanup();
    logger.info(
      `[bg] cleanup: ${result.otpDeleted} otp_codes, ${result.tokensDeleted} refresh_tokens removed`,
    );
  } catch (err) {
    logger.error("[bg] cleanup failed", err);
  } finally {
    cleanupLock = false;
  }
}

import * as cron from "node-cron";

export function startBackgroundJobs() {
  if (config.isTest) return;

  cron.schedule("*/30 * * * * *", () => {
    void guardedDispatch();
  });

  cron.schedule("15 3 * * *", () => {
    void guardedCleanup();
  });

  logger.info(
    "[bg] background jobs scheduled (dispatch sweep 30s, cleanup daily 03:15)",
  );
}