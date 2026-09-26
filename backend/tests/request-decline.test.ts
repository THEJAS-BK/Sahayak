import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '../src/database/pool.js'
import { resetDb } from './helpers/db.js'
import { createApprovedSenior, createApprovedVolunteer } from './fixtures.js'
import { signAccessToken } from '../src/modules/auth/tokens.service.js'

const app = () => request(createApp())

function authHeader(user: { id: string; role: string | null; is_active: boolean }): string {
  return `Bearer ${signAccessToken({ id: user.id, role: user.role, isActive: user.is_active })}`
}

const REQUEST_BODY = {
  category: 'grocery_assistance',
  description: 'Need groceries delivered',
  latitude: 12.9716,
  longitude: 77.5946,
  priority: 'normal',
  source: 'flutter_app',
}

/** A DISPATCHED request with `volunteers` in its dispatch batch. */
async function dispatchedRequest(senior: { id: string }, volunteers: Array<{ id: string }>) {
  const created = await app()
    .post('/api/requests')
    .set('Authorization', authHeader({ ...senior, role: 'senior', is_active: true }))
    .send(REQUEST_BODY)
  expect(created.status).toBe(201)
  const requestId = created.body.data.request_id as string

  // Force the batch rather than relying on the matcher picking these exact
  // volunteers, so the test is about declining and not about dispatch radius.
  await pool.query(
    `UPDATE help_requests
     SET status = 'DISPATCHED', dispatched_at = now(),
         dispatch_batch = $2::jsonb
     WHERE id = $1`,
    [requestId, JSON.stringify(volunteers.map((v, i) => ({ id: v.id, position: i, at: new Date().toISOString() })))],
  )
  return requestId
}

async function nearbyIds(volunteer: { id: string; role: string | null; is_active: boolean }) {
  const res = await app()
    .get('/api/requests/nearby?lat=12.9716&lng=77.5946&radius_m=5000')
    .set('Authorization', authHeader(volunteer))
  expect(res.status).toBe(200)
  return (res.body.data.requests as Array<{ id: string }>).map((r) => r.id)
}

describe('Q-05b: volunteer declines a request', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('records the decline and stops offering the request to that volunteer', async () => {
    const senior = await createApprovedSenior()
    const volunteer = await createApprovedVolunteer({ base_latitude: 12.9716, base_longitude: 77.5946 })
    const requestId = await dispatchedRequest(senior, [volunteer])

    expect(await nearbyIds(volunteer)).toContain(requestId)

    const res = await app()
      .patch(`/api/requests/${requestId}/decline`)
      .set('Authorization', authHeader(volunteer))
      .send({ reason: 'Too far from me' })

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ request_id: requestId, declined: true, already_declined: false })

    // The whole point: it must not come back on the next refresh.
    expect(await nearbyIds(volunteer)).not.toContain(requestId)
  })

  it('leaves the request live for the other volunteers it was dispatched to', async () => {
    const senior = await createApprovedSenior()
    const declining = await createApprovedVolunteer({ base_latitude: 12.9716, base_longitude: 77.5946 })
    const other = await createApprovedVolunteer({ base_latitude: 12.9717, base_longitude: 77.5947 })
    const requestId = await dispatchedRequest(senior, [declining, other])

    await app().patch(`/api/requests/${requestId}/decline`).set('Authorization', authHeader(declining)).send({})

    // A decline is not a request status: the senior is still waiting on it.
    const row = await pool.query('SELECT status, assigned_volunteer_id FROM help_requests WHERE id = $1', [requestId])
    expect(row.rows[0].status).toBe('DISPATCHED')
    expect(row.rows[0].assigned_volunteer_id).toBeNull()
    expect(await nearbyIds(other)).toContain(requestId)
  })

  it('is idempotent, so a double tap is not an error', async () => {
    const senior = await createApprovedSenior()
    const volunteer = await createApprovedVolunteer()
    const requestId = await dispatchedRequest(senior, [volunteer])

    const first = await app().patch(`/api/requests/${requestId}/decline`).set('Authorization', authHeader(volunteer)).send({})
    const second = await app().patch(`/api/requests/${requestId}/decline`).set('Authorization', authHeader(volunteer)).send({})

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body.data.already_declined).toBe(true)

    const rows = await pool.query('SELECT count(*)::int AS n FROM request_declines WHERE request_id = $1', [requestId])
    expect(rows.rows[0].n).toBe(1)
  })

  it('still lets police hand the request to that volunteer afterwards (P-05)', async () => {
    const senior = await createApprovedSenior()
    const volunteer = await createApprovedVolunteer()
    const requestId = await dispatchedRequest(senior, [volunteer])
    await app().patch(`/api/requests/${requestId}/decline`).set('Authorization', authHeader(volunteer)).send({})
    expect(await nearbyIds(volunteer)).not.toContain(requestId)

    // An officer deciding this person should do it after all outranks the decline.
    await pool.query('UPDATE help_requests SET assigned_volunteer_id = $1 WHERE id = $2', [volunteer.id, requestId])

    expect(await nearbyIds(volunteer)).toContain(requestId)
  })

  it('refuses to decline a request that was already accepted', async () => {
    const senior = await createApprovedSenior()
    const volunteer = await createApprovedVolunteer()
    const requestId = await dispatchedRequest(senior, [volunteer])
    await app().patch(`/api/requests/${requestId}/accept`).set('Authorization', authHeader(volunteer)).send({})

    const res = await app()
      .patch(`/api/requests/${requestId}/decline`)
      .set('Authorization', authHeader(volunteer))
      .send({})

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('NOT_DISPATCHED')
  })

  it('refuses a request that was never offered to that volunteer', async () => {
    const senior = await createApprovedSenior()
    const offered = await createApprovedVolunteer()
    const outsider = await createApprovedVolunteer()
    const requestId = await dispatchedRequest(senior, [offered])

    const res = await app()
      .patch(`/api/requests/${requestId}/decline`)
      .set('Authorization', authHeader(outsider))
      .send({})

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('is volunteer-only', async () => {
    const senior = await createApprovedSenior()
    const volunteer = await createApprovedVolunteer()
    const requestId = await dispatchedRequest(senior, [volunteer])

    const asSenior = await app()
      .patch(`/api/requests/${requestId}/decline`)
      .set('Authorization', authHeader({ ...senior, role: 'senior', is_active: true }))
      .send({})
    expect(asSenior.status).toBe(403)

    const anon = await app().patch(`/api/requests/${requestId}/decline`).send({})
    expect(anon.status).toBe(401)
  })

  it('writes an audit trail entry', async () => {
    const senior = await createApprovedSenior()
    const volunteer = await createApprovedVolunteer()
    const requestId = await dispatchedRequest(senior, [volunteer])

    await app().patch(`/api/requests/${requestId}/decline`).set('Authorization', authHeader(volunteer)).send({})

    const rows = await pool.query(
      `SELECT action, entity_id FROM audit_logs WHERE action = 'request.declined' AND entity_id = $1`,
      [requestId],
    )
    expect(rows.rowCount).toBe(1)
  })

  it('accept still works after a decline — the volunteer changed their mind', async () => {
    const senior = await createApprovedSenior()
    const volunteer = await createApprovedVolunteer({ is_available: true })
    const requestId = await dispatchedRequest(senior, [volunteer])

    await app().patch(`/api/requests/${requestId}/decline`).set('Authorization', authHeader(volunteer)).send({})
    // Police re-offers it, then the volunteer accepts.
    await pool.query('UPDATE help_requests SET assigned_volunteer_id = $1 WHERE id = $2', [volunteer.id, requestId])

    const res = await app().patch(`/api/requests/${requestId}/accept`).set('Authorization', authHeader(volunteer)).send({})
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('ACCEPTED')
  })
})
