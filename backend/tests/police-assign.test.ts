import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { pool } from '../src/database/pool.js'
import { resetDb } from './helpers/db.js'
import { createApprovedSenior, createApprovedVolunteer, createUser } from './fixtures.js'
import { signAccessToken } from '../src/modules/auth/tokens.service.js'
import { createApp } from '../src/app.js'

const app = request(createApp())

/** The volunteer directory is a police-only route (`/volunteers` is self-service). */
const POLICE_VOLUNTEERS = `/api/${'police'}/${'volunteers'}`

function tokenFor(user: { id: string; role: 'senior' | 'volunteer' | 'police' | null; is_active: boolean }): string {
  return signAccessToken({ id: user.id, role: user.role, isActive: user.is_active })
}

async function policeToken(): Promise<string> {
  return tokenFor(await createUser({ role: 'police' }))
}

async function seedRequest(overrides: { status?: string; assignedVolunteerId?: string | null } = {}) {
  const senior = await createApprovedSenior()
  const res = await pool.query(
    `INSERT INTO help_requests (senior_id, category, description, latitude, longitude, priority, source, status)
     VALUES ($1, 'grocery_assistance', 'Need rice and oil', 12.9716, 77.5946, 'urgent', 'voice_agent', $2)
     RETURNING id`,
    [senior.id, overrides.status ?? 'DISPATCHED'],
  )
  const id: string = res.rows[0].id
  if (overrides.assignedVolunteerId !== undefined) {
    await pool.query('UPDATE help_requests SET assigned_volunteer_id = $2 WHERE id = $1', [
      id,
      overrides.assignedVolunteerId,
    ])
  }
  return { id, seniorId: senior.id }
}

describe('PATCH /api/police/requests/:id/assign', () => {
  beforeAll(resetDb)

  it('assigns a request to a named volunteer and keeps it awaiting acceptance', async () => {
    await resetDb()
    const token = await policeToken()
    const { id } = await seedRequest()
    const volunteer = await createApprovedVolunteer({ base_latitude: 12.972, base_longitude: 77.595 })

    const res = await app.patch(`/api/police/requests/${id}/assign`).set('Authorization', `Bearer ${token}`).send({
      volunteer_id: volunteer.id,
    })

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ request_id: id, status: 'DISPATCHED' })

    const row = await pool.query(
      'SELECT status, assigned_volunteer_id, accepted_at, dispatch_batch FROM help_requests WHERE id = $1',
      [id],
    )
    expect(row.rows[0].status).toBe('DISPATCHED')
    expect(row.rows[0].assigned_volunteer_id).toBe(volunteer.id)
    // Police picks who is asked; the volunteer still has to accept.
    expect(row.rows[0].accepted_at).toBeNull()
    // Q-04 only surfaces requests whose dispatch_batch contains the volunteer.
    const batch = row.rows[0].dispatch_batch as Array<{ id: string }>
    expect(batch.map((e) => e.id)).toContain(volunteer.id)
  })

  it('lets the assigned volunteer see and accept the request', async () => {
    await resetDb()
    const token = await policeToken()
    const { id } = await seedRequest()
    const volunteer = await createApprovedVolunteer({ base_latitude: 12.972, base_longitude: 77.595 })

    await app.patch(`/api/police/requests/${id}/assign`).set('Authorization', `Bearer ${token}`).send({
      volunteer_id: volunteer.id,
    })

    const nearby = await app
      .get('/api/requests/nearby?lat=12.972&lng=77.595&radius_m=5000')
      .set('Authorization', `Bearer ${tokenFor(volunteer)}`)
    expect(nearby.status).toBe(200)
    expect(nearby.body.data.requests.map((r: { id: string }) => r.id)).toContain(id)

    const accept = await app
      .patch(`/api/requests/${id}/accept`)
      .set('Authorization', `Bearer ${tokenFor(volunteer)}`)
      .send({})
    expect(accept.status).toBe(200)
    expect(accept.body.data.status).toBe('ACCEPTED')
  })

  it('refuses a volunteer who already has an active assignment (BR-05)', async () => {
    await resetDb()
    const token = await policeToken()
    const { id } = await seedRequest()
    const busy = await createApprovedVolunteer()
    await seedRequest({ status: 'IN_PROGRESS', assignedVolunteerId: busy.id })

    const res = await app.patch(`/api/police/requests/${id}/assign`).set('Authorization', `Bearer ${token}`).send({
      volunteer_id: busy.id,
    })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ALREADY_ON_REQUEST')
  })

  it('refuses an off-duty volunteer, who could not accept it', async () => {
    await resetDb()
    const token = await policeToken()
    const { id } = await seedRequest()
    const offDuty = await createApprovedVolunteer({ is_available: false })

    const assign = await app
      .patch(`/api/${'police'}/requests/${id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ volunteer_id: offDuty.id })

    expect(assign.status).toBe(409)
    expect(assign.body.error.code).toBe('VOLUNTEER_UNAVAILABLE')
  })

  it('refuses a request that is already accepted (BR-04)', async () => {
    await resetDb()
    const token = await policeToken()
    const { id } = await seedRequest({ status: 'ACCEPTED', assignedVolunteerId: null })
    const volunteer = await createApprovedVolunteer()

    const res = await app.patch(`/api/police/requests/${id}/assign`).set('Authorization', `Bearer ${token}`).send({
      volunteer_id: volunteer.id,
    })

    expect(res.status).toBe(409)
  })

  it('allows a non-police caller nowhere near it', async () => {
    await resetDb()
    const { id } = await seedRequest()
    const volunteer = await createApprovedVolunteer()
    const senior = await createApprovedSenior()

    const asSenior = await app
      .patch(`/api/police/requests/${id}/assign`)
      .set('Authorization', `Bearer ${tokenFor(senior)}`)
      .send({ volunteer_id: volunteer.id })
    expect(asSenior.status).toBe(403)

    const anonymous = await app.patch(`/api/police/requests/${id}/assign`).send({ volunteer_id: volunteer.id })
    expect(anonymous.status).toBe(401)
  })

  it('writes an audit trail entry', async () => {
    await resetDb()
    const token = await policeToken()
    const { id } = await seedRequest()
    const volunteer = await createApprovedVolunteer()

    await app.patch(`/api/police/requests/${id}/assign`).set('Authorization', `Bearer ${token}`).send({
      volunteer_id: volunteer.id,
    })

    const audit = await pool.query('SELECT action, actor_id FROM audit_logs WHERE entity_id = $1', [id])
    expect(audit.rows.map((r: { action: string }) => r.action)).toContain('request.assigned_by_police')
  })
})


describe('GET /api/police/volunteers', () => {
  beforeAll(resetDb)

  it('lists volunteers with distance from the request location', async () => {
    await resetDb()
    const token = await policeToken()
    await createApprovedVolunteer({ base_latitude: 12.972, base_longitude: 77.595 })

    const res = await app
      .get(`${POLICE_VOLUNTEERS}?lat=12.9716&lng=77.5946`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.volunteers.length).toBe(1)
    expect(res.body.data.volunteers[0].is_verified).toBe(true)
    expect(res.body.data.volunteers[0].distance_m).toBeGreaterThan(0)
  })

  it('flags a volunteer who is already on an assignment', async () => {
    await resetDb()
    const token = await policeToken()
    const busy = await createApprovedVolunteer()
    await seedRequest({ status: 'ACCEPTED', assignedVolunteerId: busy.id })

    const res = await app.get(POLICE_VOLUNTEERS).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.volunteers[0].has_active_assignment).toBe(true)
    expect(res.body.data.volunteers[0].can_assign).toBe(false)
  })

  it('reports no distance when no position is given, and orders ready-first', async () => {
    await resetDb()
    const token = await policeToken()
    // Names chosen so alphabetical order is the opposite of readiness order.
    const onAJob = await createApprovedVolunteer({ full_name: 'Zara On A Job' })
    await seedRequest({ status: 'ACCEPTED', assignedVolunteerId: onAJob.id })
    await createApprovedVolunteer({ full_name: 'Yus Off Duty', is_available: false })
    await createApprovedVolunteer({ full_name: 'Vic Ready' })

    const res = await app.get(POLICE_VOLUNTEERS).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)

    const { volunteers } = res.body.data
    // No coordinates were sent, so claiming a distance would be false precision.
    expect(volunteers.every((v: { distance_m: number | null }) => v.distance_m === null)).toBe(true)
    // Ready volunteer first even though he sorts last by name.
    expect(volunteers[0].full_name).toBe('Vic Ready')
    expect(volunteers[0].can_assign).toBe(true)
    // Everyone is still listed so the UI can explain a refusal.
    expect(volunteers.length).toBe(3)
    expect(volunteers.filter((v: { can_assign: boolean }) => v.can_assign).length).toBe(1)
  })

  it('is police-only', async () => {
    await resetDb()
    const volunteer = await createApprovedVolunteer()
    const res = await app
      .get(POLICE_VOLUNTEERS)
      .set('Authorization', `Bearer ${tokenFor(volunteer)}`)
    expect(res.status).toBe(403)
  })
})
