import { getMessaging } from 'firebase-admin/messaging'
import { getAdminApp, isPushEnabled } from '../../lib/firebase-admin.js'
import { logger } from '../../lib/logger.js'

export interface PushMessage {
  token: string
  title: string
  body: string
  data?: Record<string, string>
}

export interface PushSender {
  send(message: PushMessage): Promise<void>
}

class FcmSender implements PushSender {
  async send(message: PushMessage): Promise<void> {
    try {
      const app = getAdminApp()
      if (!app) throw new Error('FCM not configured')
      await getMessaging(app).send({
        token: message.token,
        notification: { title: message.title, body: message.body },
        data: message.data,
        android: { priority: 'high' },
        // The police desk is a browser now, so a click should land on the
        // portal rather than on nothing. Ignored by native Android delivery.
        webpush: { fcmOptions: { link: '/' } },
      })
    } catch (err) {
      // Push failures are logged, never thrown: a senior's SOS must still be
      // recorded even if the desk cannot be notified.
      logger.error('[push] send failed', err)
    }
  }
}

class LogOnlySender implements PushSender {
  async send(message: PushMessage): Promise<void> {
    logger.info(`[push:dev] to=${message.token} title="${message.title}" body="${message.body}"`)
  }
}

export const pushSender: PushSender = isPushEnabled() ? new FcmSender() : new LogOnlySender()

export async function sendPush(push: PushMessage): Promise<void> {
  await pushSender.send(push)
}
