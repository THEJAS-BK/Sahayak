import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { signAccessToken } from '../src/modules/auth/tokens.service.js'

const livekitConfigured = Boolean(
  process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET,
)

const app = createApp()
const seniorToken = signAccessToken({ id: randomUUID(), role: 'senior', isActive: true })

describe('voice sessions — auth', () => {
  it('POST /api/voice-sessions without token → 401', async () => {
    const res = await request(app).post('/api/voice-sessions')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Access token required' } })
  })

  it('POST /api/voice-sessions with invalid token → 401', async () => {
    const res = await request(app).post('/api/voice-sessions').set('Authorization', 'Bearer not-a-jwt')
    expect(res.status).toBe(401)
  })
})

describe.skipIf(!livekitConfigured)('voice sessions — token issuance', () => {
  it('POST /api/voice-sessions with valid token → 200 { url, token, room }', async () => {
    const res = await request(app).post('/api/voice-sessions').set('Authorization', `Bearer ${seniorToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toMatchObject({
      url: process.env.LIVEKIT_URL,
      token: expect.any(String),
      room: expect.stringMatching(/^voice_/),
    })
  })

  it('mints a distinct room per request', async () => {
    const a = await request(app).post('/api/voice-sessions').set('Authorization', `Bearer ${seniorToken}`)
    const b = await request(app).post('/api/voice-sessions').set('Authorization', `Bearer ${seniorToken}`)
    expect(a.body.data.room).not.toBe(b.body.data.room)
  })
})

describe('voice sessions — LiveKit not configured', () => {
  it('POST /api/voice-sessions → 500 INTERNAL', async () => {
    vi.resetModules()
    const original = {
      LIVEKIT_URL: process.env['LIVEKIT_URL'],
      LIVEKIT_API_KEY: process.env['LIVEKIT_API_KEY'],
      LIVEKIT_API_SECRET: process.env['LIVEKIT_API_SECRET'],
    }
    process.env['LIVEKIT_URL'] = ''
    process.env['LIVEKIT_API_KEY'] = ''
    process.env['LIVEKIT_API_SECRET'] = ''
    try {
      const { createApp: freshApp } = await import('../src/app.js')
      const res = await request(freshApp()).post('/api/voice-sessions').set('Authorization', `Bearer ${seniorToken}`)
      expect(res.status).toBe(500)
      expect(res.body.error.code).toBe('INTERNAL')
    } finally {
      for (const [k, v] of Object.entries(original)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  })
})