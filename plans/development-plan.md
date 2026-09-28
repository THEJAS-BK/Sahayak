# Development Plan

> Status: **Complete.** Phases 0–4 shipped and Phase 5 verified:
> `npm run build` + `npm run test` green (47 tests, 5 suites), README env/run
> docs written, `scaffolding.md` reflects current build state. As-built notes
> and late decisions are recorded at the bottom of this file and in
> `decisions.md`.

Source of truth for behavior: `api-plan.md` (contracts + business rules) and
`database-design.md` (schema). Every phase ends with `tsc --noEmit` +
`npm run test` green and a manual `curl`/health smoke.

## Phase 0 — Foundations — done

Deliverables:

- Install deps:
  - prod: `pg`, `zod`, `jsonwebtoken`, `bcryptjs`, `nodemailer`,
    `express-rate-limit`, `node-cron`, `node-pg-migrate`
  - dev: `vitest`, `supertest`, `@types/pg`, `@types/jsonwebtoken`,
    `@types/nodemailer`, `@types/bcryptjs`, `@types/supertest`
- `src/config/index.ts` — Zod schema over all env vars (§ `api-plan.md` Env);
  fail-fast, exported typed config.
- `src/database/pool.ts` — `pg.Pool` from `DATABASE_URL`; query-timeout.
- `src/lib/` — `http.ts` (envelope helpers + `ApiError` + codes + status map),
  `async-handler.ts`, `logger.ts`.
- `src/app.ts` — register error-handling + 404 middleware; keep `/health`.
- `docker-compose.yml` (postgres:18, db `sahayak`) + npm scripts `db:up` /
  `db:migrate` / `db:reset`. See `plans/pg-db-connection.md` for which local
  instance the backend actually uses.
- Migration #1: `citext` ext + `set_updated_at()` trigger.
- `vitest.config.ts` + global setup (test database create/teardown).
- `.env.example`.

Verify: server boots; `/health` ok; migrations apply idempotently; vitest
runs a trivial suite.

## Phase 1 — Auth (A-01..A-06) — done

Deliverables:

- Migrations: `users`, `otp_codes`, `otp_attempts`, `refresh_tokens`,
  `audit_logs`.
- `src/middleware/auth.ts` — `authenticate`, `requireRole`, `requireActive`,
  `requireRefresh`.
- `src/modules/auth/` — `otp.service` (generate/bcrypt/expiry 10 min/verify
  newest-unused/attempts), `tokens.service` (JWT sign 15 m, refresh rotation +
  family revocation, hashed storage, logout/police 8 h variant),
  `routes` (A-01..A-04), `users` module with `getMe`/`updateFcmToken`
  (A-05/A-06).
- Rate limiting: 3/email/10 min (query otp_codes), 10/IP/hr (in-memory),
  5 fails/email/10 min (`otp_attempts`).
- SMTP adapter (email.sendotp) + log-only stub for dev.

Tests: OTP issue→verify→used→expired→429; refresh rotation + reuse→family
revoke; logout; `/me` role/active/verification status; hot paths audited.

## Phase 2 — Registration + Verification (R-01..R-03, V-01..V-03) — done

Deliverables:

- Migrations: `user_verifications`, `senior_profiles`, `volunteer_profiles`.
- Registration routes + Zod schemas; 409 on existing PENDING/APPROVED.
- `police/verifications` — list/filter, get, approve/reject in ONE transaction
  (users.role+is_active, profile insert from `form_data`, reviewed_*, status,
  audit); notification fired after commit (failures logged only).

Tests: dup-409; approve transaction; reject; poll R-03; audit row present.

## Phase 3 — Requests, Matching, Volunteers, Police monitoring — done

Deliverables:

- Migration: `help_requests`.
- `canTransition(from, to)` — one call site (BR-04/BR-03).
- `matching/` — candidates (active/available/no-active, radius, fresh-else-base,
  Haversine SQL + bbox prefilter), rank (distance, skill tiebreak, urgent ×2),
  batch top-5, DISPATCHED + `dispatch_batch`, FCM fire-and-forget.
- `requests/` — Q-01 create + sync match + open-request 409; Q-02/Q-03
  role-filtered reads; Q-04 nearby; Q-05 atomic accept (BR-05/BR-06) +
  position snapshot; Q-06 status transitions + `completed_at` + clear location;
  Q-07 cancel; Q-08 volunteer contact (BR-08).
- `volunteers/` — L-01 live location (BR-09), L-02 availability.
- `police/` — P-01 cursor-filtered live view. Notifications service + FCM
  adapter/stub.

Tests: first-accept-wins; BR-05; terminal-state immutability; Q-08 field
filter; nearby radius membership; L-01 gating; P-01 pagination.

## Phase 4 — Emergencies + Background jobs — done

Deliverables:

- Migration: `emergency_events`.
- `emergencies/` — E-01 create (BR-11, ownership of `help_request_id`,
  escalation flags, audit, police push), police E-02/E-03 review.
- `jobs/` — BG-01 dispatch sweep (30 s: timeout→next batch→UNASSIGNED+alert),
  BG-02 daily cleanup (used/expired OTPs, revoked/expired refresh tokens);
  in-process lock guard, disabled when `NODE_ENV === 'test'`.
- `police/` — P-02 audit query (filters, cursor, DESC).

Tests: E-01 without request; sweep increments dispatch_attempt; UNASSIGNED +
alert; BG-02 deletes garbage; lock guard prevents overlap.

## Phase 5 — Hardening + verification — done

Deliverables:

- Full audit-regression sweep across all write endpoints.
- `.env.example` finalization; README run instructions (docker, migrate, dev,
  test, prod build).
- End-to-end curl smoke: police verify senior+volunteer → senior creates
  request → volunteer accepts → IN_PROGRESS → COMPLETED → emergency → audit.
- `npm run build` + full `npm run test` green.

## As-built notes

What the shipped build settled on, beyond the plan of record (all deviations
also logged in `decisions.md`):

- **R-01/R-02** take an optional `fcm_token` in the body and persist it to
  `user_verifications.fcm_token` and `users.fcm_token`. Required because a
  pre-approval user (`role = NULL`) cannot call A-06.
- **Position snapshot:** `dispatch_batch` stores `{id, latitude, longitude,
  distance_m}` captured at *dispatch* time (the "snapshot on accept" decision
  was adjusted to dispatch, where the coordinates are actually read). Q-04
  membership is `jsonb_array_elements`.
- **Ownership reads:** Q-03 hides non-participant requests with 404 (no
  existence leak); Q-08 stays 403 per BR-08.
- **BG-01** excludes already-tried volunteers on re-dispatch and FCMs only the
  *new* batch; `actor_id = NULL` on sweep audits.
- **BG-02** deletes used/expired `otp_codes` and consumed/revoked/expired
  `refresh_tokens`; no audit rows for table-tidying DELETEs.
- **P-02** supports `actor_id=null` (system events) via the query string.
- Notifications target a dev-stub FCM sender (log-and-continue) and a fixed
  police topic token; SMTP is stubbed with `sentEmails` capture for tests.
- **Dev seeding (post-ship):** `backend/scripts/seed.ts` (`npm run db:seed` /
  `db:seed:fresh`) now bootstraps only the single police account from
  `POLICE_BOOTSTRAP_EMAIL` (dev value `police@gmail.com`); the fabricated
  senior/volunteer/pending-registration personas, requests, emergencies and
  audit logs were dropped, so the dev database starts empty apart from that
  officer. Seniors and volunteers are created by registering in the mobile app
  and being approved in the portal. The test suite stays fixture-driven and
  unchanged (`database-design.md` "Migration strategy" for details).
- Final check: `npm run build` clean, `npm run typecheck` clean, 47/47 tests
  across 5 suites (`auth`, `registration`, `requests`, `emergency`, plus the
  Phase 0 smoke suite).

## Definition of done

- All A/R/V/Q/L/E/P endpoints live and contract-conformant.
- BR-01..BR-13 enforced (see `api-plan.md`).
- Jobs overlap-guarded and test-safe.
- CI-equivalent: `npm run build && npm run test` pass from clean clone after
  `npm ci` + `db:migrate`.
