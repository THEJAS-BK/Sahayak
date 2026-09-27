import { logger } from '../../lib/logger.js'

/**
 * Push notifications — not implemented.
 *
 * This is a logging stub. It exists so the notification modules
 * (`police.ts`, `request.ts`, `verification.ts`) have one place to call, and so
 * the seam is already in the right shape if push is picked up again: restore a
 * real sender here, behind a flag, and the call sites need no changes.
 *
 * Delivery is email-only for now. The `fcmToken` values threaded through the
 * notification payloads are therefore unused — they are left in place because
 * removing them is a separate, wider change across the registration, users,
 * matching and police modules, and the columns are still populated.
 */

export interface PushMessage {
  token: string
  title: string
  body: string
  data?: Record<string, string>
}

export interface PushSender {
  send(message: PushMessage): Promise<void>
}

class LogOnlySender implements PushSender {
  async send(message: PushMessage): Promise<void> {
    logger.info(`[push:disabled] to=${message.token} title="${message.title}" body="${message.body}"`)
  }
}

export const pushSender: PushSender = new LogOnlySender()

export async function sendPush(push: PushMessage): Promise<void> {
  await pushSender.send(push)
}
