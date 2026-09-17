import { logger } from '../../lib/logger.js'
import { sendPush } from './push.js'

/**
 * Alerts the police portal (a fixed FCM topic in production). Fire-and-forget;
 * failures logged, never propagated.
 */
export async function notifyPolice(title: string, body: string, data: Record<string, string>): Promise<void> {
  try {
    await sendPush({ token: 'police_alerts_topic', title, body, data })
  } catch (err) {
    logger.error('[notify] police alert failed', err)
  }
}