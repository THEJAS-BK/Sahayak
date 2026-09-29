import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '../src/database/pool.js'
import cloudinary, { isCloudinaryConfigured } from '../src/config/cloudinary.js'
import { resetDb } from './helpers/db.js'
import { createApprovedSenior, createApprovedVolunteer } from './fixtures.js'
import { signAccessToken, type AccountRole } from '../src/modules/auth/tokens.service.js'

/**
 * Q-09 — the request photo, now uploaded as multipart straight to Cloudinary.
 *
 * Skipped when the credentials are absent, because a deployment may legitimately
 * run without a photo backend (the route then answers 503). When they are
 * present these run against the real service rather than a stub: the whole
 * point of the change is that the bytes never touch Postgres, and a mocked
 * uploader would not notice if they started doing so again.
 *
 * Every asset uploaded here is destroyed in `afterAll`, so a run leaves nothing
 * behind in the Cloudinary account.
 */
const uploaded = new Set<string>()

const app = () => request(createApp())

function authHeader(user: { id: string; role: AccountRole; is_active: boolean }): string {
  return `Bearer ${signAccessToken({ id: user.id, role: user.role, isActive: user.is_active })}`
}

/** A 1x1 PNG — the smallest thing Cloudinary will accept. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function photoAttachment(filename = 'photo.png', contentType = 'image/png', body = PNG_1PX) {
  return { name: 'photo', buffer: body, options: { filename, contentType } }
}

async function createRequestFor(senior: { id: string; role: AccountRole; is_active: boolean }) {
  const res = await app()
    .post('/api/requests')
    .set('Authorization', authHeader(senior))
    .send({
      category: 'medical_help',
      description: 'Need medication delivered',
      latitude: 12.9716,
      longitude: 77.5946,
      priority: 'normal',
      source: 'flutter_app',
    })
  expect(res.status).toBe(201)
  return res.body.data.request_id as string
}

/** Pull the Cloudinary public id back out of a delivery URL. */
function publicIdOf(imageUrl: string): string {
  return imageUrl.split('/upload/')[1].replace(/^v\d+\//, '').replace(/\.\w+$/, '')
}

describe.skipIf(!isCloudinaryConfigured)('request photo upload (Q-09)', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await Promise.all([...uploaded].map((id) => cloudinary.uploader.destroy(id).catch(() => undefined)))
    uploaded.clear()
  })

  it('stores the Cloudinary URL on the request and serves the image from it', async () => {
    const senior = await createApprovedSenior()
    const requestId = await createRequestFor(senior)

    const res = await app()
      .post(`/api/requests/${requestId}/photo`)
      .set('Authorization', authHeader(senior))
      .attach(...photoAttachment())

    expect(res.status).toBe(201)
    const imageUrl = res.body.data.photo.image_url as string
    expect(imageUrl).toMatch(/^https:\/\/res\.cloudinary\.com\//)
    uploaded.add(publicIdOf(imageUrl))

    const row = await pool.query('SELECT image_url, image_public_id FROM help_requests WHERE id = $1', [
      requestId,
    ])
    expect(row.rows[0].image_url).toBe(imageUrl)
    // The public id is what makes a later replace able to delete this asset, so
    // it has to be stored folder-qualified — that is the form destroy() wants.
    expect(row.rows[0].image_public_id).toBe(publicIdOf(imageUrl))

    // The URL is the image: a client needs no second call to render it.
    const fetched = await fetch(imageUrl)
    expect(fetched.ok).toBe(true)
  })

  it('replaces the photo and deletes the asset it superseded', async () => {
    const senior = await createApprovedSenior()
    const requestId = await createRequestFor(senior)

    const first = await app()
      .post(`/api/requests/${requestId}/photo`)
      .set('Authorization', authHeader(senior))
      .attach(...photoAttachment('first.png'))
    const firstUrl = first.body.data.photo.image_url as string
    uploaded.add(publicIdOf(firstUrl))

    const second = await app()
      .post(`/api/requests/${requestId}/photo`)
      .set('Authorization', authHeader(senior))
      .attach(...photoAttachment('second.png'))
    expect(second.status).toBe(201)

    const secondUrl = second.body.data.photo.image_url as string
    expect(secondUrl).not.toBe(firstUrl)
    uploaded.add(publicIdOf(secondUrl))

    const row = await pool.query('SELECT image_url FROM help_requests WHERE id = $1', [requestId])
    expect(row.rows[0].image_url).toBe(secondUrl)

    // The superseded asset is destroyed after the commit, so it is gone.
    const gone = await cloudinary.uploader.destroy(publicIdOf(firstUrl))
    expect(gone.result).toBe('not found')
  })

  it('exposes image_url and has_photo on the read endpoints', async () => {
    const senior = await createApprovedSenior()
    const requestId = await createRequestFor(senior)
    const up = await app()
      .post(`/api/requests/${requestId}/photo`)
      .set('Authorization', authHeader(senior))
      .attach(...photoAttachment())
    const imageUrl = up.body.data.photo.image_url as string
    uploaded.add(publicIdOf(imageUrl))

    const detail = await app().get(`/api/requests/${requestId}`).set('Authorization', authHeader(senior))
    expect(detail.body.data.request.image_url).toBe(imageUrl)
    expect(detail.body.data.request.has_photo).toBe(true)

    // Q-02 runs its rows through shapeRow, which camelCases every column. The
    // photo is renamed back so one name serves all three endpoints, so this
    // asserts the endpoint agrees rather than arriving as `imageUrl`.
    const mine = await app().get('/api/requests/me').set('Authorization', authHeader(senior))
    expect(mine.body.data.requests[0].image_url).toBe(imageUrl)
    expect(mine.body.data.requests[0].imageUrl).toBeUndefined()
  })

  it('shows the photo in the nearby feed a volunteer was offered', async () => {
    // The volunteer has to exist before the request, or dispatch has nobody to
    // offer it to and Q-04 has no batch row to match on.
    const senior = await createApprovedSenior()
    const volunteer = await createApprovedVolunteer({
      base_latitude: 12.972,
      base_longitude: 77.595,
    })
    const requestId = await createRequestFor(senior)

    const up = await app()
      .post(`/api/requests/${requestId}/photo`)
      .set('Authorization', authHeader(senior))
      .attach(...photoAttachment())
    const imageUrl = up.body.data.photo.image_url as string
    uploaded.add(publicIdOf(imageUrl))

    const nearby = await app()
      .get('/api/requests/nearby?lat=12.9716&lng=77.5946&radius_m=5000')
      .set('Authorization', authHeader(volunteer))

    const row = nearby.body.data.requests.find((r: { id: string }) => r.id === requestId)
    expect(row).toBeDefined()
    expect(row.image_url).toBe(imageUrl)
    expect(row.has_photo).toBe(true)
  })

  it('rejects a request with no file and a file that is not an image', async () => {
    const senior = await createApprovedSenior()
    const requestId = await createRequestFor(senior)

    const empty = await app()
      .post(`/api/requests/${requestId}/photo`)
      .set('Authorization', authHeader(senior))
    expect(empty.status).toBe(400)
    expect(empty.body.error.code).toBe('NO_IMAGE')

    const notAnImage = await app()
      .post(`/api/requests/${requestId}/photo`)
      .set('Authorization', authHeader(senior))
      .attach(...photoAttachment('notes.txt', 'text/plain', Buffer.from('hello')))
    expect(notAnImage.status).toBe(400)
    expect(notAnImage.body.error.code).toBe('UNSUPPORTED_IMAGE_TYPE')
  })

  it('answers 404 for someone else\'s request without uploading anything', async () => {
    const owner = await createApprovedSenior()
    const requestId = await createRequestFor(owner)
    const stranger = await createApprovedSenior()

    const res = await app()
      .post(`/api/requests/${requestId}/photo`)
      .set('Authorization', authHeader(stranger))
      .attach(...photoAttachment())

    // 404 rather than 403 so the endpoint cannot be used to probe which request
    // ids exist, and — because the check runs before multer — nothing reached
    // Cloudinary.
    expect(res.status).toBe(404)
  })

  it('refuses an unauthenticated upload', async () => {
    const senior = await createApprovedSenior()
    const requestId = await createRequestFor(senior)

    const res = await app().post(`/api/requests/${requestId}/photo`).attach(...photoAttachment())
    expect(res.status).toBe(401)
  })

  it('refuses a photo on a cancelled request', async () => {
    const senior = await createApprovedSenior()
    const requestId = await createRequestFor(senior)
    await app().patch(`/api/requests/${requestId}/cancel`).set('Authorization', authHeader(senior))

    const res = await app()
      .post(`/api/requests/${requestId}/photo`)
      .set('Authorization', authHeader(senior))
      .attach(...photoAttachment())

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATE')
  })
})
