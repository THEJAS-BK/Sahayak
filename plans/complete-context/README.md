# Sahayak — Complete Context

One-stop orientation for anyone working in this repository: what the system is,
what each component does, how they talk to each other, and the current state of
the work. The end-to-end flows are in [workflow.md](workflow.md).

## 1. What Sahayak is

Sahayak is a safety-and-assistance platform for **senior citizens**, connecting
them with **volunteers** and local **police/emergency services**:

- A senior speaks to a voice assistant ("Click to Speak") or uses the Flutter
  app to raise a **help request** (groceries, medicine, transport, …).
- The backend **matches and dispatches** the request to nearby volunteers.
- A volunteer **accepts** and completes the task.
- Distress is escalated as an **emergency event** (auto–escalated to 112) and
  surfaced to the **police portal** for review.
- Registrations are gated behind a **police-review verification** process.

## 2. Repo layout

| Directory | What it is |
|---|---|
| `backend/` | Node.js + Express + TypeScript API, single modular app, Postgres. |
| `web/` | React + Vite + TypeScript **police administration portal**. |
| `mobile/` | Flutter app for **seniors & volunteers** (incl. LiveKit voice agent UI). |
| `livekit-voice-agent/` | Python voice agent (STT: AssemblyAI, LLM: GPT-4.1-mini, TTS: Cartesia, VAD: Silero). |
| `data/` | Hand-curated dummy payloads mirroring the API contracts (`data/mobile`, `data/web`). |
| `plans/` | Planning, architecture and run docs. `plans/complete-context/` is this guide. |

## 3. Architecture at a glance

```
                         ┌─────────────────────────────────────────────┐
                         │              livekit-voice-agent            │
                         │   (STT · LLM · TTS · VAD) — joins LiveKit   │
                         └───────────────────┬─────────────────────────┘
                                             │ audio + data channel (sahayak_request)
                                             ▼
       ┌──────────────┐   HTTPS/JSON    ┌────────────────────┐   SQL   ┌──────────────┐
       │  mobile/app  │ ───────────────►│      backend       │ ───────►│   Postgres   │
       │ (Flutter)    │ ◄───────────────│  Express + TypeScript│ ◄───────│  (dev :5432) │
       └──────────────┘   JWT + tokens  │  :3000  /api        │         └──────────────┘
                                        └─────────┬──────────┘
                       HTTPS/JSON (Bearer JWT)    │
                                        ┌─────────▼──────────┐
                                        │  web/ (police portal) │
                                        │  React + Vite :5173   │
                                        └──────────────────────┘
```

Every client talks only to the backend over `{ success, data, error }` JSON.
The voice agent talks audio to the mobile app through LiveKit, and structured
help requests flow from the agent back to the app over LiveKit's **data
channel** (`sahayak_request` topic), which the app forwards to `POST /api/requests`.

## 4. Backend domain model (tables)

| Table | Role |
|---|---|
| `users` | Everyone (seniors, volunteers, police); `role`, `is_active`, `fcm_token`. |
| `otp_codes`, `otp_attempts` | Email OTP sign-in (single-use, dev code `123456`). |
| `refresh_tokens` | Long-lived session rotation (`POST /api/auth/refresh`). |
| `user_verifications` | Pending/approved/rejected registration applications + `form_data`. |
| `senior_profiles`, `volunteer_profiles` | Verified profile details, home/base coords, availability, live location. |
| `help_requests` | Request lifecycle + dispatch state + assigned volunteer. |
| `emergency_events` | SOS events, escalated to 112, status `LOGGED` → `REVIEWED`. |
| `audit_logs` | Append-only audit trail for every state change. |

## 5. API surface (what each client uses)

### Auth (all clients)
- `POST /auth/otp/request` — send OTP (dev: fixed `123456`).
- `POST /auth/otp/verify` — returns `access_token` (+ optional `refresh_token`).
- `POST /auth/refresh`, `POST /auth/logout`.
- `GET /me` — current user incl. profile/verification status.

### Senior / volunteer (mobile)
- `POST /requests` (create), `GET /requests/me`, `GET /requests/nearby`.
- `PATCH /requests/:id/accept | /status | /cancel`, `GET /requests/:id/volunteer`.
- `POST /emergency-events`, `PATCH /volunteers/me/location | /availability`.
- `POST /voice-sessions` — LiveKit join token for a fresh voice room.

### Police (web portal)
- `GET /police/requests` — live view with full PII (senior + volunteer).
- `GET /requests/:id` — request detail (police-visible projection).
- `GET /verifications`, `PATCH /verifications/:id` (approve/reject).
- `GET /police/emergency-events`, `PATCH /police/emergency-events/:id` (review).
- `GET /audit-logs` — recent activity feed for the dashboard.

## 6. Personas & seed data

Seeded by `backend/scripts/seed.ts` (`npm run db:seed`):

| Persona | Email | Role |
|---|---|---|
| Officer Ashok Kini | `ashok.kini@example.com` | police (portal login, dev OTP `123456`) |
| Anitha Devi, Lakshmi Shetty, Ravi Kumar, … | `@example.com` | seniors (5) |
| Karthik Shetty, Sunitha Rai, … | `@example.com` | volunteers (4) |
| Pooja Hegde, Manjunath Salian, Rekha Naik | `@example.com` | pending verification (3) |

Plus seeded help requests in every state, 3 emergency events and audit logs.

## 7. Components — current status

| Component | Status |
|---|---|
| Backend | Complete: auth, registrations, verification, requests + matching/dispatch, emergency, voice sessions, audit, notifications. |
| Web portal | **Connected to the API** — Dashboard, Requests, RequestDetails, Verification load live data. Login = dev OTP or pasted JWT. (Emergencies/Seniors/Volunteers nav items still placeholders — no backend list endpoint.) |
| Mobile app | Auth (OTP + refresh + secure storage), voice assistant (LiveKit), and help-request creation wired. Registration **POST**, volunteer request list screens, and in-app SOS **not yet connected**. |
| Voice agent | Live conversation pipeline works end-to-end; publishes structured help requests to the app. |

## 8. Run everything (dev)

Order: database → backend → whichever client you're testing.

```bash
# 1. Database + backend  (http://localhost:3000, Postgres :5432)
cd backend && npm install
npm run db:start
npm run db:reset        # migrations
npm run db:seed:fresh   # wipe + reseed demo data
npm run dev

# 2. Police portal   (http://localhost:5173)
cd web && npm install && npm run dev

# 3. Mobile app (Flutter)  — see mobile/README.md
cd mobile && flutter pub get && flutter run          # emulator -> 10.0.2.2:3000
#   physical device / custom host:
#   flutter run --dart-define=API_BASE_URL=http://<host>:3000

# 4. Voice agent (separate machine/process; needs LiveKit + AI keys)
cd livekit-voice-agent && uv sync && uv run agent.py dev
```

| Service | Port / URL |
|---|---|
| Backend API | `http://localhost:3000` (`/health`) |
| Dev Postgres | `:5432` (PostgreSQL 18, role `postgres`) |
| Web portal (dev) | `http://localhost:5173` |
| LiveKit (cloud) | `wss://<project>.livekit.cloud` (set in backend `.env`) |

## 9. Key settings that connect the pieces

- **Web → API:** `VITE_API_URL` (default `http://localhost:3000/api`); token in
  `localStorage["sahayak_token"]` (see `web/src/api/client.ts`).
- **Mobile → API:** `--dart-define=API_BASE_URL` (defaults: Android emulator
  `10.0.2.2`, else `localhost`), see `mobile/lib/config/app_config.dart`.
- **Backend → Voice:** `LIVEKIT_URL/API_KEY/API_SECRET` from `backend/.env`;
  `POST /api/voice-sessions` mints per-room join tokens.
- **OTP in dev:** `OTP_DEV_CODE=123456` — every issued code is this value.

## 10. Where to look next

- [workflow.md](workflow.md) — the end-to-end workflows.
- `plans/api-plan.md` — API contract details.
- `plans/database-design.md`, `plans/architecture.md` — schema & modules.
- `plans/voice-integration.md` — LiveKit voice integration notes.
- `plans/web-portal-api-connection.md` — how the police portal was wired to the API.