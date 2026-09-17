# Project Scope

**Sahayak** ("help/assistance" in Kannada) connects seniors who need help with
verified nearby volunteers, with the police portal providing live oversight,
verification of volunteers/seniors, and emergency visibility.

> Status: Draft — this build is the backend API + police portal only.

## In scope (this build)

- **Backend API** — single Node.js + TypeScript + Express process. JSON in/out
  under `/api`. 24 HTTP endpoints covering auth (OTP), registration &
  verification, help requests, volunteer matching, live location/availability,
  emergency events, police monitoring, and audit logs.
- **One PostgreSQL database** — all state (users, profiles, verifications,
  OTPs, requests, dispatches, emergencies, audit) in a single schema.
- **External services** — FCM (push to senior & volunteer apps) and SMTP (OTP
  email) only. No other third-party integrations.
- **Background jobs** — in-process `node-cron`: BG-01 dispatch timeout sweep
  (30 s), BG-02 credential cleanup (daily). Overlap-guarded, disabled in test.
- **Phase 1 of the voice-agent boundary** — the voice agent holds no backend
  credential; the Flutter app submits requests/emergencies with the senior's
  JWT. No service-credential path is built now.

## Out of scope / deferred

- Flutter mobile app (`mobile/`) and voice-agent service (`voice-agent/`).
- Web police portal UI (`web/` React app) — the backend contract it consumes is
  defined in `api-plan.md`; the UI itself is a later pass.
- Any telephony/PSTN path, inbound phone calls, caller-ID lookup
- WhatsApp/ring-call dispatch. The voice agent is reached only inside the app.
- PostGIS / geospatial indexes — Haversine is computed in SQL; fine for this
  scale.

## Roles

| Role | Notes |
|---|---|
| `senior` | Registers via app, creates help requests, logs emergencies. `senior_id` is `NOT NULL` on `help_requests` and `emergency_events`. |
| `volunteer` | Verified, can be matched, accepts dispatch, updates location/availability. At most one active assignment. |
| `police` | Portal operator: verifies registrations, monitors requests/emergencies, reads audit trail. 8 h sessions, no refresh. |

## Non-functional targets

- RBAC enforced by middleware; ownership checks on senior/volunteer data.
- Full audit trail: every state-changing write appends an `audit_logs` row in
  the same transaction; system-driven writes (dispatch sweep) have `actor_id =
  NULL`.
- Single-write transactions and atomic conditional updates to prevent
  double-accept races.
- Zod validation at every route boundary before business logic runs.
- Fail-fast boot: the whole env is validated with Zod in one place; missing
  required variables crash startup.
- Restart-safe rate limits for OTP issuance (per-email) and failed-verification
  attempts (per-email), backed by Postgres.

## Deliverable definition of done

1. All endpoints in `api-plan.md` behave per their contracts.
2. Business rules BR-01..BR-13 in `api-plan.md` §5 enforced.
3. `npm run test` green (vitest, unit + integration via supertest).
4. `npm run build` passes; server boots and `/health` responds.