// One-off cleanup for the smoke-test rows created while verifying the photo
// pipeline on 2026-09-29. Targets ONLY these email patterns:
//   smoketest-%@example.com, photo-senior-%@example.com, photo-other-%@example.com
// Usage:
//   node cleanup-smoke.mjs            # dry run — lists what would be deleted
//   node cleanup-smoke.mjs --delete   # actually deletes (cascades remove
//                                     # registrations, verifications, requests,
//                                     # photos, refresh tokens, OTPs)
// Delete this file afterwards.
import { config } from 'dotenv'
import pg from 'pg'

config()
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
const patterns = [
  'smoketest-%@example.com',
  'photo-senior-%@example.com',
  'photo-other-%@example.com',
]

const users = await pool.query(
  `SELECT id, email, role, created_at FROM users WHERE email LIKE ANY($1) ORDER BY created_at`,
  [patterns],
)
console.log('Matched users:')
for (const u of users.rows) {
  console.log(' ', u.email, '| role:', u.role, '| created:', u.created_at.toISOString())
}

const ids = users.rows.map((u) => u.id)
if (ids.length === 0) {
  console.log('Nothing to delete.')
  await pool.end()
  process.exit(0)
}

const rel = await pool.query(
  `SELECT
     (SELECT count(*) FROM help_requests WHERE senior_id = ANY($1)) AS requests,
     (SELECT count(*) FROM request_photos rp JOIN help_requests hr ON hr.id = rp.request_id WHERE hr.senior_id = ANY($1)) AS photos,
     (SELECT count(*) FROM user_verifications WHERE user_id = ANY($1)) AS verifications,
     (SELECT count(*) FROM refresh_tokens WHERE user_id = ANY($1)) AS refresh_tokens,
     (SELECT count(*) FROM otp_codes WHERE email LIKE ANY($2)) AS otp_codes`,
  [ids, patterns],
)
console.log('Related rows:', rel.rows[0])

if (process.argv[2] === '--delete') {
  const otp1 = await pool.query('DELETE FROM otp_codes WHERE email LIKE ANY($1)', [patterns])
  const otp2 = await pool.query('DELETE FROM otp_attempts WHERE email LIKE ANY($1)', [patterns])
  const del = await pool.query('DELETE FROM users WHERE id = ANY($1) RETURNING email', [ids])
  console.log(`Deleted ${del.rowCount} users:`, del.rows.map((r) => r.email).join(', '))
  console.log(`Deleted ${otp1.rowCount} otp_codes, ${otp2.rowCount} otp_attempts (dependent rows cascade with users)`)
} else {
  console.log('(dry run — pass --delete to remove)')
}
await pool.end()
