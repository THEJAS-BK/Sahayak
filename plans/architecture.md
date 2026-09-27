# Architecture

> Status: Draft — reflects this build (backend API, app + police portal).

## Runtime shape

- Single Node.js ≥ 20 + TypeScript (ESM, NodeNext) Express 5 process.
- One PostgreSQL database (node-postgres `pg` pool).
- Background jobs run **in-process** via `node-cron` (no separate worker).
- External services: SMTP (nodemailer) and FCM (firebase-admin). Both are
  behind a notification adapter that can log-only in development.
- No queues, Redis, microservices, or WebSockets in the backend.

```text
Flutter app ─── HTTPS (senior JWT) ───► Backend API ◄─── HTTPS (police JWT) ─── Web portal
        (preferred_language, name via WS to voice agent; no backend calls from agent)
                                          │
                                          ▼
                                    PostgreSQL
                                    (all state)
```

## Directory layout (backend)

```text
backend/src/
├── config/        # Zod-validated env → typed config, fail-fast
├── database/      # pg pool + migrations (node-pg-migrate)
├── lib/           # envelope/errors/asyncHandler/logger/http utils
├── middleware/    # authenticate, requireRole, requireActive, rate limiters
├── routes/        # single router aggregating module routers
├── modules/
│   ├── auth/          # A-01..A-06
│   ├── users/         # /me, fcm-token, shared user queries
│   ├── seniors/       # senior profile + registration form
│   ├── volunteers/    # volunteer profile, location/availability, accept
│   ├── requests/      # Q-01..Q-08
│   ├── matching/      # candidate selection, haversine SQL, dispatch batch
│   ├── emergencies/   # E-01..E-03
│   ├── notifications/ # SMTP + FCM adapters (mock in dev)
│   └── police/        # verifications V-01..V-03, P-01, P-02, E-02/E-03
└── server.ts      # boot: validate env → pool → migrate → jobs → listen
```

## Request pipeline

```text
express.json()
  → request-id/logger (optional)
  → route-scoped rate limiters
  → authenticate (Bearer → JWT, attaches req.user)
  → requireRole(...)   (403 if wrong role)
  → requireActive      (BR-01: 403 until users.is_active = true)
  → zod validation at route boundary (400 INVALID_INPUT)
  → controller / service (transactions via pg client)
  → 200 envelope
  → central error handler (maps ApiError → envelope; 500 → GENERIC)
```

Response envelope:

- Success: `{ "success": true, "data": {...} }`
- Error: `{ "success": false, "error": { "code": "SNAKE_CASE", "message": "..." } }`

All route handlers are wrapped in `asyncHandler`; errors propagate to the
single error handler which maps to code + status per §2 of `api-plan.md`.

## Module responsibilities

| Module | Owns |
|---|---|
| `auth` | OTP issue/verify (bcrypt hash, 10 min TTL, single-use, attempts), JWT sign/verify, refresh rotation + family revocation, logout. Police sessions: 8 h / no refresh. |
| `users` | `/me`, `PATCH /me/fcm-token`, role/active gating helpers. |
| `seniors` / `volunteers` | Registration form handling, profile reads, BR-08 filtered volunteer view. |
| `requests` | CRUD + state-transition endpoints; single `canTransition(from, to)` call site (BR-04). |
| `matching` | Candidate query (distance via Haversine in SQL, freshest location), ranking, dispatch batch, dispatch attempt bookkeeping. |
| `emergencies` | Independent event logging (BR-11), escalation flag `escalated_to_112=true`, review flow. |
| `notifications` | `EmailSender` (nodemailer or dev stub) and `PushSender` (FCM or dev stub); fire-and-forget, failures logged never throw. |
| `police` | Verification approve/reject transaction, monitoring queries, audit trail query. |

## Key flows

### Q-01 create request (synchronous match)

```text
POST /api/requests (senior JWT, is_active)
  → validate (zod)
  → 409 if senior already has an open request (partial unique index)
  → INSERT status=PENDING
  → matching.run(request): candidates → rank → top DISPATCH_BATCH_SIZE
     → UPDATE status=MATCHING then DISPATCHED, dispatch_batch=jsonb, dispatched_at
     → FCM loop fire-and-forget (stub in dev)
  → 201 with { request_id, status: "PENDING" }  (row already committed; don't await push)
```

Status is returned as `PENDING` for the pre-matched state even though matching
runs synchronously (spec §4 Q-01).

### Q-05 accept (first-accept-wins)

```text
PATCH /api/requests/:id/accept (volunteer JWT)
  → preconditions: approved + is_available + no other active assignment (BR-05)
  → single conditional UPDATE:
      UPDATE help_requests SET status='ACCEPTED', assigned_volunteer_id=$1,
             accepted_at=now()
      WHERE id=$2 AND status='DISPATCHED' RETURNING *
      → 0 rows ⇒ 409 ALREADY_ASSIGNED
  → audit row + FCM to senior (after commit, fire-and-forget)
```

No `SELECT … then UPDATE` anywhere. The volunteer's current position is
snapshotted into the request on accept.

### Dispatch sweep (BG-01, every 30 s)

```text
lock (in-process guard)
  candidates = DISPATCHED with dispatched_at < now() - DISPATCH_TIMEOUT_S
  for each: next batch (attempt+1)
    attempt > MAX_DISPATCH_ATTEMPTS → UNASSIGNED + police portal alert
    else → re-rank, new DISPATCHED batch, FCM to new volunteers
```

### Notifications in development

`SMTP_*` is **required in production** while `FIREBASE_SERVICE_ACCOUNT_JSON`
and `FCM_ENABLED` are **optional in development** and
**required in production** (`NODE_ENV=production` fails fast if missing). When
absent, the adapters log what would be sent and return success — dev flow is
exercisable with a bare `DATABASE_URL`. This is a deliberate deviation from §8
of the spec, recorded in `decisions.md`.