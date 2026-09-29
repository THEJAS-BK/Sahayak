import { beforeEach, describe, expect, it } from 'vitest'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '../src/database/pool.js'
import { resetDb } from './helpers/db.js'
import { clearSentEmails, createUser, lastOtpCode } from './fixtures.js'

const app = () => request(createApp())

async function requestOtp(email: string) {
  const res = await app().post('/api/auth/otp/request').send({ email })
  expect(res.status).toBe(200)
  expect(res.body).toEqual({ success: true, data: { sent: true } })
  return { code: lastOtpCode() }
}

async function verify(email: string, code: string) {
  return app().post('/api/auth/otp/verify').send({ email, code })
}

describe('auth', () => {
  beforeEach(async () => {
    await resetDb()
    clearSentEmails()
  })

  it('A-01 + A-02: request OTP and verify, creating a fresh user', async () => {
    const email = 'senior@example.com'
    const { code } = await requestOtp(email)

    const res = await verify(email, code)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.access_token).toBeTruthy()
    expect(res.body.data.refresh_token).toBeTruthy()
    expect(res.body.data.user).toMatchObject({ role: null, is_active: false, verification_status: 'NONE' })
  })

  it('A-02: invalid code → 401', async () => {
    const email = 'x@example.com'
    await requestOtp(email)
    const res = await verify(email, '000000')
    expect(res.status).toBe(401)
    // INVALID_OTP, not UNAUTHENTICATED: clients treat UNAUTHENTICATED as "your
    // access token is dead" and sign the user out, which a mistyped code on the
    // sign-in form must not do.
    expect(res.body.error.code).toBe('INVALID_OTP')
  })

  it('A-02: a used code cannot be reused → 401 (BR-07)', async () => {
    const email = 'once@example.com'
    const { code } = await requestOtp(email)
    expect((await verify(email, code)).status).toBe(200)
    const again = await verify(email, code)
    expect(again.status).toBe(401)
  })

  it('A-02: expired code → 401', async () => {
    const email = 'expired@example.com'
    const { code } = await requestOtp(email)
    await pool.query("UPDATE otp_codes SET expires_at = now() - interval '1 minute' WHERE email = $1", [email])
    const res = await verify(email, code)
    expect(res.status).toBe(401)
  })

  it('A-02: 5 failed attempts per email in 10 min → 429', async () => {
    const email = 'brute@example.com'
    await requestOtp(email)
    for (let i = 0; i < 5; i += 1) {
      const res = await verify(email, '000000')
      expect(res.status).toBe(401)
    }
    const blocked = await verify(email, '000000')
    expect(blocked.status).toBe(429)
    expect(blocked.body.error.code).toBe('RATE_LIMITED')
  })

  it('A-01: 3 OTPs per email per 10 minutes → 429 on the 4th', async () => {
    const email = 'flood@example.com'
    await requestOtp(email)
    await requestOtp(email)
    await requestOtp(email)
    const fourth = await app().post('/api/auth/otp/request').send({ email })
    expect(fourth.status).toBe(429)
  })

  it('A-01 + A-03: refresh rotates; old token is dead', async () => {
    const email = 'rotate@example.com'
    const { code } = await requestOtp(email)
    const first = await verify(email, code)
    const refresh1 = first.body.data.refresh_token

    const second = await app().post('/api/auth/refresh').send({ refresh_token: refresh1 })
    expect(second.status).toBe(200)
    const refresh2 = second.body.data.refresh_token
    expect(refresh2).toBeTruthy()
    expect(refresh2).not.toBe(refresh1)

    const reuse = await app().post('/api/auth/refresh').send({ refresh_token: refresh1 })
    expect(reuse.status).toBe(401)

    const stillValidPair = await app().post('/api/auth/refresh').send({ refresh_token: refresh2 })
    expect(stillValidPair.status).toBe(401)
  })

  it('A-04: logout revokes the refresh token', async () => {
    const email = 'bye@example.com'
    const { code } = await requestOtp(email)
    const res = await verify(email, code)
    const refresh = res.body.data.refresh_token

    const logout = await app().post('/api/auth/logout').send({ refresh_token: refresh })
    expect(logout.status).toBe(200)

    const after = await app().post('/api/auth/refresh').send({ refresh_token: refresh })
    expect(after.status).toBe(401)
  })

  it('police login: 8h access token, no refresh token issued', async () => {
    const email = 'officer@example.com'
    await createUser({ email, role: 'police', isActive: true })
    const { code } = await requestOtp(email)
    const res = await verify(email, code)
    expect(res.status).toBe(200)
    expect(res.body.data.refresh_token).toBeUndefined()

    const decoded = jwt.decode(res.body.data.access_token) as jwt.JwtPayload
    expect(decoded.exp! - decoded.iat!).toBe(8 * 3600)
    expect(res.body.data.user).toMatchObject({ role: 'police', is_active: true })
  })

  it('A-05: /me returns own snapshot incl. verification status', async () => {
    const email = 'me@example.com'
    const { code } = await requestOtp(email)
    const res = await verify(email, code)
    const access = res.body.data.access_token

    const me = await app().get('/api/me').set('Authorization', `Bearer ${access}`)
    expect(me.status).toBe(200)
    expect(me.body.data).toMatchObject({
      email,
      role: null,
      is_active: false,
      verification_status: 'NONE',
      profile: null,
    })
  })

  it('A-05: /me without token → 401', async () => {
    const res = await app().get('/api/me')
    expect(res.status).toBe(401)
  })

  it('A-06: senior can register an FCM token; audit row written', async () => {
    const email = 'push@example.com'
    const senior = await createUser({ email, role: 'senior', isActive: true })
    const { code } = await requestOtp(email)
    const verifyRes = await verify(email, code)
    const access = verifyRes.body.data.access_token
    const userId = verifyRes.body.data.user.id
    expect(userId).toBe(senior.id)

    const res = await app()
      .patch('/api/me/fcm-token')
      .set('Authorization', `Bearer ${access}`)
      .send({ fcm_token: 'device-token-123' })
    expect(res.status).toBe(200)
    expect(res.body.data.fcm_token).toBe('device-token-123')

    const user = await pool.query('SELECT fcm_token FROM users WHERE id = $1', [userId])
    expect(user.rows[0].fcm_token).toBe('device-token-123')

    const audit = await pool.query('SELECT action, actor_id FROM audit_logs WHERE entity_id = $1', [userId])
    expect(audit.rows).toMatchObject([{ action: 'user.fcm_token_updated', actor_id: userId }])
  })
})