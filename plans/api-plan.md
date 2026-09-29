# API Plan

> Status: **Implemented.** All contracts below are live and test-covered. As-built
> deviations are logged in `decisions.md`.

Base path `/api`. JSON in/out, with one exception: `Q-09` is a
`multipart/form-data` upload. See §Conventions below, then the endpoint table,
then the contracts that need pinning down.

## Conventions

- Success: `{ "success": true, "data": { ... } }`
- Error: `{ "success": false, "error": { "code": "SNAKE_CASE_CODE", "message": "..." } }`
- Status codes: 400 invalid input · 401 unauthenticated · 403 role/ownership ·
  404 not found · 409 conflict / invalid state transition · 429 rate limited ·
  500 server failure.
- Auth: `Authorization: Bearer <access_token>`. `requireRole` + `requireActive`
  (BR-01) middleware; ownership checks per endpoint.
- Every state-changing write appends an `audit_logs` row in the same
  transaction. System-generated events (dispatch sweep) write `actor_id = NULL`.
- Zod validation at the route boundary before any business logic. `Q-09` is the
  exception: it has no JSON body to parse, so multer's `fileFilter` validates
  the part instead.

## Endpoint table

| ID | Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|---|
| A-01 | POST | `/api/auth/otp/request` | — | — | Email a 6-digit OTP |
| A-02 | POST | `/api/auth/otp/verify` | — | — | Verify OTP, issue tokens |
| A-03 | POST | `/api/auth/refresh` | refresh token | any | Rotate, issue new pair |
| A-04 | POST | `/api/auth/logout` | required | any | Revoke refresh token |
| A-05 | GET | `/api/me` | required | any | Current user snapshot |
| A-06 | PATCH | `/api/me/fcm-token` | required | senior, volunteer | Refresh device FCM token |
| R-01 | POST | `/api/registrations/senior` | required | unapproved | Submit senior form |
| R-02 | POST | `/api/registrations/volunteer` | required | unapproved | Submit volunteer form |
| R-03 | GET | `/api/registrations/me` | required | unapproved | Poll verification status |
| V-01 | GET | `/api/verifications` | required | police | List, filter by `status` |
| V-02 | GET | `/api/verifications/:id` | required | police | Full submitted form |
| V-03 | PATCH | `/api/verifications/:id` | required | police | Approve / reject |
| Q-01 | POST | `/api/requests` | required | senior | Create help request |
| Q-02 | GET | `/api/requests/me` | required | senior, volunteer | Own requests |
| Q-03 | GET | `/api/requests/:id` | required | senior, volunteer, police | One request, role-filtered |
| Q-04 | GET | `/api/requests/nearby` | required | volunteer | DISPATCHED requests near me |
| Q-05 | PATCH | `/api/requests/:id/accept` | required | volunteer | Accept (first-wins) |
| Q-05b | PATCH | `/api/requests/:id/decline` | required | volunteer | Turn down an offer (per-volunteer, request stays live) |
| Q-06 | PATCH | `/api/requests/:id/status` | required | volunteer | → IN_PROGRESS / COMPLETED |
| Q-07 | PATCH | `/api/requests/:id/cancel` | required | senior | Cancel before ACCEPTED |
| Q-08 | GET | `/api/requests/:id/volunteer` | required | senior | Assigned volunteer contact |
| Q-09 | POST | `/api/requests/:id/photo` | required | senior | Attach/replace a photo (multipart, field `photo`; returns `image_url`) |
| L-01 | PATCH | `/api/volunteers/me/location` | required | volunteer | Update live location |
| L-02 | PATCH | `/api/volunteers/me/availability` | required | volunteer | Toggle `is_available` |
| E-01 | POST | `/api/emergency-events` | required | senior | Log distress immediately |
| E-02 | GET | `/api/police/emergency-events` | required | police | Filterable emergency list |
| E-03 | PATCH | `/api/police/emergency-events/:id` | required | police | Mark REVIEWED |
| P-01 | GET | `/api/police/requests` | required | police | Live monitoring view |
| P-02 | GET | `/api/audit-logs` | required | police | Query audit trail |
| H-01 | GET | `/health` | — | — | Liveness |

**Implementation status:** every row above is implemented and covered by the
Vitest suite. Two body/response notes worth keeping in mind (details in
`decisions.md`):

- R-01 / R-02 additionally accept an **optional `fcm_token`** (persisted to
  `user_verifications.fcm_token` and `users.fcm_token`) because a pre-approval
  user (`role = NULL`) cannot call A-06.
- Q-03 (and the other role-filtered reads) answer **404** when the caller has
  no relationship to the resource so its existence does not leak; Q-08 answers
  **403** per BR-08.
- `dispatch_batch` is a JSON array of **objects** `{id, latitude, longitude,
  distance_m}` (a position snapshot at dispatch), not a bare ID array; Q-04
  membership is checked with `jsonb_array_elements`.

## Contracts worth pinning down

### A-01 POST /api/auth/otp/request
- Body: `{ "email": string }`. Always `200 { sent: true }` (no email
  enumeration). Rate limits: 3 per email / 10 min (DB-backed via recent
  `otp_codes`), 10 per IP / hour (in-memory store). Generates code, stores
  `bcrypt(code)`, `expires_at = now() + 10 min`, sends via SMTP adapter.

### A-02 POST /api/auth/otp/verify
- Body: `{ "email", "code" }`. Matches newest unused unexpired code; marks
  `used`; creates `users` row if new (role NULL, is_active false); 5 failed per
  email / 10 min → 429. Issues access+refresh (police: single 8 h access, no
  refresh). Returns `{ access_token, refresh_token?, user }` where suspended
  users show `role`/`is_active`/`verification_status` as-is and A-05 reflects it.

### A-03 POST /api/auth/refresh
- Body: `{ "refresh_token" }`. Consumes presented token, issues new pair
  (same family). Reuse of already-rotated token revokes the whole family → 401.

### A-06 PATCH /api/me/fcm-token
- Body: `{ "fcm_token": string }` → updates `users.fcm_token`. Audit row.

### R-01 / R-02 registration
- Senior: `{ full_name, phone_number, home_latitude, home_longitude,
  preferred_language (kannada|english|tulu), emergency_contact?,
  aadhaar_number }`
- Volunteer: `{ full_name, phone_number, organization?, skills: string[],
  base_latitude, base_longitude, id_proof_ref?, aadhaar_number,
  club_id? }`
- `aadhaar_number` is a 12-digit string; validated with `/^\d{12}$/` in Zod.
- `club_id` (volunteer only) is an optional UUID referencing a club entity.
- Writes one `user_verifications` row `{ role, form_data, fcm_token, status:
  PENDING }`. 409 if a PENDING/APPROVED verification exists for that user.
- 201 `{ verification_id, status: "PENDING" }`.

### V-03 PATCH /api/verifications/:id
- Body: `{ status: "APPROVED" | "REJECTED", reason? }`. Must be PENDING (409
  otherwise). One transaction: set `users.role`/`is_active` (approve only),
  insert role profile from `form_data`, set `reviewed_by`/`reviewed_at`/
  `status`, audit row. Notify after commit (failures logged, never roll back).
- 200 `{ user_id, status }`.

### Q-01 POST /api/requests
- Body: `{ category, description, details?, latitude, longitude, priority?,
  source: "voice_agent" | "flutter_app" }`. `senior_id` from JWT only; caller
  must be active senior (403). 409 if an open request already exists. Creates
  PENDING → matching runs synchronously → MATCHING/DISPATCHED. Returns
  `{ request_id, status: "PENDING" }`. FCM fire-and-forget.

### Q-04 GET /api/requests/nearby
- Query: `lat`, `lng`, `radius_m` (default 5000, max 20000). DISPATCHED
  requests within radius whose `dispatch_batch` includes this volunteer, by
  distance. Never exposes senior phone.
- Excludes requests this volunteer already declined (Q-05b), unless police
  assigned the request to them afterwards.

### Q-05 PATCH /api/requests/:id/accept
- Preconditions (403): volunteer, approved, available, no other
  ACCEPTED/IN_PROGRESS assignment (BR-05). Atomic:
  `UPDATE help_requests SET status='ACCEPTED', assigned_volunteer_id=$1, accepted_at=now()
   WHERE id=$2 AND status='DISPATCHED' RETURNING *` → 0 rows ⇒ 409
  ALREADY_ASSIGNED. Snapshots volunteer position. Notify senior (post-commit).

### Q-05b PATCH /api/requests/:id/decline
- Body: `{ reason?: string (max 280) }`. Volunteer, approved, and the request
  must be DISPATCHED **and** offered to this caller (403 `FORBIDDEN` if not).
- Does **not** change `help_requests.status`: other volunteers can still take
  it and the senior is not notified, because nothing has failed. Inserts
  `request_declines(request_id, volunteer_id)`, which `/nearby` filters out, so
  the volunteer stops being re-asked (previously the app only hid the card in
  RAM, so it reappeared on the next refresh).
- Idempotent — a double tap returns `already_declined: true`, not an error.
- 409 `NOT_DISPATCHED` if already ACCEPTED/IN_PROGRESS/completed.
- Police hand-assignment (P-05) overrides a decline: `/nearby` still shows the
  request when `assigned_volunteer_id` is the caller, because an officer
  deciding this person should do it outranks their earlier refusal.
- Audit `request.declined`.

### Q-06 PATCH /api/requests/:id/status
- Body: `{ status: "IN_PROGRESS" | "COMPLETED" }`. Must be the assigned
  volunteer (403). Validated by `canTransition` (409). COMPLETED sets
  `completed_at`, clears volunteer `current_*` + `location_updated_at`.

### Q-08 GET /api/requests/:id/volunteer
- Caller = the request's senior and status ∈ ACCEPTED/IN_PROGRESS/COMPLETED
  (else 403). Returns only `{ full_name, phone_number, organization, skills }`.
  Single exposure point for a volunteer's phone (BR-08).

### Q-09 POST /api/requests/:id/photo
- `multipart/form-data`, single part named `photo`. The only non-JSON call in
  the API.
- `image/jpeg`, `image/png` or `image/webp` only, 5 MB max. Anything else is
  `400 UNSUPPORTED_IMAGE_TYPE` / `PHOTO_TOO_LARGE`; a missing part is
  `400 NO_IMAGE`. A Cloudinary rejection surfaces as `400 UPLOAD_FAILED`, which
  is arguably the wrong status — the cause is server-side — but it is what the
  route does today.
- Bytes are streamed to Cloudinary by multer and never touch Postgres. Only the
  delivery URL is stored, on `help_requests.image_url`, alongside a server-only
  `image_public_id` that exists so a later replace can delete the asset it
  supersedes. Returns `201 { photo: { request_id, image_url, size_bytes } }`.
- Ownership is checked **before** the body is read, so an upload for someone
  else's request answers `404` and nothing is ever sent to Cloudinary. If the
  database write then fails, the just-uploaded asset is destroyed.
- **There is no image GET endpoint.** `image_url` and `has_photo` ride along on
  every request payload (Q-02, Q-03, Q-04, P-01), and the URL is public, so
  clients render it directly.
- Cloudinary credentials are deliberately *not* validated at boot. If they are
  absent the route answers `503 IMAGE_UPLOAD_UNAVAILABLE` and the rest of the
  API is unaffected.

### L-01 PATCH /api/volunteers/me/location
- Body: `{ latitude, longitude }`. Only while an active assignment exists
  (BR-09), else 403. Updates `current_*`, `location_updated_at`.

### E-01 POST /api/emergency-events
- Body: `{ trigger_type, source, help_request_id?, detail?, latitude?,
  longitude? }`. `senior_id` from JWT. `help_request_id` if present must exist +
  belong to senior (400). Never gated on a request existing (BR-11). Sets
  `escalated_to_112 = true`, `escalated_at = now()`, `status = LOGGED`, audit,
  push to police portal (FCM/log).
- 201 `{ event_id, status: "LOGGED", escalated_to_112: true }`.

### P-01 GET /api/police/requests
- Query: `status?`, `priority?`, `from?`, `to?`, `limit` (≤200), `cursor?`.
  Full rows incl. senior name/phone + assigned volunteer.

### P-02 GET /api/audit-logs
- Query: `entity_type?`, `entity_id?`, `actor_id?`, `action?`, `from?`, `to?`,
  `limit`, `cursor?`. `created_at DESC`. Read-only.

### P-04 GET /api/police/volunteers
- Query: `lat?`, `lng?` (distance + ordering), `available?`, `search?`, `limit`.
- Police only. The dispatch directory for manual assignment. Unlike the
  automatic matcher it ignores the dispatch radius and batch size, so an
  officer can reach a volunteer the matcher never offered.
- **Ordering is "whoever can take it", not "nearest".** Volunteer coordinates
  are not trustworthy yet (`base_*` is a registration-time locality guess, and
  `current_*` only exists during an active job), so a distance sort would be
  false precision; the list orders `can_assign` first and omits distance until
  real positions are fed in. Pass `lat`/`lng` and it switches to
  distance-ordered. Tracked in `plans/deferred-before-production.md` §2.
- Off-duty volunteers and volunteers already on a job are still listed, flagged
  with `can_assign: false` plus the individual flags, so the UI can explain a
  refusal instead of hiding people.
- 200 `{ volunteers: [{ id, email, full_name, phone_number, organization,
  skills, is_available, is_verified, latitude, longitude, distance_m,
  has_active_assignment, active_request_id, can_assign }], next_cursor }`.

### P-05 PATCH /api/police/requests/:id/assign
- Body: `{ volunteer_id }`. Police only. Manual dispatch, added because
  automatic dispatch can fail (no candidate, or `UNASSIGNED` after
  `MAX_DISPATCH_ATTEMPTS`) and a senior cannot be left waiting.
- Source status must be `PENDING`, `MATCHING` or `DISPATCHED` (BR-04). Any
  other state ⇒ 409.
- The volunteer must be an active, approved, **on-duty** volunteer with no other
  active assignment (BR-05). Availability is not overridable: Q-05 refuses an
  accept from an off-duty volunteer, so handing them the request would strand
  the senior.
- Sets `status = DISPATCHED`, `assigned_volunteer_id`, and appends the volunteer
  to `dispatch_batch` (without which Q-04 would never show it to them) with a
  position snapshot + distance. `accepted_at` stays null — police chooses who is
  asked, the volunteer still has to accept. Audit + post-commit notification to
  both sides.
- 200 `{ request_id, status, category, volunteer, senior }`.

## Business rules

| ID | Rule | Enforced where |
|---|---|---|
| BR-01 | No protected feature until `users.is_active = true` | `requireActive` |
| BR-02 | Only approved, available volunteers matched | matching service |
| BR-03 | COMPLETED / CANCELLED / UNASSIGNED immutable | state machine |
| BR-04 | `canTransition` is the single gate; else 409 | state machine |
| BR-05 | ≤ 1 ACCEPTED/IN_PROGRESS assignment per volunteer | accept transaction |
| BR-06 | First accept wins via conditional update | Q-05 |
| BR-07 | OTPs single-use, 10 min TTL, rate limited | OTP service |
| BR-08 | Volunteer contact only to own senior on active request | Q-08 |
| BR-09 | Location writable only during an active assignment | L-01 |
| BR-11 | Emergencies logged independently of request completion | E-01 |
| BR-13 | One open request per senior | Q-01 + partial index |

## Matching

1. Candidates: active, available volunteer, no active assignment, within radius
   of request (default 5000 m; urgent ×2).
2. Distance from `current_*` if fresh (< 10 min) else `base_*`; Haversine in SQL.
3. Rank: distance asc, skill match on `category` ties.
4. Batch = top `DISPATCH_BATCH_SIZE` (5). FCM each, set DISPATCHED, record
   `dispatch_attempt`/`dispatched_at`.
5. BG-01 sweep (30 s): DISPATCHED older than `DISPATCH_TIMEOUT_S` (90) → next
   batch, `dispatch_attempt + 1`; after `MAX_DISPATCH_ATTEMPTS` (3) →
   UNASSIGNED + police alert.

## Env (Zod-validated, fail-fast)

```
PORT, NODE_ENV, DATABASE_URL, JWT_SECRET, JWT_ACCESS_TTL (15m),
JWT_REFRESH_TTL (90d), MATCH_RADIUS_M, DISPATCH_BATCH_SIZE,
DISPATCH_TIMEOUT_S, MAX_DISPATCH_ATTEMPTS   # always required
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM,
```

Optional — parsed but never required, so a deployment without them still boots:

```
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
CLOUDINARY_FOLDER (sahayak)   # Q-09; absent => 503 IMAGE_UPLOAD_UNAVAILABLE
```