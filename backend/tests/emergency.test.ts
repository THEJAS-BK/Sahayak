import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '../src/database/pool.js'
import { resetDb } from './helpers/db.js'
import { createApprovedSenior, createApprovedVolunteer, createUser } from './fixtures.js'
import { signAccessToken } from '../src/modules/auth/tokens.service.js'
import { runCleanup, runDispatchSweep } from '../src/jobs/index.js'

const app = () => request(createApp())

function authHeader(user: { id: string; role: string | null; is_active: boolean }): string {
  return `Bearer ${signAccessToken({ id: user.id, role: user.role, isActive: user.is_active })}`
}

const EVENT_BODY = {
  trigger_type: 'acoustic_distress',
  source: 'flutter_app',
  detail: { confidence: 0.98 },
  latitude: 12.97,
  longitude: 77.59,
}

describe('emergency events & audit', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('E-01: senior logs an emergency: LOGGED + escalated_to_112 true', async () => {
    const senior = await createApprovedSenior()
    const res = await app()
      .post('/api/emergency-events')
      .set('Authorization', authHeader(senior))
      .send(EVENT_BODY)
    expect(res.status).toBe(201)
    expect(res.body.data.event).toMatchObject({ status: 'LOGGED', escalated_to_112: true })

    const row = await pool.query('SELECT * FROM emergency_events WHERE id = $1', [res.body.data.event.event_id])
    expect(row.rows[0].escalated_at).toBeTruthy()
    expect(row.rows[0].trigger_type).toBe('acoustic_distress')
  })

  it('E-01: help_request_id must belong to the caller → 400 otherwise', async () => {
    const senior = await createApprovedSenior()
    const other = await createApprovedSenior({ email: 'who@example.com' })
    const req = await app()
      .post('/api/requests')
      .set('Authorization', authHeader(other))
      .send({ category: 'medical_help', description: 'x', latitude: 12.97, longitude: 77.59, source: 'flutter_app' })
    const otherRequestId = req.body.data.request_id

    const res = await app()
      .post('/api/emergency-events')
      .set('Authorization', authHeader(senior))
      .send({ ...EVENT_BODY, help_request_id: otherRequestId })
    expect(res.status).toBe(400)
  })

  it('E-01: non-senior cannot log an emergency → 403', async () => {
    const volunteer = await createApprovedVolunteer()
    const res = await app()
      .post('/api/emergency-events')
      .set('Authorization', authHeader(volunteer))
      .send(EVENT_BODY)
    expect(res.status).toBe(403)
  })

  it('E-02 + E-03: police see the feed and can review LOGGED events', async () => {
    const senior = await createApprovedSenior({ full_name: 'SOS Senior', phone_number: '+919123456789' })
    const created = await app().post('/api/emergency-events').set('Authorization', authHeader(senior)).send(EVENT_BODY)
    const eventId = created.body.data.event.event_id

    const police = await createUser({ role: 'police', isActive: true })
    const list = await app().get('/api/police/emergency-events').set('Authorization', authHeader(police))
    expect(list.status).toBe(200)
    expect(list.body.data.events.length).toBe(1)
    expect(list.body.data.events[0]).toMatchObject({
      trigger_type: 'acoustic_distress',
      status: 'LOGGED',
      senior: expect.objectContaining({ full_name: 'SOS Senior', phone_number: '+919123456789' }),
    })

    const review = await app()
      .patch(`/api/police/emergency-events/${eventId}`)
      .set('Authorization', authHeader(police))
      .send({ status: 'REVIEWED' })
    expect(review.status).toBe(200)

    const again = await app()
      .patch(`/api/police/emergency-events/${eventId}`)
      .set('Authorization', authHeader(police))
      .send({ status: 'REVIEWED' })
    expect(again.status).toBe(409)

    const filtered = await app()
      .get('/api/police/emergency-events?status=LOGGED')
      .set('Authorization', authHeader(police))
    expect(filtered.body.data.events.length).toBe(0)
  })

  it('E-02: non-police cannot view the feed → 403', async () => {
    const senior = await createApprovedSenior()
    const res = await app().get('/api/police/emergency-events').set('Authorization', authHeader(senior))
    expect(res.status).toBe(403)
  })

  it('P-02: police can page through audit logs with filters', async () => {
    const senior = await createApprovedSenior()
    const created = await app().post('/api/emergency-events').set('Authorization', authHeader(senior)).send(EVENT_BODY)
    const eventId = created.body.data.event.event_id

    const police = await createUser({ role: 'police', isActive: true })
    const logs = await app()
      .get(`/api/audit-logs?entity_type=emergency_event&entity_id=${eventId}`)
      .set('Authorization', authHeader(police))
    expect(logs.status).toBe(200)
    expect(logs.body.data.logs.length).toBe(1)
    expect(logs.body.data.logs[0]).toMatchObject({ action: 'emergency.created', entity_id: eventId })

    const nonPolice = await app().get('/api/audit-logs').set('Authorization', authHeader(senior))
    expect(nonPolice.status).toBe(403)
  })

  it('BG-01: stale DISPATCHED request is redispatched with a fresh batch', async () => {
    const senior = await createApprovedSenior()
    const vol1 = await createApprovedVolunteer({ base_latitude: 12.9716, base_longitude: 77.5946 })
    const created = await app()
      .post('/api/requests')
      .set('Authorization', authHeader(senior))
      .send({ category: 'medical_help', description: 'x', latitude: 12.9716, longitude: 77.5946, source: 'flutter_app' })
    const requestId = created.body.data.request_id
    expect(created.body.data.dispatched_to).toContain(vol1.id)

    await pool.query("UPDATE help_requests SET dispatched_at = now() - interval '2 minutes' WHERE id = $1", [requestId])

    const outcome = await runDispatchSweep()
    expect(outcome.redispatched).toBe(1)
    const row = await pool.query('SELECT status, dispatch_attempt, dispatched_at FROM help_requests WHERE id = $1', [requestId])
    expect(row.rows[0].status).toBe('DISPATCHED')
    expect(row.rows[0].dispatch_attempt).toBe(1)
    expect(new Date(row.rows[0].dispatched_at).getTime()).toBeGreaterThan(Date.now() - 5000)
  })

  it('BG-01: DISPATCHED with exhausted attempts → UNASSIGNED + police alert', async () => {
    const senior = await createApprovedSenior()
    await createApprovedVolunteer({ base_latitude: 12.9716, base_longitude: 77.5946 })
    const created = await app()
      .post('/api/requests')
      .set('Authorization', authHeader(senior))
      .send({ category: 'medical_help', description: 'x', latitude: 12.9716, longitude: 77.5946, source: 'flutter_app' })
    const requestId = created.body.data.request_id

    await pool.query(
      "UPDATE help_requests SET dispatch_attempt = 3, dispatched_at = now() - interval '2 minutes' WHERE id = $1",
      [requestId],
    )

    const outcome = await runDispatchSweep()
    expect(outcome.unassigned).toBe(1)
    expect(outcome.policeAlerts).toContain(requestId)

    const row = await pool.query('SELECT status FROM help_requests WHERE id = $1', [requestId])
    expect(row.rows[0].status).toBe('UNASSIGNED')

    const audit = await pool.query("SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'request.unassigned'", [requestId])
    expect(audit.rowCount).toBe(1)
  })

  it('BG-01: a redispatch must not drop volunteers who were already offered the request', async () => {
    const senior = await createApprovedSenior()
    const vol1 = await createApprovedVolunteer({ base_latitude: 12.9716, base_longitude: 77.5946 })
    const created = await app()
      .post('/api/requests')
      .set('Authorization', authHeader(senior))
      .send({ category: 'medical_help', description: 'x', latitude: 12.9716, longitude: 77.5946, source: 'flutter_app' })
    const requestId = created.body.data.request_id
    expect(created.body.data.dispatched_to).toContain(vol1.id)

    // The sweep excludes the previous batch to find somebody *new*, but Q-04
    // gates on batch membership. Replacing the batch with the new candidates
    // therefore un-offers the request to the volunteer who was already told
    // about it. Assert after every sweep: with replace-semantics the batch
    // oscillates (populated -> empty -> populated), so only a per-sweep check
    // catches it.
    for (let i = 0; i < 3; i += 1) {
      await pool.query("UPDATE help_requests SET dispatched_at = now() - interval '2 minutes' WHERE id = $1", [requestId])
      await runDispatchSweep()

      const row = await pool.query('SELECT status, dispatch_batch FROM help_requests WHERE id = $1', [requestId])
      expect(row.rows[0].status).toBe('DISPATCHED')
      const ids = (row.rows[0].dispatch_batch as Array<{ id: string }>).map((e) => e.id)
      expect(ids, `volunteer was dropped from the batch on sweep ${i + 1}`).toContain(vol1.id)
    }

    // And the volunteer can still act on it.
    const nearby = await app()
      .get('/api/requests/nearby?lat=12.9716&lng=77.5946&radius_m=5000')
      .set('Authorization', authHeader(vol1))
    expect((nearby.body.data.requests as Array<{ id: string }>).map((r) => r.id)).toContain(requestId)
  })

  it('BG-01: UNASSIGNED is not terminal — a volunteer coming on duty picks the request back up', async () => {
    const senior = await createApprovedSenior()
    const created = await app()
      .post('/api/requests')
      .set('Authorization', authHeader(senior))
      .send({ category: 'medical_help', description: 'x', latitude: 12.9716, longitude: 77.5946, source: 'flutter_app' })
    const requestId = created.body.data.request_id

    // Nobody was in range, so dispatch exhausted itself and gave up.
    await pool.query(
      `UPDATE help_requests SET status = 'UNASSIGNED', dispatch_attempt = 3, dispatch_batch = '[]'::jsonb WHERE id = $1`,
      [requestId],
    )

    // A volunteer comes on duty nearby afterwards.
    const late = await createApprovedVolunteer({ base_latitude: 12.9716, base_longitude: 77.5946 })

    const outcome = await runDispatchSweep()
    expect(outcome.recovered).toBe(1)

    const row = await pool.query('SELECT status, dispatch_batch FROM help_requests WHERE id = $1', [requestId])
    expect(row.rows[0].status).toBe('DISPATCHED')
    expect((row.rows[0].dispatch_batch as Array<{ id: string }>).map((e) => e.id)).toContain(late.id)

    const nearby = await app()
      .get('/api/requests/nearby?lat=12.9716&lng=77.5946&radius_m=5000')
      .set('Authorization', authHeader(late))
    expect((nearby.body.data.requests as Array<{ id: string }>).map((r) => r.id)).toContain(requestId)
  })

  it('BG-01: an UNASSIGNED request recovers on the volunteers already in its batch', async () => {
    const senior = await createApprovedSenior()
    const vol = await createApprovedVolunteer({ base_latitude: 12.9716, base_longitude: 77.5946 })
    const created = await app()
      .post('/api/requests')
      .set('Authorization', authHeader(senior))
      .send({ category: 'medical_help', description: 'x', latitude: 12.9716, longitude: 77.5946, source: 'flutter_app' })
    const requestId = created.body.data.request_id
    expect(created.body.data.dispatched_to).toContain(vol.id)

    // Exhausted its attempts, but the batch still names an available volunteer.
    await pool.query(
      `UPDATE help_requests SET status = 'UNASSIGNED', dispatch_attempt = 3 WHERE id = $1`,
      [requestId],
    )
    expect((await pool.query('SELECT dispatch_batch FROM help_requests WHERE id = $1', [requestId]))
      .rows[0].dispatch_batch).toEqual([expect.objectContaining({ id: vol.id })])

    // Searching with the batch excluded — the obvious way to avoid duplicate
    // notifications — finds nobody here, because the only volunteer in range is
    // the one just excluded. The request would sit UNASSIGNED forever.
    const outcome = await runDispatchSweep()
    expect(outcome.recovered).toBe(1)

    const row = await pool.query('SELECT status FROM help_requests WHERE id = $1', [requestId])
    expect(row.rows[0].status).toBe('DISPATCHED')

    const nearby = await app()
      .get('/api/requests/nearby?lat=12.9716&lng=77.5946&radius_m=5000')
      .set('Authorization', authHeader(vol))
    expect((nearby.body.data.requests as Array<{ id: string }>).map((r) => r.id)).toContain(requestId)

    // It must stay in circulation. Recovery that keeps the exhausted attempt
    // count lets the next sweep flip it back to UNASSIGNED, and the request
    // ping-pongs in the dark, unreachable by any volunteer.
    await pool.query("UPDATE help_requests SET dispatched_at = now() - interval '2 minutes' WHERE id = $1", [requestId])
    await runDispatchSweep()
    const after = await pool.query('SELECT status, dispatch_attempt FROM help_requests WHERE id = $1', [requestId])
    expect(after.rows[0].status).toBe('DISPATCHED')
    expect(after.rows[0].dispatch_attempt).toBeLessThan(3)
  })

  it('BG-01: UNASSIGNED with nobody available stays put and does not re-alert police every sweep', async () => {
    const senior = await createApprovedSenior()
    const created = await app()
      .post('/api/requests')
      .set('Authorization', authHeader(senior))
      .send({ category: 'medical_help', description: 'x', latitude: 12.9716, longitude: 77.5946, source: 'flutter_app' })
    const requestId = created.body.data.request_id
    await pool.query(
      `UPDATE help_requests SET status = 'UNASSIGNED', dispatch_attempt = 3, dispatch_batch = '[]'::jsonb WHERE id = $1`,
      [requestId],
    )

    const outcome = await runDispatchSweep()
    expect(outcome.recovered).toBe(0)
    expect(outcome.policeAlerts).toEqual([])

    const row = await pool.query('SELECT status, dispatch_attempt FROM help_requests WHERE id = $1', [requestId])
    expect(row.rows[0].status).toBe('UNASSIGNED')
    expect(row.rows[0].dispatch_attempt).toBe(3)
  })

  it('BG-02: cleanup removes used/expired OTPs and dead refresh tokens', async () => {
    await pool.query(
      "INSERT INTO otp_codes (email, code_hash, expires_at, used) VALUES ('dead@example.com', 'x', now() - interval '1 hour', true)",
    )
    await pool.query(
      "INSERT INTO otp_codes (email, code_hash, expires_at, used) VALUES ('live@example.com', 'y', now() + interval '1 hour', false)",
    )
    const user = await createApprovedSenior()
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, consumed_at)
       VALUES ($1, gen_random_uuid(), 'deadhash', now() - interval '1 hour', now())`,
      [user.id],
    )

    const result = await runCleanup()
    expect(result.otpDeleted).toBe(1)
    expect(result.tokensDeleted).toBe(1)

    const live = await pool.query('SELECT 1 FROM otp_codes WHERE email = $1', ['live@example.com'])
    expect(live.rowCount).toBe(1)
  })
})