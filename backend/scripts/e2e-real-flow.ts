import 'dotenv/config'

/**
 * Live smoke test for the whole Sahayak flow, driven through the real HTTP API.
 *
 * Prerequisites:
 *   - the API running on http://localhost:3000 (`npm run dev`)
 *   - a bootstrapped police account (`npm run db:seed`)
 *   - NODE_ENV other than production, so the dev OTP code applies
 *
 * It creates its own senior and volunteer, has the police account approve them,
 * and walks a request through dispatch, accept and completion. It deliberately
 * assumes an empty database, so run `npm run db:seed:fresh` first.
 *
 *   npx tsx scripts/e2e-real-flow.ts
 */
const BASE = 'http://localhost:3000/api'
const POLICE_EMAIL = process.env.POLICE_BOOTSTRAP_EMAIL || 'police@example.com'
const CODE = '123456'

let pass = 0
let fail = 0
function check(label: string, ok: boolean, extra = '') {
  if (ok) {
    pass++
    console.log(`  PASS  ${label}${extra ? ` — ${extra}` : ''}`)
  } else {
    fail++
    console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ''}`)
  }
}

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json: any = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { raw: text.slice(0, 200) }
  }
  return { status: res.status, json }
}

async function login(email: string) {
  const req = await call('POST', '/auth/otp/request', { email })
  if (req.status !== 200) throw new Error(`otp request ${req.status} ${JSON.stringify(req.json)}`)
  const v = await call('POST', '/auth/otp/verify', { email, code: CODE })
  if (v.status !== 200) throw new Error(`otp verify ${v.status} ${JSON.stringify(v.json)}`)
  return v.json.data as {
    access_token: string
    refresh_token: string
    user: { id: string; role: string | null; is_active: boolean }
  }
}

async function refresh(refresh_token: string) {
  const r = await call('POST', '/auth/refresh', { refresh_token })
  if (r.status !== 200) throw new Error(`refresh ${r.status} ${JSON.stringify(r.json)}`)
  return r.json.data as { access_token: string; user: { id: string; role: string | null } }
}

const SENIOR = {
  full_name: 'Lakshmi Shetty',
  phone_number: '+91 98450 11223',
  home_latitude: 12.9716,
  home_longitude: 77.5946,
  preferred_language: 'kannada',
  aadhaar_number: '123456789012',
  emergency_contact: { name: 'Ramesh Shetty', phone: '+91 98450 44556', relation: 'son' },
}
const VOLUNTEER = {
  full_name: 'Arjun Nair',
  phone_number: '+91 90000 77889',
  organization: 'Sahayak Neighbourhood Team',
  skills: ['medicine', 'errands'],
  base_latitude: 12.9726,
  base_longitude: 77.5956,
  aadhaar_number: '210987654321',
  id_proof_ref: 'local-id-card-001',
}

async function main() {
  console.log('\n== 1. police bootstrap login ==')
  const police = await login(POLICE_EMAIL)
  check('police role is police', police.user.role === 'police', police.user.role ?? 'null')
  check('police is active', police.user.is_active === true)

  console.log('\n== 2. senior and volunteer register through the real flow ==')
  const senior = await login('lakshmi.shetty@example.com')
  check('new account has no role', senior.user.role === null, String(senior.user.role))
  const seniorReg = await call('POST', '/registrations/senior', SENIOR, senior.access_token)
  check('senior registration accepted', seniorReg.status === 201, `status ${seniorReg.status}`)

  const volunteer = await login('arjun.nair@example.com')
  const volReg = await call('POST', '/registrations/volunteer', VOLUNTEER, volunteer.access_token)
  check('volunteer registration accepted', volReg.status === 201, `status ${volReg.status}`)

  console.log('\n== 3. pending accounts are locked out ==')
  const blocked = await call('POST', '/requests', {
    category: 'groceries',
    description: 'should be rejected while pending',
    latitude: 12.9716,
    longitude: 77.5946,
    source: 'flutter_app',
  }, senior.access_token)
  check('pending senior cannot create a request', blocked.status === 403, `status ${blocked.status}`)

  console.log('\n== 4. police reviews the queue ==')
  const queue = await call('GET', '/verifications?status=PENDING', undefined, police.access_token)
  const pending = queue.json.data?.verifications ?? []
  check('queue lists both accounts', queue.status === 200 && pending.length === 2, `${pending.length} pending`)
  for (const v of pending) {
    const r = await call('PATCH', `/verifications/${v.id}`, { status: 'APPROVED' }, police.access_token)
    check(`approved ${v.role} ${v.email}`, r.status === 200, `status ${r.status}`)
  }

  console.log('\n== 5. session refresh carries the new role ==')
  const seniorS = await refresh(senior.refresh_token)
  check('senior token now says senior', seniorS.user.role === 'senior', String(seniorS.user.role))
  const volS = await refresh(volunteer.refresh_token)
  check('volunteer token now says volunteer', volS.user.role === 'volunteer', String(volS.user.role))

  console.log('\n== 6. volunteer goes on duty ==')
  const avail = await call('PATCH', '/volunteers/me/availability', { is_available: true }, volS.access_token)
  check('volunteer available', avail.status === 200, `status ${avail.status}`)
  const early = await call('PATCH', '/volunteers/me/location', { latitude: 12.9726, longitude: 77.5956 }, volS.access_token)
  check('BR-09 blocks location update with no assignment', early.status === 403, `status ${early.status}`)

  console.log('\n== 7. senior raises a request ==')
  const created = await call('POST', '/requests', {
    category: 'groceries',
    description: 'Two kilos of rice and one bottle of cooking oil',
    latitude: 12.9716,
    longitude: 77.5946,
    priority: 'normal',
    source: 'voice_agent',
  }, seniorS.access_token)
  check('request created', created.status === 201, `status ${created.status}`)
  const requestId = created.json.data?.request_id
  check('request has an id', Boolean(requestId), String(requestId))
  if (!requestId) {
    // Registration returns 409 when the database already holds these accounts,
    // so a dirty database used to cascade into 500s and bogus PASS lines below.
    console.error('\nE2E aborted: no request id. The database is not empty — run `npm run db:seed:fresh` first.')
    process.exit(1)
  }
  check('dispatched to the on-duty volunteer', (created.json.data?.dispatched_to ?? []).length === 1,
    `dispatched_to=${JSON.stringify(created.json.data?.dispatched_to)}`)

  console.log('\n== 8. request reaches the volunteer ==')
  const nearby = await call('GET', '/requests/nearby?lat=12.9726&lng=77.5956&radius_m=5000', undefined, volS.access_token)
  const ids = (nearby.json.data?.requests ?? []).map((r: any) => r.id ?? r.request_id)
  check('nearby list includes the request', nearby.status === 200 && ids.includes(requestId), `${ids.length} nearby`)

  console.log('\n== 8b. volunteer declines, then the offer comes back ==')
  const decline = await call('PATCH', `/requests/${requestId}/decline`, { reason: 'Not on my route' }, volS.access_token)
  check('decline succeeds', decline.status === 200 && decline.json.data?.declined === true,
    `status ${decline.status} ${JSON.stringify(decline.json).slice(0, 140)}`)
  const afterDecline = await call('GET', '/requests/nearby?lat=12.9726&lng=77.5956&radius_m=5000', undefined, volS.access_token)
  const afterIds = (afterDecline.json.data?.requests ?? []).map((r: any) => r.id ?? r.request_id)
  check('declined request is no longer offered to that volunteer', !afterIds.includes(requestId),
    `nearby=${JSON.stringify(afterIds)}`)
  // The senior is still waiting: a decline is not a request-level failure.
  const stillLive = await call('GET', `/requests/${requestId}`, undefined, seniorS.access_token)
  check('request stays live for other volunteers', stillLive.json.data?.request?.status === 'DISPATCHED',
    `status=${stillLive.json.data?.request?.status}`)
  // Step 9 then accepts it, standing in for a re-offer: accept still works, so
  // a volunteer who changes their mind is not locked out by their own decline.

  console.log('\n== 9. volunteer accepts ==')
  const accept = await call('PATCH', `/requests/${requestId}/accept`, {}, volS.access_token)
  check('accept succeeds', accept.status === 200, `status ${accept.status} ${JSON.stringify(accept.json).slice(0, 140)}`)

  console.log('\n== 10. location update is now permitted ==')
  const loc = await call('PATCH', '/volunteers/me/location', { latitude: 12.9731, longitude: 77.5961 }, volS.access_token)
  check('BR-09 allows location update during assignment', loc.status === 200, `status ${loc.status}`)

  console.log('\n== 11. volunteer completes the job ==')
  const started = await call('PATCH', `/requests/${requestId}/status`, { status: 'IN_PROGRESS' }, volS.access_token)
  check('status IN_PROGRESS', started.status === 200 && started.json.data?.status === 'IN_PROGRESS', started.json.data?.status)
  const done = await call('PATCH', `/requests/${requestId}/status`, { status: 'COMPLETED' }, volS.access_token)
  check('status COMPLETED', done.status === 200 && done.json.data?.status === 'COMPLETED', done.json.data?.status)

  console.log('\n== 12. police sees the finished request ==')
  const board = await call('GET', '/police/requests', undefined, police.access_token)
  const boardIds = (board.json.data?.requests ?? []).map((r: any) => r.id ?? r.request_id)
  check('police board includes the request', board.status === 200 && boardIds.includes(requestId), `${boardIds.length} listed`)

  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error('E2E aborted:', e.message)
  process.exitCode = 1
})
