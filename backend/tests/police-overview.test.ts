import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/database/pool.js'
import { resetDb } from './helpers/db.js'
import { createApprovedSenior, createApprovedVolunteer, createUser } from './fixtures.js'
import { signAccessToken } from '../src/modules/auth/tokens.service.js'
import { createApp } from '../src/app.js'

const app = () => request(createApp())

function authHeader(user: { id: string; role: 'senior' | 'volunteer' | 'police' | null; is_active: boolean }): string {
  return `Bearer ${signAccessToken({ id: user.id, role: user.role, isActive: user.is_active })}`
}

async function policeToken(): Promise<string> {
  return authHeader(await createUser({ role: 'police' }))
}

interface RequestSeed {
  status: string
  priority?: string
  assignedVolunteerId?: string
  completedAt?: string
}

async function seedRequest(seniorId: string, seed: RequestSeed): Promise<string> {
  const res = await pool.query(
    `INSERT INTO help_requests
      (senior_id, category, description, latitude, longitude, source, status, priority,
       assigned_volunteer_id, completed_at)
     VALUES ($1, 'grocery_assistance', 'need milk', 12.9716, 77.5946, 'flutter_app', $2, $3, $4, $5)
     RETURNING id`,
    [
      seniorId,
      seed.status,
      seed.priority ?? 'normal',
      seed.assignedVolunteerId ?? null,
      seed.completedAt ?? null,
    ],
  )
  return res.rows[0].id as string
}

async function seedEmergency(seniorId: string, status = 'LOGGED'): Promise<string> {
  const res = await pool.query(
    `INSERT INTO emergency_events
      (senior_id, trigger_type, source, escalated_to_112, escalated_at, status)
     VALUES ($1, 'semantic_llm', 'voice_agent', true, now(), $2)
     RETURNING id`,
    [seniorId, status],
  )
  return res.rows[0].id as string
}

describe('GET /api/police/overview', () => {
  beforeEach(resetDb)

  it('is police-only', async () => {
    const senior = await createApprovedSenior()
    const anon = await app().get('/api/police/overview')
    expect(anon.status).toBe(401)

    const asSenior = await app()
      .get('/api/police/overview')
      .set('Authorization', authHeader(senior))
    expect(asSenior.status).toBe(403)
  })

  it('rejects an unparseable window instead of silently using the server day', async () => {
    const res = await app()
      .get('/api/police/overview?from=not-a-date')
      .set('Authorization', await policeToken())
    expect(res.status).toBe(400)
  })

  it('counts open, active, unassigned and urgent requests by status', async () => {
    const senior = await createApprovedSenior()
    const volunteer = await createApprovedVolunteer()

    await seedRequest(senior.id, { status: 'PENDING' })
    await seedRequest(senior.id, { status: 'MATCHING', priority: 'urgent' })
    await seedRequest(senior.id, {
      status: 'ACCEPTED',
      assignedVolunteerId: volunteer.id,
    })
    await seedRequest(senior.id, { status: 'COMPLETED' })
    // A cancelled request is neither open nor urgent-for-attention.
    await seedRequest(senior.id, { status: 'CANCELLED', priority: 'urgent' })

    const res = await app().get('/api/police/overview').set('Authorization', await policeToken())

    expect(res.status).toBe(200)
    const data = res.body.data
    expect(data.open_requests).toBe(3)
    expect(data.active_operations).toBe(1)
    // PENDING and MATCHING with nobody attached. ACCEPTED has a volunteer.
    expect(data.unassigned_requests).toBe(2)
    // The urgent MATCHING one only. CANCELLED is excluded on purpose.
    expect(data.urgent_requests).toBe(1)
  })

  it('counts completed_today inside the window the caller supplies', async () => {
    const senior = await createApprovedSenior()
    // 2026-03-05T09:00:00Z and 2026-03-06T09:00:00Z. Using fixed instants keeps
    // the test independent of the machine's clock and timezone.
    await seedRequest(senior.id, { status: 'COMPLETED', completedAt: '2026-03-05T09:00:00Z' })
    await seedRequest(senior.id, { status: 'COMPLETED', completedAt: '2026-03-06T09:00:00Z' })
    await seedRequest(senior.id, { status: 'COMPLETED', completedAt: '2026-03-07T09:00:00Z' })

    const token = await policeToken()
    const onFifth = await app()
      .get('/api/police/overview?from=2026-03-05T00:00:00Z&to=2026-03-06T00:00:00Z')
      .set('Authorization', token)
    expect(onFifth.body.data.completed_today).toBe(1)

    const onBoth = await app()
      .get('/api/police/overview?from=2026-03-05T00:00:00Z&to=2026-03-07T00:00:00Z')
      .set('Authorization', token)
    expect(onBoth.body.data.completed_today).toBe(2)
  })

  it('counts only LOGGED emergencies as awaiting review', async () => {
    const senior = await createApprovedSenior()
    await seedEmergency(senior.id, 'LOGGED')
    await seedEmergency(senior.id, 'LOGGED')
    await seedEmergency(senior.id, 'REVIEWED')

    const res = await app().get('/api/police/overview').set('Authorization', await policeToken())
    expect(res.body.data.emergencies_awaiting_review).toBe(2)
  })

  it('counts pending verifications', async () => {
    const pending = await createUser()
    await pool.query(
      `INSERT INTO user_verifications (user_id, role, form_data, status) VALUES ($1, 'senior', '{}', 'PENDING')`,
      [pending.id],
    )
    await createApprovedSenior()

    const res = await app().get('/api/police/overview').set('Authorization', await policeToken())
    expect(res.body.data.verifications_pending).toBe(1)
  })

  it('counts a volunteer as available only when approved, on duty and unassigned', async () => {
    const ready = await createApprovedVolunteer({ is_available: true })
    const offDuty = await createApprovedVolunteer({ is_available: false })
    const busy = await createApprovedVolunteer({ is_available: true })
    const offered = await createApprovedVolunteer({ is_available: true })
    const unapproved = await createUser({ role: 'volunteer' })
    await pool.query(
      `INSERT INTO volunteer_profiles (user_id, full_name, is_available) VALUES ($1, 'Unapproved', true)`,
      [unapproved.id],
    )

    const senior = await createApprovedSenior()
    // ACCEPTED is in flight, so `busy` cannot take another job. DISPATCHED is
    // only an offer the volunteer has not answered, so `offered` is still free
    // and must stay on the tile — the same rule the assign dialog applies.
    await seedRequest(senior.id, { status: 'ACCEPTED', assignedVolunteerId: busy.id })
    await seedRequest(senior.id, { status: 'DISPATCHED', assignedVolunteerId: offered.id })

    const res = await app().get('/api/police/overview').set('Authorization', await policeToken())
    // ready + offered. Not offDuty, not busy, not unapproved.
    expect(res.body.data.volunteers_available).toBe(2)
    expect(ready.id).not.toBe(busy.id)
  })

  it('stamps generated_at so the console can show a real "updated" time', async () => {
    const before = Date.now()
    const res = await app().get('/api/police/overview').set('Authorization', await policeToken())
    const generated = new Date(res.body.data.generated_at).getTime()

    expect(Number.isNaN(generated)).toBe(false)
    expect(generated).toBeGreaterThanOrEqual(before - 1000)
  })
})
