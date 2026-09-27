# Sahayak

**Sahayak** is a safety and assistance platform for seniors, connecting them
with volunteers and local emergency services.

## Applications

| Directory | App | Stack | Status |
|---|---|---|---|
| `mobile/` | Senior & volunteer app (incl. voice assistant) | Flutter (Dart) | Auth, requests & LiveKit voice wired |
| `web/` | Police administration portal | React + Vite + TypeScript | Connected to the backend API |
| `backend/` | API server (single modular app) | Node.js + Express + TypeScript + Postgres | Complete |
| `livekit-voice-agent/` | Conversational voice agent | Python (livekit-agents) | STT/LLM/TTS voice pipeline |
| `data/` | Hand-curated dummy payloads | JSON | Mirrors `plans/api-plan.md` contracts |

Plans, architecture and run cookbooks live in `plans/`. Start with
[`plans/complete-context/`](plans/complete-context/README.md) for a full picture
of the system and its workflows, or [`plans/scaffolding.md`](plans/scaffolding.md)
for the original setup plan.

## Backend

### Requirements

- Node.js >= 20 (developed against v22)
- npm
- PostgreSQL 18 on port 5432 (the server pgAdmin registers as `postgres`)

### Run

```bash
cd backend
npm install               # install dependencies

npm run db:migrate         # apply pending migrations to the shared database

npm run dev               # start dev server -> http://localhost:3000
```

The database is a **shared Neon Postgres**. Put the pooled connection string in
`DATABASE_URL` and a *separate* test database's string in `DATABASE_URL_TEST`
(create it as a Neon test branch) — see `plans/pg-db-connection.md`. There is no
local Postgres.

`npm run db:reset` drops the database schema and reapplies all migrations,
which deletes all existing data. Because the database is shared, this is
**refused by default** and must be forced with
`SAHAYAK_ALLOW_DESTRUCTIVE=1 npm run db:reset`. The same applies to
`npm run db:seed:fresh`. Use `npm run db:migrate` for normal startup.

Other scripts:

```bash
npm run build             # compile TypeScript to dist/
npm start                 # run the compiled build (run build first)
npm run typecheck         # type-check only (no emit)
npm test                  # run the Vitest test suite
npm run db:migrate        # apply pending migrations only
npm run db:down           # revert the last migration
npm run db:seed           # create the single police account from POLICE_BOOTSTRAP_EMAIL (fails if it already exists)
npm run db:seed:fresh     # wipe business tables, then run the bootstrap again
```

### Environment

Copy `.env.example` to `.env` and edit. Key variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server listen port |
| `DATABASE_URL` | — | Shared Neon Postgres, pooled endpoint |
| `DATABASE_URL_TEST` | — | **Separate** test database (a Neon test branch). Never the same as `DATABASE_URL` — the backend refuses to start otherwise, because tests truncate every table |
| `PG_POOL_MAX` | `10` | Pooled connections; keep below Neon's per-endpoint limit |
| `JWT_SECRET` | — | Random string ≥ 32 chars. **Must be identical across all machines** |
| `JWT_ACCESS_TTL` | `15m` | Access token lifetime |
| `JWT_REFRESH_TTL` | `90d` | Refresh token lifetime |
| `OTP_DEV_CODE` | — | Dev-only fixed OTP (e.g. `123456`) |
| `MATCH_RADIUS_M` | `5000` | Candidate search radius (metres) |
| `DISPATCH_BATCH_SIZE` | `5` | Volunteers per dispatch batch |
| `DISPATCH_TIMEOUT_S` | `90` | Stale dispatch re-try window (seconds) |
| `MAX_DISPATCH_ATTEMPTS` | `3` | Retries before `UNASSIGNED` |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | (empty) | Voice agent (LiveKit) credentials |
| `SMTP_*` | (empty) | Required only in `NODE_ENV=production` |

### Health check

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

### Tests

```bash
npm test                  # runs against DATABASE_URL_TEST; no manual DB setup needed
```

## Web (React police portal)

### Requirements

- Node.js >= 20
- npm
- Backend running on `http://localhost:3000` (CORS is already open)

### Run

```bash
cd web
npm install       # install dependencies
npm run dev       # start dev server -> http://localhost:5173
```

Sign in at `/login` with the single police account created by `npm run db:seed`
(from `POLICE_BOOTSTRAP_EMAIL` — dev value `police@gmail.com`; dev OTP
`123456`) — or paste a JWT.

Other scripts:

```bash
npm run build     # type-check + production build to dist/
npm run preview   # preview the production build
npm run lint      # lint source with oxlint
```

> The portal targets `http://localhost:3000/api` by default; override with the
> `VITE_API_URL` env var if your backend lives elsewhere.

### Pages

| Route | Page | Endpoint |
|---|---|---|
| `/` | Dashboard | `GET /api/police/requests`, `GET /api/audit-logs` |
| `/requests` | Requests | `GET /api/police/requests` |
| `/requests/:requestId` | Request detail | `GET /api/requests/:id` |
| `/verification` | Verification queue | `GET /api/verifications`, `PATCH /api/verifications/:id` |
| `/emergencies` | Emergency events | `GET /api/police/emergency-events`, `PATCH /api/police/emergency-events/:id` |
| `/seniors` | Seniors | `GET /api/police/seniors` |
| `/seniors/:seniorId` | Senior detail | `GET /api/police/seniors/:id` |
| `/volunteers` | Volunteers | `GET /api/police/volunteers` |
| `/volunteers/:volunteerId` | Volunteer detail | `GET /api/police/volunteers/:id` |
| `/audit-logs` | Audit logs | `GET /api/audit-logs` |

Not built: **Monitoring** (no defined purpose) and **Map** (needs a mapping
library; no new endpoint required). See `plans/web-portal-gaps.md`.

## Mobile (Flutter — seniors & volunteers)

### Requirements

- Flutter SDK (developed against stable 3.47.x). Confirm with `flutter --version`.
- Backend running on `http://localhost:3000`.

### Run

```bash
cd mobile
flutter pub get
flutter run                     # Android emulator reaches host via 10.0.2.2
```

Point the app at a specific backend (physical device, or web/desktop build):

```bash
flutter run --dart-define=API_BASE_URL=http://<host>:3000
```

See [`mobile/README.md`](mobile/README.md) for the screen-by-screen guide and the
list of what is (and isn't) wired up yet.

## Voice agent (LiveKit)

`livekit-voice-agent/` is the conversational agent (`Voice Assistant`): STT
via AssemblyAI, LLM via GPT-4.1-mini, TTS via Cartesia, VAD via Silero. The
mobile app's "Click to Speak" button joins a LiveKit room, and the agent posts
structured help requests to the app over a data channel, which the app
forwards to `POST /api/requests`.

### Requirements

- Python >= 3.14 and `uv`
- A LiveKit project (cloud or self-hosted) — set the same credentials in the
  backend's `.env` (`LIVEKIT_URL/API_KEY/API_SECRET`)
- Provider API keys for AssemblyAI, OpenAI and Cartesia

### Run

```bash
cd livekit-voice-agent
uv sync
uv run agent.py dev
```

## Dummy data

`data/` contains hand-curated dummy data for frontend development, separated by
client:

- `data/mobile/` — payloads for the senior/volunteer Flutter app
  (auth, registrations incl. `aadhaar_number`/`club_id`, help requests, nearby
  requests, emergencies, `/me`).
- `data/web/` — payloads for the police/admin portal
  (dashboard, verifications, help requests, senior profiles, emergencies,
  audit logs).

The data mirrors the contracts in `plans/api-plan.md` and the wireframes in
`plans/client-design/`. It is a reference for contracts and UI shapes, not
loaded into the dev database — `npm run db:seed` creates only the single police
account from `POLICE_BOOTSTRAP_EMAIL`, and seniors and volunteers come from
registering in the mobile app and being approved in the portal (see
`backend/scripts/seed.ts`). See `data/README.md` for the file-by-file guide.