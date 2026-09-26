import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk'
import { config } from '../../config/index.js'
import { errors } from '../../lib/errors.js'

/**
 * Returns LiveKit connection details for a one-off voice session.
 * The room is unique per session, so each tap of the mic starts a fresh
 * conversation. Identity is the sahayak user id.
 *
 * The token also carries the agent dispatch: the voice agent runs as a
 * separately deployed LiveKit worker, so nothing joins the room unless the
 * end-user's token names it. Dispatching from the token (rather than creating
 * the room server-side) keeps this endpoint a pure token issuer — the app
 * connects, the agent is pulled in, and the agent publishes the structured
 * request on the `sahayak_request` data channel.
 */
export async function createVoiceSession(userId: string): Promise<{ url: string; token: string; room: string }> {
  const { url, apiKey, apiSecret, tokenTtlS, agentName } = config.livekit
  if (!url || !apiKey || !apiSecret) {
    throw errors.server('Voice is not configured')
  }

  const room = `voice_${userId}_${Date.now()}`
  const at = new AccessToken(apiKey, apiSecret, { identity: userId, ttl: tokenTtlS })
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true })
  at.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName,
        metadata: JSON.stringify({ userId }),
      }),
    ],
  })

  return { url, token: await at.toJwt(), room }
}
