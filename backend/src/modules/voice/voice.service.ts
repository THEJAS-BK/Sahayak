import { AccessToken } from 'livekit-server-sdk'
import { config } from '../../config/index.js'
import { errors } from '../../lib/errors.js'

/**
 * Returns LiveKit connection details for a one-off voice session.
 * The room is unique per session, so each tap of the mic starts a fresh
 * conversation. Identity is the sahayak user id.
 */
export async function createVoiceSession(userId: string): Promise<{ url: string; token: string; room: string }> {
  const { url, apiKey, apiSecret, tokenTtlS } = config.livekit
  if (!url || !apiKey || !apiSecret) {
    throw errors.server('Voice is not configured')
  }

  const room = `voice_${userId}_${Date.now()}`
  const at = new AccessToken(apiKey, apiSecret, { identity: userId, ttl: tokenTtlS })
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true })

  return { url, token: await at.toJwt(), room }
}