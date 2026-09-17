import { createRequire } from 'node:module'
import { config } from '../../config/index.js'
import { logger } from '../../lib/logger.js'

const require = createRequire(import.meta.url)

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
  private initialized = false

  private init(): void {
    if (this.initialized) return
    const raw = config.fcmServiceAccountPathOrJson
    if (!raw) throw new Error('FCM not configured')
    const admin = require('firebase-admin')
    if (!admin.apps || admin.apps.length === 0) {
      const credentialPath = raw.trim().startsWith('{') ? undefined : raw
      if (credentialPath) {
        admin.initializeApp({ credential: admin.credential.cert(credentialPath) })
      } else {
        admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) })
      }
    }
    this.initialized = true
  }

  async send(message: PushMessage): Promise<void> {
    try {
      this.init()
      const admin = require('firebase-admin')
      await admin.messaging().send({
        token: message.token,
        notification: { title: message.title, body: message.body },
        data: message.data,
        android: { priority: 'high' },
      })
    } catch (err) {
      // Push failures are logged, never thrown.
      logger.error('[push] send failed', err)
    }
  }
}

class LogOnlySender implements PushSender {
  async send(message: PushMessage): Promise<void> {
    logger.info(`[push:dev] to=${message.token} title="${message.title}" body="${message.body}"`)
  }
}

export const pushSender: PushSender = config.fcmServiceAccountPathOrJson
  ? new FcmSender()
  : new LogOnlySender()

export async function sendPush(push: PushMessage): Promise<void> {
  await pushSender.send(push)
}