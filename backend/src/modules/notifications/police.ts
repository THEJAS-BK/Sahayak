import { pool } from '../../database/pool.js'
import { logger } from '../../lib/logger.js'
import { listPoliceFcmTokens } from '../users/users.service.js'
import { sendPush } from './push.js'

/**
 * Alerts every police desk that has push enabled.
 *
 * The police console is the web portal, so there is no single device token to
 * hardcode: each signed-in browser that granted permission registered its own
 * via `PATCH /api/me/fcm-token`, and those rows are what we fan out to. It used
 * to send to the literal string `police_alerts_topic`, which FCM rejected as an
 * unregistered token, so every police alert was silently dropped.
 *
 * Fire-and-forget by contract: failures are logged, never propagated to the
 * caller (an emergency must still be logged if the desk cannot be notified).
 */
export async function notifyPolice(title: string, body: string, data: Record<string, string>): Promise<void> {
  try {
    const tokens = await listPoliceFcmTokens(pool)
    if (tokens.length === 0) {
      logger.info('[notify] no police device tokens registered; alert not delivered', { title })
      return
    }
    await Promise.all(tokens.map((token) => sendPush({ token, title, body, data })))
  } catch (err) {
    logger.error('[notify] police alert failed', err)
  }
}
