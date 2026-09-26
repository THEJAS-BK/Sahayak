import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { pool } from '../src/database/pool.js'
import { resetDb } from './helpers/db.js'
import { createApprovedSenior } from './fixtures.js'
import { signAccessToken } from '../src/modules/auth/tokens.service.js'

const BODY = {
  category: 'grocery_assistance',
  description: 'Need rice and oil',
  details: { items: ['rice', 'oil'] },
  latitude: 12.9716,
  longitude: 77.5946,
  priority: 'urgent',
  source: 'voice_agent',
}

describe('POST /api/requests with REQUESTS_DRY_RUN', () => {
  const original = process.env.REQUESTS_DRY_RUN
  let app: ReturnType<typeof request>

  beforeAll(async () => {
    // config is read at import time, so the flag has to be set before the app is loaded.
    process.env.REQUESTS_DRY_RUN = 'true'
    vi.resetModules()
    const { createApp } = await import('../src/app.js')
    app = request(createApp())
  })

  afterAll(() => {
    if (original === undefined) delete process.env.REQUESTS_DRY_RUN
    else process.env.REQUESTS_DRY_RUN = original
  })

  it('acknowledges the body without persisting it', async () => {
    await resetDb()
    const senior = await createApprovedSenior()

    const res = await app
      .post('/api/requests')
      .set(
        'Authorization',
        `Bearer ${signAccessToken({ id: senior.id, role: senior.role, isActive: senior.is_active })}`,
      )
      .send(BODY)

    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ dry_run: true, request_id: null, dispatched_to: [] })

    const rows = await pool.query('SELECT id FROM help_requests')
    expect(rows.rowCount).toBe(0)
  })

  it('still validates the body', async () => {
    const senior = await createApprovedSenior()

    const res = await app
      .post('/api/requests')
      .set(
        'Authorization',
        `Bearer ${signAccessToken({ id: senior.id, role: senior.role, isActive: senior.is_active })}`,
      )
      .send({ ...BODY, description: '' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_INPUT')
  })
})
