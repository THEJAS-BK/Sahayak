# Web Portal — Connect to Backend API

Connects the police admin portal (`web/`) to the live backend API so pages load
real data from the database instead of the static mocks in `src/data/mock.ts`.

**Scope:** Dashboard, Requests, RequestDetails, Verification. Dev-token auth.
**No backend changes.**

## Prerequisites (environment, not code)

- Dev Postgres on `:5432` must be running, with the police account bootstrapped:

  ```bash
  cd backend
  npm run db:migrate
  npm run db:seed:fresh
  ```

- Backend dev server on `http://localhost:3000` (CORS is already open).
- Police identity used for dev: the single account created by `db:seed:fresh`
  from `POLICE_BOOTSTRAP_EMAIL` (dev value `police@gmail.com`, role `police`);
  dev OTP code is fixed at `123456` (see `OTP_DEV_CODE` in `backend/.env`).
  There are no seeded personas — approve real registrations from the app here.

## Backend endpoints used

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/otp/request` | Request dev OTP (convenience on login page) |
| `POST /api/auth/otp/verify` | Verify code, receive `access_token` |
| `GET /api/police/requests` | List help requests w/ senior + volunteer |
| `GET /api/requests/:id` | Request detail (police role allowed) |
| `GET /api/verifications` | Verification queue |
| `PATCH /api/verifications/:id` | Approve / reject a verification |
| `GET /api/audit-logs` | Recent activity feed (dashboard) |

All of the above require `Authorization: Bearer <token>` for a `police` role.

## Changes

### New files

- `web/src/api/client.ts`
  - Base URL: `import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'`.
  - Reads access token from `localStorage["sahayak_token"]`.
  - Unwraps the `{ success: true, data }` envelope; throws `ApiError`.
  - On HTTP 401: clears token and redirects to `/login`.
- `web/src/api/types.ts`
  - Interfaces mirroring API payloads (requests list item, verification item,
    audit-log item) plus normalizers for API casing:
    - request `priority` `urgent/normal` → `URGENT/NORMAL`
    - verification `role` `senior/volunteer` → display labels
- `web/src/pages/Login/index.tsx` (replaces `.gitkeep`)
  - Dev-token page: paste access token (+ optional refresh token) and Save.
  - Convenience "Request dev token" button: `POST /auth/otp/request` →
    `POST /auth/otp/verify` (email typed in by the officer, code `123456`)
    and stores the returned `access_token`.

### Modified files

- `web/src/App.tsx`
  - Add `/login` route outside the guard.
  - Wrap the four app routes in a `RequireAuth` guard that redirects to
    `/login` when no token is present.
- `web/src/pages/Dashboard/index.tsx`
  - Fetch `GET /api/police/requests?limit=200` + `GET /api/audit-logs?limit=10`.
  - Compute the four stat cards client-side:
    - Open requests (PENDING/MATCHING/DISPATCHED/ACCEPTED/IN_PROGRESS)
    - Active operations (DISPATCHED/ACCEPTED/IN_PROGRESS)
    - Completed today (`COMPLETED` with `completed_at` today)
    - Urgent requests (`priority === urgent`)
  - Latest open requests: five newest open rows.
  - Recent activity: map audit logs (action + entity + timestamp).
  - Loading / error states.
- `web/src/pages/Requests/index.tsx`
  - Fetch `GET /api/police/requests`, passing `status`/`priority` filters.
  - Keep client-side name search. Normalize casing via `types.ts`.
- `web/src/pages/RequestDetails/index.tsx`
  - Fetch `GET /api/requests/:id`.
  - Rebuild timeline from request timestamps (`created_at` → PENDING,
    `dispatched_at` → DISPATCHED, `accepted_at` → ACCEPTED,
    `completed_at` → COMPLETED, `cancelled_at` → CANCELLED).
- `web/src/pages/Verification/index.tsx`
  - Fetch `GET /api/verifications`.
  - Approve/Reject via `PATCH /api/verifications/:id` with `{ status }`;
    update the row in place on success.
- `web/src/components/layout/Sidebar.tsx`
  - Wire Logout to clear token → `/login`.
- `web/src/components/layout/Header.tsx`
  - Show the logged-in officer email.

## Out of scope

- Backend (`backend/`) — no changes.
- Emergencies, Seniors, Volunteers pages (no backend list endpoints / user
  chose to keep only the existing four pages connected).

## Verification

```bash
cd web
npm run lint
npm run build      # tsc -b type-check + production build
```

Manual smoke test:

1. Start + seed the DB (see prerequisites).
2. Open `http://localhost:5173`, sign in at `/login` (dev token flow).
3. Confirm Dashboard/Requests/RequestDetails/Verification render live data.