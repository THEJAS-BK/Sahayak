# Database Design

> Status: Draft. PostgreSQL 16+. Schema is managed with `node-pg-migrate`.
> Enums are `text` + `CHECK` constraints (easier to evolve than PG enum types).

## Conventions

- UUID PKs via `gen_random_uuid()`.
- `created_at`/`updated_at` `timestamptz`; `updated_at` maintained by a
  `set_updated_at()` trigger.
- Lat/lng: `numeric(9,6)`; nullables for the volunteer's live position.
- JSONB for `form_data`, `dispatch_batch`, `details`, `emergency_contact`.
- FK references named `<table>_id`.
- Emails are `text`; the app lowercases before storing/querying and a
  case-insensitive unique index (`lower(email)`) enforces uniqueness. `citext`
  was dropped because the contrib package wasn't available in the dev
  environment — see `decisions.md`.

## Tables

### 1. `users`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `email` | text NOT NULL UNIQUE | unique index on `lower(email)`; app normalizes to lowercase |
| `role` | text NULL | `senior` \| `volunteer` \| `police`; NULL until registration |
| `is_active` | boolean NOT NULL | default `false` (BR-01) |
| `fcm_token` | text NULL | current device token (`PATCH /me/fcm-token`) |
| `created_at` / `updated_at` | timestamptz | trigger |

### 2. `senior_profiles`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL UNIQUE FK→users | |
| `full_name` | text NOT NULL | |
| `phone_number` | text NOT NULL | |
| `home_latitude` / `home_longitude` | numeric(9,6) NOT NULL | |
| `preferred_language` | text NOT NULL | CHECK in (`kannada`,`english`,`tulu`) |
| `aadhaar_number` | text NOT NULL | 12-digit Aadhaar card number |
| `emergency_contact` | jsonb NULL | `{ name, phone, relation }` |
| `created_at` / `updated_at` | timestamptz | |

### 3. `volunteer_profiles`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL UNIQUE FK→users | |
| `full_name` | text NOT NULL | |
| `phone_number` | text NOT NULL | |
| `organization` | text NULL | |
| `skills` | jsonb NOT NULL | string array |
| `id_proof_ref` | text NULL | |
| `aadhaar_number` | text NOT NULL | 12-digit Aadhaar card number |
| `club_id` | text NULL | optional club membership reference |
| `base_latitude`/`base_longitude` | numeric(9,6) NOT NULL | fallback distance origin |
| `current_latitude`/`current_longitude` | numeric(9,6) NULL | live position (BR-09) |
| `location_updated_at` | timestamptz NULL | freshness window = 10 min |
| `is_available` | boolean NOT NULL | default `false` |
| `created_at` / `updated_at` | timestamptz | |
| CHECK | | `(current_latitude IS NULL) = (current_longitude IS NULL) = (location_updated_at IS NULL)` |

### 4. `otp_codes`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `email` | text NOT NULL | case-lowered by app (no citext — see `decisions.md`) |
| `code_hash` | text NOT NULL | `bcrypt(code)` |
| `expires_at` | timestamptz NOT NULL | `now() + 10 min` (BR-07) |
| `used` | boolean NOT NULL | default `false` |
| `created_at` | timestamptz | |

Indexes: `(email, created_at DESC)`, partial `(email) WHERE used = false`.

### 5. `otp_attempts`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `email` | text NOT NULL | case-lowered by app (no citext — see `decisions.md`) |
| `success` | boolean NOT NULL | |
| `created_at` | timestamptz | |

Index: `(email, created_at)`. Powers the "5 failed per email / 10 min → 429"
rule and the issuance "3 per email / 10 min" rule (via `otp_codes.created_at`
for issuance, this table for failed verifies).

### 6. `refresh_tokens`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL FK→users | |
| `family_id` | uuid NOT NULL | chain-revocation group |
| `token_hash` | text NOT NULL UNIQUE | sha256 of raw token; raw never stored |
| `expires_at` | timestamptz NOT NULL | |
| `consumed_at` | timestamptz NULL | set when rotated |
| `revoked_at` | timestamptz NULL | set on whole-family revoke |
| `created_at` | timestamptz | |

Index: `(family_id)`. Rotation: consume old + insert new (same family). Reuse of
a consumed token → `revoked_at = now()` on all rows of that family → 401.

### 7. `user_verifications`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL FK→users | |
| `role` | text NOT NULL | CHECK (`senior`,`volunteer`) |
| `form_data` | jsonb NOT NULL | the submitted registration form |
| `fcm_token` | text NULL | device token at registration |
| `status` | text NOT NULL | CHECK (`PENDING`,`APPROVED`,`REJECTED`) |
| `reviewed_by` | uuid NULL FK→users | police officer |
| `reviewed_at` | timestamptz NULL | |
| `review_reason` | text NULL | rejection reason |
| `created_at` / `updated_at` | timestamptz | |

Partial unique index: `(user_id) WHERE status IN ('PENDING','APPROVED')` → the
409 guarantee for re-registration.

### 8. `help_requests`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `senior_id` | uuid NOT NULL FK→users | BR-10 removed: never NULL |
| `category` | text NOT NULL | |
| `description` | text NOT NULL | |
| `details` | jsonb NULL | free-form |
| `latitude`/`longitude` | numeric(9,6) NOT NULL | |
| `priority` | text NOT NULL | CHECK (`normal`,`urgent`) default `normal` |
| `source` | text NOT NULL | CHECK (`voice_agent`,`flutter_app`) |
| `status` | text NOT NULL | CHECK (8 states below) default `PENDING` |
| `assigned_volunteer_id` | uuid NULL FK→users | |
| `dispatch_attempt` | int NOT NULL | default `0` |
| `dispatched_at` | timestamptz NULL | |
| `dispatch_batch` | jsonb NULL | array of volunteer ids (Q-04 membership) |
| `accepted_at` / `completed_at` / `cancelled_at` | timestamptz NULL | |
| `created_at` / `updated_at` | timestamptz | |

Partial unique index: `(senior_id) WHERE status IN ('PENDING','MATCHING',
'DISPATCHED','ACCEPTED','IN_PROGRESS')` → one open request per senior (BR-13).
Indexes: `(status, dispatched_at)` (sweep), `(assigned_volunteer_id)`.

### 9. `emergency_events`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `senior_id` | uuid NOT NULL FK→users | BR-12 removed: never NULL |
| `trigger_type` | text NOT NULL | CHECK (`semantic_llm`,`acoustic_distress`,`keyword_repetition`) |
| `source` | text NOT NULL | CHECK (`voice_agent`,`flutter_app`) |
| `help_request_id` | uuid NULL FK→help_requests | ownership-validated |
| `detail` | jsonb NULL | |
| `latitude`/`longitude` | numeric(9,6) NULL | |
| `escalated_to_112` | boolean NOT NULL | default `true` |
| `escalated_at` | timestamptz NOT NULL | default `now()` |
| `status` | text NOT NULL | CHECK (`LOGGED`,`REVIEWED`) default `LOGGED` |
| `created_at` / `updated_at` | timestamptz | |

Indexes: `(status)`, `(senior_id, created_at DESC)`.

### 10. `request_declines`

| column | type | notes |
|---|---|---|
| `request_id` | uuid NOT NULL FK→help_requests | ON DELETE CASCADE |
| `volunteer_id` | uuid NOT NULL FK→users | ON DELETE CASCADE |
| `reason` | text NULL | free text from the app |
| `created_at` | timestamptz NOT NULL | default `now()` |

Indexes: unique `(request_id, volunteer_id)` (one decline per volunteer, makes
the endpoint idempotent), `(volunteer_id)` for the `/nearby` filter.

Deliberately **not** a `help_requests.status`: a decline belongs to one
volunteer, the request stays DISPATCHED for everyone else, and the senior is
not notified.

### 11. `audit_logs`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `actor_id` | uuid NULL FK→users | NULL for system (sweep) events |
| `action` | text NOT NULL | e.g. `request.accepted` |
| `entity_type` | text NOT NULL | e.g. `help_request` |
| `entity_id` | uuid NOT NULL | |
| `before` / `after` | jsonb NULL | state diffs |
| `metadata` | jsonb NULL | |
| `created_at` | timestamptz | |

Index: `(entity_type, entity_id)`, `(created_at DESC)`.

## State machine (help_requests)

```text
PENDING ─(match)─► MATCHING ──► DISPATCHED ─(accept)─► ACCEPTED ─(start)─► IN_PROGRESS ─(complete)─► COMPLETED
   │                    │              │
   └────────┴───────────┴──(cancel, before ACCEPTED)──► CANCELLED
                              └──(retries exhausted, DEGRADED)──► UNASSIGNED
```

- Allowed transitions are the single source of truth in
  `canTransition(from, to)` (BR-04). COMPLETED / CANCELLED / UNASSIGNED are
  terminal (BR-03).
- `UNASSIGNED` is reached only by BG-01 after `MAX_DISPATCH_ATTEMPTS`; the
  spec's chart shows DISPATCHED → UNASSIGNED (see §5 BR-04).

## Migration strategy

- Files: `backend/migrations/<timestamp>_<name>.{ts}` via `node-pg-migrate`.
- Migration #1 creates the `citext` extension and `set_updated_at()` trigger
  function.
- All tables above land across the phase migrations (auth → users/otp/tokens,
  registration → profiles/verifications, requests/matching → help_requests,
  emergencies → emergency_events; `audit_logs` early since phases 1+ write it).
- Dev seeding lives in `backend/scripts/seed.ts`, run via `npm run db:seed`
  (empty tables only) / `npm run db:seed:fresh` (wipes business tables first).
  It creates exactly one police account, the address in `POLICE_BOOTSTRAP_EMAIL`
  (dev value `police@gmail.com`) — no fabricated personas. Seniors and
  volunteers exist only after they register in the mobile app and the police
  account approves them; requests, emergencies and audit logs follow from real
  use. The test suite is unaffected: it stays fixture-driven
  against the test database (created/dropped by vitest global setup).

## Distance in SQL (matching)

- Candidate prefilter: bounding box `lat ± d/111km`, `lng ± d/(111km·cos(lat))`
  to keep it index/seq-scan friendly.
- Exact miles→km Haversine in `ORDER BY` and `HAVING`, computed against
  `current_*` when `location_updated_at > now() - 10 min`, else `base_*`
  (COALESCE per column).
- Urgent requests widen the radius by 2×.