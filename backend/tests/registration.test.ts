import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '../src/database/pool.js'
import { resetDb } from './helpers/db.js'
import { clearSentEmails, createUser, lastOtpCode } from './fixtures.js'
import { signAccessToken } from '../src/modules/auth/tokens.service.js'

const app = () => request(createApp())

function authHeader(user: { id: string; role: string | null; is_active: boolean }): string {
  return `Bearer ${signAccessToken({ id: user.id, role: user.role, isActive: user.is_active })}`
}

async function requestOtp(email: string) {
  await app().post('/api/auth/otp/request').send({ email })
  return lastOtpCode()
}

async function loginOrSignup(email: string) {
  const code = await requestOtp(email)
  const res = await app().post('/api/auth/otp/verify').send({ email, code })
  expect(res.status).toBe(200)
  return { access_token: res.body.data.access_token as string, user_id: res.body.data.user.id as string }
}

const SENIOR_FORM = {
  full_name: 'Test Senior',
  phone_number: '+919999900001',
  home_latitude: 12.97,
  home_longitude: 77.59,
  preferred_language: 'kannada',
  aadhaar_number: '123456789012',
  emergency_contact: { name: 'Contact One', phone: '+919999900002', relation: 'daughter' },
}

const VOLUNTEER_FORM = {
  full_name: 'Test Volunteer',
  phone_number: '+919999900003',
  organization: 'NGO Name',
  skills: ['nursing', 'first_aid'],
  base_latitude: 12.97,
  base_longitude: 77.59,
  aadhaar_number: '098765432109',
  club_id: 'CLUB-001',
}

describe('registration & verification', () => {
  beforeEach(async () => {
    await resetDb()
    clearSentEmails()
  })

  it('R-01: senior registration creates a PENDING verification', async () => {
    const { access_token } = await loginOrSignup('senior-reg@example.com')
    const res = await app()
      .post('/api/registrations/senior')
      .set('Authorization', `Bearer ${access_token}`)
      .send(SENIOR_FORM)
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toMatchObject({ status: 'PENDING' })
    expect(res.body.data.verification_id).toBeTruthy()
  })

  it('R-02: volunteer registration creates a PENDING verification', async () => {
    const { access_token } = await loginOrSignup('vol-reg@example.com')
    const res = await app()
      .post('/api/registrations/volunteer')
      .set('Authorization', `Bearer ${access_token}`)
      .send(VOLUNTEER_FORM)
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('PENDING')
  })

  it('R-01/R-02: aadhaar_number must be exactly 12 digits → 400', async () => {
    const { access_token } = await loginOrSignup('bad-aadhaar@example.com')
    const res = await app()
      .post('/api/registrations/senior')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ ...SENIOR_FORM, aadhaar_number: '12345' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_INPUT')
  })

  it('R-01/R-02: aadhaar_number is required → 400', async () => {
    const { access_token } = await loginOrSignup('no-aadhaar@example.com')
    const { aadhaar_number: _omit, ...noAadhaar } = SENIOR_FORM
    const res = await app()
      .post('/api/registrations/senior')
      .set('Authorization', `Bearer ${access_token}`)
      .send(noAadhaar)
    expect(res.status).toBe(400)
  })

  it('R-02: club_id is optional', async () => {
    const { access_token } = await loginOrSignup('no-club@example.com')
    const { club_id: _omit, ...noClub } = VOLUNTEER_FORM
    const res = await app()
      .post('/api/registrations/volunteer')
      .set('Authorization', `Bearer ${access_token}`)
      .send(noClub)
    expect(res.status).toBe(201)
  })

  it('R-03: poll verification status returns latest verification', async () => {
    const { access_token } = await loginOrSignup('poll@example.com')
    await app()
      .post('/api/registrations/senior')
      .set('Authorization', `Bearer ${access_token}`)
      .send(SENIOR_FORM)

    const me = await app().get('/api/registrations/me').set('Authorization', `Bearer ${access_token}`)
    expect(me.status).toBe(200)
    expect(me.body.data.verification).toMatchObject({ status: 'PENDING', role: 'senior' })
  })

  it('R-03: no prior registration returns verification: null', async () => {
    const { access_token } = await loginOrSignup('no-prior@example.com')
    const me = await app().get('/api/registrations/me').set('Authorization', `Bearer ${access_token}`)
    expect(me.status).toBe(200)
    expect(me.body.data.verification).toBeNull()
  })

  it('duplicate senior registration while PENDING → 409', async () => {
    const { access_token } = await loginOrSignup('dup-pending@example.com')
    await app()
      .post('/api/registrations/senior')
      .set('Authorization', `Bearer ${access_token}`)
      .send(SENIOR_FORM)

    const dup = await app()
      .post('/api/registrations/senior')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ ...SENIOR_FORM, full_name: 'Duplicate' })
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('VERIFICATION_EXISTS')
  })

  it('registration with role already set → 409', async () => {
    const user = await createUser({ role: 'senior', isActive: true })
    const code = await requestOtp(user.email)
    const res = await app().post('/api/auth/otp/verify').send({ email: user.email, code })
    expect(res.status).toBe(200)
    const access = res.body.data.access_token

    const reg = await app()
      .post('/api/registrations/senior')
      .set('Authorization', `Bearer ${access}`)
      .send(SENIOR_FORM)
    expect(reg.status).toBe(409)
    expect(reg.body.error.code).toBe('ROLE_ALREADY_SET')
  })

  it('V-01 + V-02 + V-03: police list, fetch detail, and approve a senior registration', async () => {
    const seniorEmail = 'senior-approve@example.com'
    const { access_token: seniorToken } = await loginOrSignup(seniorEmail)
    const regRes = await app()
      .post('/api/registrations/senior')
      .set('Authorization', `Bearer ${seniorToken}`)
      .send({ ...SENIOR_FORM, fcm_token: 'dev-fcm-token-xyz' })
    expect(regRes.status).toBe(201)
    const verId = regRes.body.data.verification_id

    const police = await createUser({ role: 'police', isActive: true })
    const policeToken = authHeader(police)

    const list = await app().get('/api/verifications').set('Authorization', policeToken)
    expect(list.status).toBe(200)
    expect(list.body.data.verifications.length).toBe(1)
    expect(list.body.data.verifications[0]).toMatchObject({ role: 'senior', status: 'PENDING', email: seniorEmail })

    const detail = await app().get(`/api/verifications/${verId}`).set('Authorization', policeToken)
    expect(detail.status).toBe(200)
    expect(detail.body.data.verification.user.email).toBe(seniorEmail)
    expect(detail.body.data.verification.form_data.full_name).toBe(SENIOR_FORM.full_name)

    const approve = await app()
      .patch(`/api/verifications/${verId}`)
      .set('Authorization', policeToken)
      .send({ status: 'APPROVED', reason: 'Looks good' })
    expect(approve.status).toBe(200)
    expect(approve.body.data.verification).toMatchObject({ status: 'APPROVED', role: 'senior' })

    const seniorUser = await pool.query('SELECT role, is_active FROM users WHERE email = $1', [seniorEmail])
    expect(seniorUser.rows[0]).toMatchObject({ role: 'senior', is_active: true })

    const profile = await pool.query('SELECT full_name, phone_number, aadhaar_number FROM senior_profiles WHERE user_id = $1', [
      approve.body.data.verification.user_id,
    ])
    expect(profile.rows[0].full_name).toBe(SENIOR_FORM.full_name)
    expect(profile.rows[0].phone_number).toBe(SENIOR_FORM.phone_number)
    expect(profile.rows[0].aadhaar_number).toBe(SENIOR_FORM.aadhaar_number)

    const fcm = await pool.query('SELECT fcm_token FROM user_verifications WHERE id = $1', [verId])
    expect(fcm.rows[0].fcm_token).toBe('dev-fcm-token-xyz')

    const audit = await pool.query("SELECT action FROM audit_logs WHERE entity_id = $1", [verId])
    expect(audit.rows.some((r: { action: string }) => r.action === 'verification.approved')).toBe(true)

    const updatedVer = await app().get(`/api/verifications/${verId}`).set('Authorization', policeToken)
    expect(updatedVer.body.data.verification).toMatchObject({ status: 'APPROVED', review_reason: 'Looks good' })
    expect(updatedVer.body.data.verification.reviewed_at).toBeTruthy()
  })

  it('V-03: approve volunteer → volunteer profile inserted', async () => {
    const email = 'vol-approve@example.com'
    const { access_token } = await loginOrSignup(email)
    const reg = await app()
      .post('/api/registrations/volunteer')
      .set('Authorization', `Bearer ${access_token}`)
      .send(VOLUNTEER_FORM)
    expect(reg.status).toBe(201)
    const verId = reg.body.data.verification_id

    const police = await createUser({ role: 'police', isActive: true })
    const approve = await app()
      .patch(`/api/verifications/${verId}`)
      .set('Authorization', authHeader(police))
      .send({ status: 'APPROVED' })
    expect(approve.status).toBe(200)

    const profile = await pool.query('SELECT skills, organization, aadhaar_number, club_id FROM volunteer_profiles WHERE user_id = $1', [
      approve.body.data.verification.user_id,
    ])
    expect(profile.rows[0].skills).toEqual(VOLUNTEER_FORM.skills)
    expect(profile.rows[0].organization).toBe(VOLUNTEER_FORM.organization)
    expect(profile.rows[0].aadhaar_number).toBe(VOLUNTEER_FORM.aadhaar_number)
    expect(profile.rows[0].club_id).toBe(VOLUNTEER_FORM.club_id)
  })

  it('V-03: reject a pending verification → status REJECTED, no profile created', async () => {
    const { access_token } = await loginOrSignup('reject-me@example.com')
    const reg = await app()
      .post('/api/registrations/senior')
      .set('Authorization', `Bearer ${access_token}`)
      .send(SENIOR_FORM)
    const verId = reg.body.data.verification_id

    const police = await createUser({ role: 'police', isActive: true })
    const rej = await app()
      .patch(`/api/verifications/${verId}`)
      .set('Authorization', authHeader(police))
      .send({ status: 'REJECTED', reason: 'Invalid ID' })
    expect(rej.status).toBe(200)
    expect(rej.body.data.verification).toMatchObject({ status: 'REJECTED' })

    const user = await pool.query('SELECT role, is_active FROM users WHERE email = $1', ['reject-me@example.com'])
    expect(user.rows[0].role).toBeNull()
    expect(user.rows[0].is_active).toBe(false)

    const profiles = await pool.query('SELECT 1 FROM senior_profiles WHERE user_id = $1', [
      rej.body.data.verification.user_id,
    ])
    expect(profiles.rowCount).toBe(0)
  })

  it('V-03: approve already reviewed verification → 409', async () => {
    const { access_token } = await loginOrSignup('already-reviewed@example.com')
    const reg = await app()
      .post('/api/registrations/senior')
      .set('Authorization', `Bearer ${access_token}`)
      .send(SENIOR_FORM)
    const verId = reg.body.data.verification_id

    const police = await createUser({ role: 'police', isActive: true })
    const header = authHeader(police)
    await app()
      .patch(`/api/verifications/${verId}`)
      .set('Authorization', header)
      .send({ status: 'APPROVED' })

    const dup = await app()
      .patch(`/api/verifications/${verId}`)
      .set('Authorization', header)
      .send({ status: 'REJECTED', reason: 'Changed mind' })
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('INVALID_STATE')
  })

  it('V-01: non-police user cannot list verifications → 403', async () => {
    const { access_token } = await loginOrSignup('not-police@example.com')
    const res = await app().get('/api/verifications').set('Authorization', `Bearer ${access_token}`)
    expect(res.status).toBe(403)
  })

  it('V-01: unapproved police user cannot list verifications → 403', async () => {
    const inactivePolice = await createUser({ role: 'police', isActive: false })
    const code = await requestOtp(inactivePolice.email)
    const login = await app().post('/api/auth/otp/verify').send({ email: inactivePolice.email, code })
    expect(login.status).toBe(200)
    const access = login.body.data.access_token

    const res = await app().get('/api/verifications').set('Authorization', `Bearer ${access}`)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE')
  })

  it('V-03: approve stores fcm_token on user_verifications row', async () => {
    const { access_token } = await loginOrSignup('fcm-check@example.com')
    const reg = await app()
      .post('/api/registrations/senior')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ ...SENIOR_FORM, fcm_token: 'token-abc-123' })
    const verId = reg.body.data.verification_id

    const row = await pool.query('SELECT fcm_token FROM user_verifications WHERE id = $1', [verId])
    expect(row.rows[0].fcm_token).toBe('token-abc-123')
  })
})