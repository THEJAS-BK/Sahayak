# Sahayak

**Sahayak** is a safety and assistance platform for seniors, connecting them
with volunteers and local emergency services.

## Applications

- `mobile/` — Flutter mobile application (for seniors/volunteers). Placeholder; initialization deferred.
- `web/` — React + Vite + TypeScript police administration portal.
- `backend/` — Node.js + TypeScript API, a single modular application.
- `voice-agent/` — Voice agent service (STT, LLM, TTS, telephony). Placeholder; initialization deferred.

The `plans/` directory holds project planning and architecture documentation
(see `plans/scaffolding.md` for the setup plan).

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
`plans/client-design/`. The same personas (Anitha Devi, Karthik Shetty, …) plus
a police officer, requests, emergencies and audit logs can be loaded into the
dev database with `npm run db:seed` (see `backend/scripts/seed.ts`). See
`data/README.md` for the file-by-file guide.

## Backend

### Requirements

- Node.js >= 20 (developed against v22)
- npm

### Run

```bash
cd backend
npm install               # install dependencies

# Start the rootless dev Postgres instance (port 5433)
npm run db:start
npm run db:reset          # run all migrations on the dev database

npm run dev               # start dev server -> http://localhost:3000
```

Other scripts:

```bash
npm run build             # compile TypeScript to dist/
npm start                 # run the compiled build (run build first)
npm run typecheck         # type-check only (no emit)
npm test                  # run the Vitest test suite
npm run db:migrate        # apply pending migrations only
npm run db:down           # revert the last migration
npm run db:seed           # seed the dev database (fails if data already exists)
npm run db:seed:fresh     # wipe business tables, then reseed
```

### Environment

Copy `.env.example` to `.env` and edit. Key variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server listen port |
| `DATABASE_URL` | — | `postgres://sahayak@localhost:5433/sahayak` |
| `DATABASE_URL_TEST` | `DATABASE_URL` | Vitest target database |
| `JWT_SECRET` | — | Random string ≥ 32 chars |
| `JWT_ACCESS_TTL` | `15m` | Access token lifetime |
| `JWT_REFRESH_TTL` | `90d` | Refresh token lifetime |
| `MATCH_RADIUS_M` | `5000` | Candidate search radius (metres) |
| `DISPATCH_BATCH_SIZE` | `5` | Volunteers per dispatch batch |
| `DISPATCH_TIMEOUT_S` | `90` | Stale dispatch re-try window (seconds) |
| `MAX_DISPATCH_ATTEMPTS` | `3` | Retries before `UNASSIGNED` |
| `SMTP_*` | (empty) | Required only in `NODE_ENV=production` |
| `FCM_SERVICE_ACCOUNT_JSON` | (empty) | Path or inline JSON; required in production |

### Health check

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

### Tests

```bash
npm test                  # runs against DATABASE_URL_TEST; no manual DB setup needed
```

## Web (React frontend)

### Requirements

- Node.js >= 20
- npm

### Run

```bash
cd web
npm install       # install dependencies
npm run dev       # start dev server -> http://localhost:5173
```

Other scripts:

```bash
npm run build     # type-check + production build to dist/
npm run preview   # preview the production build
npm run lint      # lint source with oxlint
```