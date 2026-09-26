import 'dotenv/config'

/**
 * Live check for police-side manual dispatch (P-02 / P-03) through the real
 * HTTP API, including the volunteer app picking the request up and accepting.
 */
const BASE = 'http://localhost:3000/api'
const POLICE_EMAIL = process.env.POLICE_BOOTSTRAP_EMAIL || 'police@example.com'
const POLICE_LIST = `/${'police'}/${'volunteers'}`
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, extra = '') => {
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
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
  const sent = await call('POST', '/auth/otp/request', { email })
  if (sent.json?.error?.code === 'RATE_LIMITED') {
    // 10 OTP requests per hour per IP, held in server memory: each run needs
    // four logins, so a second run in the same hour needs a server restart.
    throw new Error('OTP rate limit hit. Restart the dev server, then re-run.')
  }
  const v = await call('POST', '/auth/otp/verify', { email, code: '123456' })
  if (!v.json.data) {
    throw new Error(`login failed for ${email}: ${v.status} ${v.json?.error?.code ?? ''}`)
  }
  return v.json.data as { access_token: string; refresh_token: string; user: any }
}

async function main() {
  const stamp = Date.now()
  const police = await login(POLICE_EMAIL)
  check('police logs in', police.user.role === 'police')

  const senior = await login(`assign.senior.${stamp}@example.com`)
  const regS = await call('POST', '/registrations/senior', {
    full_name: 'Assign Test Senior',
    phone_number: '+91 90000 11111',
    home_latitude: 12.9716,
    home_longitude: 77.5946,
    preferred_language: 'english',
    aadhaar_number: '111222333444',
  }, senior.access_token)
  check('senior registers', regS.status === 201, `${regS.status}`)

  const vol = await login(`assign.vol.${stamp}@example.com`)
  const regV = await call('POST', '/registrations/volunteer', {
    full_name: 'Assign Test Volunteer',
    phone_number: '+91 90000 22222',
    organization: 'Dispatch Desk Co',
    skills: ['errands'],
    // ~15 km away: outside MATCH_RADIUS_M (5 km, doubled to 10 km for urgent),
    // so the automatic matcher can never offer this volunteer.
    base_latitude: 13.1050,
    base_longitude: 77.6200,
    aadhaar_number: '555666777888',
  }, vol.access_token)
  check('volunteer registers', regV.status === 201, `${regV.status}`)

  const queue = await call('GET', '/verifications?status=PENDING', undefined, police.access_token)
  for (const v of queue.json.data.verifications) {
    await call('PATCH', `/verifications/${v.id}`, { status: 'APPROVED' }, police.access_token)
  }
  check('both approved', true)

  const volS = await call('POST', '/auth/refresh', { refresh_token: vol.refresh_token })
  const volToken = volS.json.data.access_token
  const seniorS = await call('POST', '/auth/refresh', { refresh_token: senior.refresh_token })
  const seniorToken = seniorS.json.data.access_token
  check('volunteer refreshed to role volunteer', volS.json.data.user.role === 'volunteer')

  await call('PATCH', '/volunteers/me/availability', { is_available: true }, volToken)

  const created = await call('POST', '/requests', {
    category: 'grocery_assistance',
    description: 'Two kilos of rice',
    latitude: 12.9716,
    longitude: 77.5946,
    priority: 'urgent',
    source: 'voice_agent',
  }, seniorToken)
  const requestId = created.json.data?.request_id
  check('request created', created.status === 201, `dispatched_to=${JSON.stringify(created.json.data?.dispatched_to)}`)
  check('automatic dispatch found nobody (volunteer out of range)', (created.json.data?.dispatched_to ?? []).length === 0,
    `dispatched_to=${JSON.stringify(created.json.data?.dispatched_to)}`)

  // No lat/lng: the UI sends none while volunteer positions are untrustworthy.
  const list = await call('GET', POLICE_LIST, undefined, police.access_token)
  check('police volunteer directory responds', list.status === 200, `${list.status}`)
  const entry = (list.json.data?.volunteers ?? [])[0]
  check('out-of-range volunteer is listed for police', Boolean(entry), `volunteers=${list.json.data.volunteers.length}`)
  check('listed as assignable', entry?.can_assign === true)
  // No lat/lng is sent from the UI yet, so the API must not invent a distance.
  check('no distance claimed without a trusted position', entry?.distance_m === null, `distance_m=${entry?.distance_m}`)
  check('volunteer reported as not on a job', entry?.has_active_assignment === false)

  const assign = await call('PATCH', `/police/requests/${requestId}/assign`, { volunteer_id: entry.id }, police.access_token)
  check('police assigns the volunteer', assign.status === 200, `${assign.status} ${JSON.stringify(assign.json).slice(0, 160)}`)
  check('assignment returns DISPATCHED', assign.json.data?.status === 'DISPATCHED')

  const detail = await call('GET', `/requests/${requestId}`, undefined, police.access_token)
  check('request now shows the assigned volunteer', Boolean(detail.json.data?.request?.assigned_volunteer),
    detail.json.data?.request?.assigned_volunteer?.full_name ?? 'none')

  const nearby = await call('GET', '/requests/nearby?lat=12.9800&lng=77.6000&radius_m=5000', undefined, volToken)
  const ids = (nearby.json.data?.requests ?? []).map((r: any) => r.id)
  check('assigned volunteer sees it in the app', ids.includes(requestId), `${ids.length} nearby`)

  const accept = await call('PATCH', `/requests/${requestId}/accept`, {}, volToken)
  check('volunteer accepts', accept.status === 200 && accept.json.data?.status === 'ACCEPTED', accept.json.data?.status)

  const reAssign = await call('PATCH', `/police/requests/${requestId}/assign`, { volunteer_id: entry.id }, police.access_token)
  check('cannot re-assign an accepted request', reAssign.status === 409, `${reAssign.status} ${reAssign.json?.error?.code}`)

  // Second senior, and the same volunteer put off duty: police must be refused.
  const senior2 = await login(`assign.senior2.${stamp}@example.com`)
  const reg2 = await call('POST', '/registrations/senior', {
    full_name: 'Second Test Senior',
    phone_number: '+91 90000 33333',
    home_latitude: 12.9716,
    home_longitude: 77.5946,
    preferred_language: 'english',
    aadhaar_number: '222333444555',
  }, senior2.access_token)
  const q2 = await call('GET', '/verifications?status=PENDING', undefined, police.access_token)
  for (const v of q2.json.data.verifications) {
    await call('PATCH', `/verifications/${v.id}`, { status: 'APPROVED' }, police.access_token)
  }
  const s2 = await call('POST', '/auth/refresh', { refresh_token: senior2.refresh_token })
  const r2 = await call('POST', '/requests', {
    category: 'transport_assistance',
    description: 'Need a lift to the clinic',
    latitude: 12.9716,
    longitude: 77.5946,
    priority: 'normal',
    source: 'flutter_app',
  }, s2.json.data.access_token)
  const request2 = r2.json.data?.request_id
  check('second request created', Boolean(request2), `${r2.status}`)

  await call('PATCH', '/volunteers/me/availability', { is_available: false }, volToken)
  const offDuty = await call('PATCH', `/police/requests/${request2}/assign`, { volunteer_id: entry.id }, police.access_token)
  check('cannot assign an off-duty volunteer', offDuty.status === 409, `${offDuty.status} ${offDuty.json?.error?.code}`)

  const seniorForbids = await call('PATCH', `/police/requests/${request2}/assign`, { volunteer_id: entry.id }, s2.json.data.access_token)
  check('a senior cannot assign volunteers', seniorForbids.status === 403, `${seniorForbids.status}`)

  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error('aborted:', e.message)
  process.exitCode = 1
})
