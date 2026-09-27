import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/database/pool.js'
import { resetDb } from './helpers/db.js'
import { createApprovedSenior, createApprovedVolunteer, createUser } from './fixtures.js'
import { signAccessToken } from '../src/modules/auth/tokens.service.js'
import { createApp } from '../src/app.js'

const app = () => request(createApp())

/** Full Authorization header value; the middleware rejects a bare token. */
function authHeader(user: { id: string; role: 'senior' | 'volunteer' | 'police' | null; is_active: boolean }): string {
  return `Bearer ${signAccessToken({ id: user.id, role: user.role, isActive: user.is_active })}`
}

async function policeToken(): Promise<string> {
  return authHeader(await createUser({ role: 'police' }))
}

/** An approved user with a profile: the shape a real senior has. */
async function seedSenior(email = 'senior-dir@example.com'): Promise<string> {
  return (await createApprovedSenior({ email })).id
}

async function seedRequest(seniorId: string, status = 'DISPATCHED'): Promise<string> {
  const res = await pool.query(
    `INSERT INTO help_requests (senior_id, category, description, latitude, longitude, source, status)
     VALUES ($1, 'grocery_assistance', 'need milk', 12.9716, 77.5946, 'flutter_app', $2)
     RETURNING id`,
    [seniorId, status],
  )
  return res.rows[0].id as string
}

describe('GET /api/police/seniors', () => {
  beforeEach(resetDb)

  it('lists approved seniors with their profile and derived verification state', async () => {
    await seedSenior()
    const res = await app().get('/api/police/seniors').set('Authorization', await policeToken())

    expect(res.status).toBe(200)
    expect(res.body.data.seniors).toHaveLength(1)
    const senior = res.body.data.seniors[0]
    expect(senior.email).toBe('senior-dir@example.com')
    expect(senior.is_verified).toBe(true)
    expect(senior.verification_status).toBe('APPROVED')
    // numeric comes back from pg as a string; the console compares these.
    expect(typeof senior.home_latitude).toBe('number')
  })

  it('includes a role=senior user who has not completed their profile yet', async () => {
    // The approval queue needs to see exactly this person, so hiding them would
    // make them unreviewable.
    await createUser({ email: 'no-profile@example.com', role: 'senior' })
    const res = await app().get('/api/police/seniors').set('Authorization', await policeToken())

    expect(res.status).toBe(200)
    expect(res.body.data.seniors).toHaveLength(1)
    expect(res.body.data.seniors[0].full_name).toBeNull()
    expect(res.body.data.seniors[0].verification_status).toBe('NONE')
  })

  it('excludes volunteers and police', async () => {
    await createApprovedVolunteer({ email: 'vol@example.com' })
    await createUser({ role: 'police' })
    const res = await app().get('/api/police/seniors').set('Authorization', await policeToken())

    expect(res.body.data.seniors).toHaveLength(0)
  })

  it('filters by search across name, email and phone', async () => {
    await seedSenior('findme@example.com')
    await seedSenior('other@example.com')
    const token = await policeToken()

    const res = await app().get('/api/police/seniors?search=findme').set('Authorization', token)
    expect(res.body.data.seniors).toHaveLength(1)
    expect(res.body.data.seniors[0].email).toBe('findme@example.com')
  })

  it('filters by verification status consistently with the rows it returns', async () => {
    await seedSenior('approved@example.com')
    const pending = await createUser({ email: 'pending@example.com', role: 'senior' })
    await pool.query(
      `INSERT INTO user_verifications (user_id, role, form_data, status) VALUES ($1, 'senior', '{}', 'PENDING')`,
      [pending.id],
    )
    const token = await policeToken()

    const approved = await app().get('/api/police/seniors?status=APPROVED').set('Authorization', token)
    expect(approved.body.data.seniors.map((s: { email: string }) => s.email)).toEqual([
      'approved@example.com',
    ])

    const none = await app().get('/api/police/seniors?status=NONE').set('Authorization', token)
    expect(none.body.data.seniors.map((s: { email: string }) => s.email)).toEqual([
      'pending@example.com',
    ])
  })

  it('rejects a non-police caller with 403', async () => {
    const senior = await createApprovedSenior()
    const res = await app()
      .get('/api/police/seniors')
      .set('Authorization', authHeader(senior))

    expect(res.status).toBe(403)
  })

  it('requires authentication', async () => {
    expect((await app().get('/api/police/seniors')).status).toBe(401)
  })

  it('rejects a malformed id', async () => {
    const res = await app()
      .get('/api/police/seniors/not-a-uuid')
      .set('Authorization', await policeToken())
    expect(res.status).toBe(400)
  })
})

describe('GET /api/police/seniors/:id', () => {
  beforeEach(resetDb)

  it('returns the profile with verification, request and emergency history', async () => {
    const seniorId = await seedSenior()
    const requestId = await seedRequest(seniorId)
    await pool.query(
      `INSERT INTO emergency_events (senior_id, trigger_type, source, status)
       VALUES ($1, 'keyword_repetition', 'flutter_app', 'LOGGED')`,
      [seniorId],
    )
    const res = await app().get(`/api/police/seniors/${seniorId}`).set('Authorization', await policeToken())

    expect(res.status).toBe(200)
    const s = res.body.data.senior
    expect(s.email).toBe('senior-dir@example.com')
    expect(s.verifications).toHaveLength(1)
    expect(s.verifications[0].status).toBe('APPROVED')
    expect(s.requests.map((r: { id: string }) => r.id)).toEqual([requestId])
    expect(s.emergencies).toHaveLength(1)
  })

  it('surfaces the emergency contact from the profile column', async () => {
    const seniorId = await seedSenior()
    await pool.query(
      `UPDATE senior_profiles SET emergency_contact = $2 WHERE user_id = $1`,
      [seniorId, JSON.stringify({ name: 'Asha', phone: '+919999900099', relation: 'daughter' })],
    )
    const res = await app().get(`/api/police/seniors/${seniorId}`).set('Authorization', await policeToken())

    expect(res.body.data.senior.emergency_contact).toMatchObject({
      name: 'Asha',
      relation: 'daughter',
    })
  })

  it('never returns the aadhaar number', async () => {
    // A government identifier the console has no use for. Returning it would
    // widen the blast radius of a stolen police session for nothing.
    const seniorId = await seedSenior()
    await pool.query(`UPDATE senior_profiles SET aadhaar_number = '123456789012' WHERE user_id = $1`, [
      seniorId,
    ])
    const res = await app().get(`/api/police/seniors/${seniorId}`).set('Authorization', await policeToken())

    expect(res.body.data.senior.aadhaar_number).toBeUndefined()
    expect(JSON.stringify(res.body)).not.toContain('123456789012')
  })

  it('404s for a volunteer, so the console cannot probe which ids hold which role', async () => {
    const volunteer = await createApprovedVolunteer()
    const res = await app()
      .get(`/api/police/seniors/${volunteer.id}`)
      .set('Authorization', await policeToken())

    expect(res.status).toBe(404)
  })

  it('404s for an unknown id', async () => {
    const res = await app()
      .get('/api/police/seniors/00000000-0000-0000-0000-000000000000')
      .set('Authorization', await policeToken())
    expect(res.status).toBe(404)
  })

  it('rejects a non-police caller with 403', async () => {
    const senior = await createApprovedSenior()
    const res = await app()
      .get(`/api/police/seniors/${senior.id}`)
      .set('Authorization', authHeader(senior))

    expect(res.status).toBe(403)
  })
})

describe('GET /api/police/volunteers/:id', () => {
  beforeEach(resetDb)

  it('returns the volunteer record with their assignment history', async () => {
    const volunteer = await createApprovedVolunteer({ email: 'detail-vol@example.com', skills: ['nursing'] })
    const res = await app()
      .get(`/api/police/volunteers/${volunteer.id}`)
      .set('Authorization', await policeToken())

    expect(res.status).toBe(200)
    const v = res.body.data.volunteer
    expect(v.email).toBe('detail-vol@example.com')
    expect(v.skills).toEqual(['nursing'])
    expect(v.is_verified).toBe(true)
    expect(v.assignments).toEqual([])
  })

  it('records an assignment from the dispatch batch, not from a join table', async () => {
    const volunteer = await createApprovedVolunteer()
    const seniorId = await seedSenior()
    const requestId = await seedRequest(seniorId)
    await pool.query(
      `UPDATE help_requests
         SET assigned_volunteer_id = $2,
             dispatch_batch = $3::jsonb,
             status = 'IN_PROGRESS'
       WHERE id = $1`,
      [
        requestId,
        volunteer.id,
        JSON.stringify([{ id: volunteer.id, latitude: 12.97, longitude: 77.59, distance_m: 1200 }]),
      ],
    )

    const res = await app()
      .get(`/api/police/volunteers/${volunteer.id}`)
      .set('Authorization', await policeToken())

    expect(res.status).toBe(200)
    const v = res.body.data.volunteer
    expect(v.active_request_id).toBe(requestId)
    expect(v.assignments).toHaveLength(1)
    expect(v.assignments[0].request_id).toBe(requestId)
    expect(v.assignments[0].was_assigned).toBe(true)
    expect(v.assignments[0].declined).toBe(false)
  })

  it('marks a declined offer so a slow dispatch can be reviewed', async () => {
    const volunteer = await createApprovedVolunteer()
    const seniorId = await seedSenior()
    const requestId = await seedRequest(seniorId)
    await pool.query(
      `UPDATE help_requests
         SET dispatch_batch = $2::jsonb
       WHERE id = $1`,
      [requestId, JSON.stringify([{ id: volunteer.id, latitude: 12.97, longitude: 77.59, distance_m: 900 }])],
    )
    await pool.query(
      `INSERT INTO request_declines (request_id, volunteer_id, reason) VALUES ($1, $2, 'too far')`,
      [requestId, volunteer.id],
    )

    const res = await app()
      .get(`/api/police/volunteers/${volunteer.id}`)
      .set('Authorization', await policeToken())

    expect(res.body.data.volunteer.assignments[0].declined).toBe(true)
    expect(res.body.data.volunteer.assignments[0].was_assigned).toBe(false)
  })

  it('404s for a senior', async () => {
    const senior = await createApprovedSenior()
    const res = await app()
      .get(`/api/police/volunteers/${senior.id}`)
      .set('Authorization', await policeToken())

    expect(res.status).toBe(404)
  })

  it('rejects a non-police caller with 403', async () => {
    const senior = await createApprovedSenior()
    const res = await app()
      .get(`/api/police/volunteers/${senior.id}`)
      .set('Authorization', authHeader(senior))

    expect(res.status).toBe(403)
  })

  it('rejects a malformed id', async () => {
    const res = await app()
      .get('/api/police/volunteers/nope')
      .set('Authorization', await policeToken())
    expect(res.status).toBe(400)
  })
})
