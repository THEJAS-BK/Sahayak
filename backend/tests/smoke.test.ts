import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { resetDb } from './helpers/db.js'

describe('bootstrap', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('GET /health → 200 ok', async () => {
    const res = await request(createApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('unknown route → 404 envelope', async () => {
    const res = await request(createApp()).get('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    })
  })
})