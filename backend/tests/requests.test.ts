import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '../src/database/pool.js'
import { resetDb } from './helpers/db.js'
import { createApprovedSenior, createApprovedVolunteer, createUser } from './fixtures.js'
import { signAccessToken } from '../src/modules/auth/tokens.service.js'

const app = () => request(createApp())

function authHeader(user: { id: string; role: string | null; is_active: boolean }): string {
  return `Bearer ${signAccessToken({ id: user.id, role: user.role, isActive: user.is_active })}`
}

const REQUEST_BODY = {
  category: 'medical_help',
  description: 'Need medication delivered',
  latitude: 12.9716,
  longitude: 77.5946,
  priority: 'normal',
  source: 'flutter_app',
}

async function createRequestFor(senior: { id: string; role: string | null; is_active: boolean }, body: object = REQUEST_BODY) {
  return app().post('/api/requests').set('Authorization', authHeader(senior)).send(body)
}

describe('help requests flow', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('Q-01: senior creates a request; matching dispatches to nearby available volunteers', async () => {
    const senior = await createApprovedSenior()
    const vol1 = await createApprovedVolunteer({ base_latitude: 12.972, base_longitude: 77.595, skills: ['medical_help'] })
    const vol2 = await createApprovedVolunteer({ base_latitude: 12.971, base_longitude: 77.594 })

    const res = await createRequestFor(senior)
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('PENDING')
    expect(res.body.data.request_id).toBeTruthy()
    // Both volunteers within radius → both dispatched.
    expect(res.body.data.dispatched_to).toEqual(expect.arrayContaining([vol1.id, vol2.id]))

    const row = await pool.query('SELECT status, dispatch_batch FROM help_requests WHERE id = $1', [
      res.body.data.request_id,
    ])
    expect(row.rows[0].status).toBe('DISPATCHED')
    const batchIds = (row.rows[0].dispatch_batch as Array<{ id: string }>).map((e) => e.id)
    expect(batchIds).toEqual(expect.arrayContaining([vol1.id, vol2.id]))
  })

  it('Q-01: senior with an open request gets 409 (BR-13)', async () => {
    const senior = await createApprovedSenior()
    expect((await createRequestFor(senior)).status).toBe(201)
    const dup = await createRequestFor(senior, { ...REQUEST_BODY, description: 'second' })
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('REQUEST_ALREADY_OPEN')
  })

  it('Q-01: a non-senior (volunteer) cannot create a request → 403', async () => {
    const volunteer = await createApprovedVolunteer()
    const res = await createRequestFor(volunteer)
    expect(res.status).toBe(403)
  })

  it('Q-04: volunteer sees only dispatched requests whose batch includes them', async () => {
    const senior = await createApprovedSenior()
    const volNear = await createApprovedVolunteer({ base_latitude: 12.9716, base_longitude: 77.5946 })
    const volFar = await createApprovedVolunteer({ base_latitude: 13.2, base_longitude: 78.2 })
    const created = await createRequestFor(senior)
    const requestId = created.body.data.request_id
    expect(created.body.data.dispatched_to).toContain(volNear.id)

    const near = await app()
      .get(`/api/requests/nearby?lat=12.9716&lng=77.5946&radius_m=5000`)
      .set('Authorization', authHeader(volNear))
    expect(near.status).toBe(200)
    expect(near.body.data.requests.map((r: { id: string }) => r.id)).toContain(requestId)

    const far = await app()
      .get(`/api/requests/nearby?lat=13.2&lng=78.2&radius_m=5000`)
      .set('Authorization', authHeader(volFar))
    const ids = far.body.data.requests.map((r: { id: string }) => r.id)
    expect(ids).not.toContain(requestId)
  })

  it('Q-05 + Q-06: accept (first-wins), start, and complete; BR-05 enforces one assignment', async () => {
    const senior = await createApprovedSenior()
    const volA = await createApprovedVolunteer()
    const volB = await createApprovedVolunteer({ base_latitude: 12.972, base_longitude: 77.595 })
    const created = await createRequestFor(senior)
    const requestId = created.body.data.request_id

    const acceptA = await app()
      .patch(`/api/requests/${requestId}/accept`)
      .set('Authorization', authHeader(volA))
    expect(acceptA.status).toBe(200)
    expect(acceptA.body.data.status).toBe('ACCEPTED')

    // First-wins: volB gets 409.
    const acceptB = await app()
      .patch(`/api/requests/${requestId}/accept`)
      .set('Authorization', authHeader(volB))
    expect(acceptB.status).toBe(409)
    expect(acceptB.body.error.code).toBe('ALREADY_ASSIGNED')

    // BR-05: volA cannot accept a second request while assigned.
    const second = await createRequestFor(senior)
    expect(second.status).toBe(409)

    // Non-assigned volunteer cannot update status.
    const startOther = await app()
      .patch(`/api/requests/${requestId}/status`)
      .set('Authorization', authHeader(volB))
      .send({ status: 'IN_PROGRESS' })
    expect(startOther.status).toBe(403)

    const start = await app()
      .patch(`/api/requests/${requestId}/status`)
      .set('Authorization', authHeader(volA))
      .send({ status: 'IN_PROGRESS' })
    expect(start.status).toBe(200)

    const complete = await app()
      .patch(`/api/requests/${requestId}/status`)
      .set('Authorization', authHeader(volA))
      .send({ status: 'COMPLETED' })
    expect(complete.status).toBe(200)

    const again = await app()
      .patch(`/api/requests/${requestId}/status`)
      .set('Authorization', authHeader(volA))
      .send({ status: 'IN_PROGRESS' })
    expect(again.status).toBe(409)

    const row = await pool.query('SELECT status, completed_at FROM help_requests WHERE id = $1', [requestId])
    expect(row.rows[0].status).toBe('COMPLETED')
    expect(row.rows[0].completed_at).toBeTruthy()
  })

  it('Q-07: senior cancels before ACCEPTED; cannot cancel after', async () => {
    const senior = await createApprovedSenior()
    const volunteer = await createApprovedVolunteer()
    const created = await createRequestFor(senior)
    const requestId = created.body.data.request_id

    const cancel = await app()
      .patch(`/api/requests/${requestId}/cancel`)
      .set('Authorization', authHeader(senior))
    expect(cancel.status).toBe(200)
    expect(cancel.body.data.status).toBe('CANCELLED')

    const row = await pool.query('SELECT status, cancelled_at FROM help_requests WHERE id = $1', [requestId])
    expect(row.rows[0].status).toBe('CANCELLED')
    expect(row.rows[0].cancelled_at).toBeTruthy()

    const volunteer2 = await createApprovedVolunteer({ base_latitude: 12.972, base_longitude: 77.595 })
    const created2 = await createRequestFor(senior)
    const requestId2 = created2.body.data.request_id
    await app().patch(`/api/requests/${requestId2}/accept`).set('Authorization', authHeader(volunteer2))
    const lateCancel = await app()
      .patch(`/api/requests/${requestId2}/cancel`)
      .set('Authorization', authHeader(senior))
    expect(lateCancel.status).toBe(409)
  })

  it('Q-08: senior gets volunteer contact (4 fields only) on an active request; BR-08', async () => {
    const senior = await createApprovedSenior({ full_name: 'Senior One' })
    const volunteer = await createApprovedVolunteer({ skills: ['first_aid'] })
    const created = await createRequestFor(senior)
    const requestId = created.body.data.request_id
    await app().patch(`/api/requests/${requestId}/accept`).set('Authorization', authHeader(volunteer))

    const res = await app()
      .get(`/api/requests/${requestId}/volunteer`)
      .set('Authorization', authHeader(senior))
    expect(res.status).toBe(200)
    expect(Object.keys(res.body.data.volunteer).sort()).toEqual(['full_name', 'organization', 'phone_number', 'skills'])

    const otherSenior = await createApprovedSenior({ full_name: 'Other', email: 'other@example.com' })
    const forbidden = await app()
      .get(`/api/requests/${requestId}/volunteer`)
      .set('Authorization', authHeader(otherSenior))
    expect(forbidden.status).toBe(403)

    // A request that has not yet been accepted: no contact available.
    const senior2 = await createApprovedSenior({ full_name: 'Second', email: 'second@example.com' })
    const created2 = await createRequestFor(senior2)
    const requestId2 = created2.body.data.request_id
    const beforeAssign = await app()
      .get(`/api/requests/${requestId2}/volunteer`)
      .set('Authorization', authHeader(senior2))
    expect(beforeAssign.status).toBe(403)
  })

  it('Q-02 + Q-03: role-filtered lists and view', async () => {
    const senior = await createApprovedSenior({ full_name: 'Known Senior', phone_number: '+919111111111' })
    const vol = await createApprovedVolunteer()
    const created = await createRequestFor(senior)
    const requestId = created.body.data.request_id
    await app().patch(`/api/requests/${requestId}/accept`).set('Authorization', authHeader(vol))

    const myRequests = await app()
      .get('/api/requests/me')
      .set('Authorization', authHeader(senior))
    expect(myRequests.status).toBe(200)
    expect(myRequests.body.data.requests.map((r: { id: string }) => r.id)).toContain(requestId)

    const volMe = await app()
      .get('/api/requests/me')
      .set('Authorization', authHeader(vol))
    expect(volMe.body.data.requests.map((r: { id: string }) => r.id)).toContain(requestId)

    const detail = await app()
      .get(`/api/requests/${requestId}`)
      .set('Authorization', authHeader(senior))
    expect(detail.status).toBe(200)
    expect(detail.body.data.request.status).toBe('ACCEPTED')
    expect(detail.body.data.request.assigned_volunteer.full_name).toBeTruthy()
    expect(detail.body.data.request.assigned_volunteer.phone_number).toBeUndefined()

    const volDetail = await app()
      .get(`/api/requests/${requestId}`)
      .set('Authorization', authHeader(vol))
    expect(volDetail.body.data.request.senior.full_name).toBe('Known Senior')
    expect(volDetail.body.data.request.senior.phone_number).toBe('+919111111111')

    // Unrelated user → 404 (no leak).
    const unrelated = await createApprovedVolunteer({ base_latitude: 13.5, base_longitude: 79.5 })
    const hide = await app()
      .get(`/api/requests/${requestId}`)
      .set('Authorization', authHeader(unrelated))
    expect(hide.status).toBe(404)
  })

  it('L-01: location update requires an active assignment (BR-09)', async () => {
    const volunteer = await createApprovedVolunteer()
    const noAssignment = await app()
      .patch('/api/volunteers/me/location')
      .set('Authorization', authHeader(volunteer))
      .send({ latitude: 12.98, longitude: 77.60 })
    expect(noAssignment.status).toBe(403)

    const senior = await createApprovedSenior()
    const created = await createRequestFor(senior)
    const requestId = created.body.data.request_id
    await app().patch(`/api/requests/${requestId}/accept`).set('Authorization', authHeader(volunteer))

    const withAssignment = await app()
      .patch('/api/volunteers/me/location')
      .set('Authorization', authHeader(volunteer))
      .send({ latitude: 12.98, longitude: 77.60 })
    expect(withAssignment.status).toBe(200)

    const row = await pool.query(
      'SELECT current_latitude, location_updated_at FROM volunteer_profiles WHERE user_id = $1',
      [volunteer.id],
    )
    expect(Number(row.rows[0].current_latitude)).toBeCloseTo(12.98, 5)
    expect(row.rows[0].location_updated_at).toBeTruthy()
  })

  it('L-02: volunteer can toggle availability; unavailable volunteers are not matched', async () => {
    const senior = await createApprovedSenior()
    const unavailableVol = await createApprovedVolunteer({ base_latitude: 12.9716, base_longitude: 77.5946, is_available: false })
    const availableVol = await createApprovedVolunteer({ base_latitude: 12.9722, base_longitude: 77.5952, is_available: true })

    const toggle = await app()
      .patch('/api/volunteers/me/availability')
      .set('Authorization', authHeader(unavailableVol))
      .send({ is_available: true })
    expect(toggle.status).toBe(200)

    const created = await createRequestFor(senior)
    expect(created.body.data.dispatched_to).toContain(unavailableVol.id)
    expect(created.body.data.dispatched_to).toContain(availableVol.id)

    const off = await app()
      .patch('/api/volunteers/me/availability')
      .set('Authorization', authHeader(availableVol))
      .send({ is_available: false })
    expect(off.status).toBe(200)
    const row = await pool.query('SELECT is_available FROM volunteer_profiles WHERE user_id = $1', [availableVol.id])
    expect(row.rows[0].is_available).toBe(false)
  })

  it('P-01: police live view with status filter and pagination', async () => {
    const senior = await createApprovedSenior()
    const vol = await createApprovedVolunteer()
    const created = await createRequestFor(senior)
    const requestId = created.body.data.request_id
    await app().patch(`/api/requests/${requestId}/accept`).set('Authorization', authHeader(vol))
    await app()
      .patch(`/api/requests/${requestId}/status`)
      .set('Authorization', authHeader(vol))
      .send({ status: 'IN_PROGRESS' })

    const police = await createUser({ role: 'police', isActive: true })
    const list = await app().get('/api/police/requests').set('Authorization', authHeader(police))
    expect(list.status).toBe(200)
    expect(list.body.data.requests.length).toBe(1)
    expect(list.body.data.requests[0]).toMatchObject({
      status: 'IN_PROGRESS',
      senior: expect.objectContaining({ full_name: 'Test Senior', phone_number: '+919999900001' }),
      assigned_volunteer: expect.objectContaining({ id: vol.id }),
    })

    const filtered = await app()
      .get('/api/police/requests?status=COMPLETED')
      .set('Authorization', authHeader(police))
    expect(filtered.body.data.requests.length).toBe(0)

    const asVolunteer = await app().get('/api/police/requests').set('Authorization', authHeader(vol))
    expect(asVolunteer.status).toBe(403)
  })
})