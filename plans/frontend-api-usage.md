# Frontend API Usage — Page → Endpoint → Payload

> Status: **As-built reference.** Derived from `plans/api-plan.md` and the
> `client-design/` docs, then cross-checked against the code in `mobile/` and
> `web/`. Where the plans and the code disagree, the code wins and the
> difference is recorded in §Gaps.

Purpose: one place a frontend dev can look to answer "which endpoint does this
screen call, and what does it send?".

## Conventions (both clients)

- Base path `/api`. Success `{ "success": true, "data": { … } }`, error
  `{ "success": false, "error": { "code": "SNAKE_CASE", "message": "…" } }`.
- Auth: `Authorization: Bearer <access_token>`. Police accounts get a single 8 h
  access token and **no** refresh token.
- Mobile — `mobile/lib/services/api_client.dart`: unwraps the envelope, 10 s
  timeout on every call, and retries once after `POST /api/auth/refresh` on 401.
- Web — `web/src/api/client.ts`: token in `localStorage["sahayak_token"]`, 401
  clears the session and redirects to `/login` (no refresh retry).

## Mobile app (Flutter, 16 screens)

| Screen | Endpoint | Accepts / reads |
|---|---|---|
| Splash | `A-03 POST /auth/refresh` | `{refresh_token}` → new pair, routes by `user.role` |
| Create / Login | — | local only |
| Enter Email | `A-01 POST /auth/otp/request` | `{email}` → `{sent:true}` |
| OTP | `A-02 POST /auth/otp/verify` | `{email, code}` → `{access_token, refresh_token?, user}` |
| Role Select | — | local only |
| Senior Registration | `R-01 POST /registrations/senior` | `{full_name, phone_number, aadhaar_number, home_latitude, home_longitude, preferred_language}` → `{verification_id, status}` |
| Volunteer Registration | `R-02 POST /registrations/volunteer` | `{full_name, phone_number, aadhaar_number, skills[], base_latitude, base_longitude, organization?, club_id?}` |
| Registration Submitted | `R-03 GET /registrations/me` | polls `{verification: {verification_id, role, status, review_reason, reviewed_at}}` |
| Senior Home | `Q-02 GET /requests/me`, `E-01 POST /emergency-events` | SOS body `{trigger_type:"keyword_repetition", source:"flutter_app", latitude?, longitude?}` |
| My Requests | `Q-02 GET /requests/me` | `{requests:[…]}` |
| Senior Request Detail | `Q-03 GET /requests/:id`, `Q-08 GET /requests/:id/volunteer`, `Q-07 PATCH /requests/:id/cancel` | Q-08 → `{volunteer:{full_name, phone_number, organization, skills[]}}` |
| Agent Conversation | `POST /api/voice-sessions`, `A-05 GET /me`, `Q-01 POST /requests` | voice-sessions → `{url, token, room}`. Q-01 body from `services/voice_payload.dart`: `{category, description, details?, latitude, longitude, priority, source:"voice_agent"}`; lat/lng injected from `GET /api/me` home coords |
| Volunteer Home | `A-05 GET /me`, `Q-04 GET /requests/nearby?lat&lng&radius_m`, `Q-02 GET /requests/me`, `L-02 PATCH /volunteers/me/availability`, `Q-05 PATCH /requests/:id/accept`, `Q-03`, `Q-05b PATCH /requests/:id/decline` | availability `{is_available}`; decline `{reason? ≤280}`; nearby default radius 5000 m |
| Volunteer Request Detail | — | no direct calls; callbacks from Volunteer Home |
| Request Accepted | `Q-06 PATCH /requests/:id/status`, `Q-03` | `{status:"IN_PROGRESS"\|"COMPLETED"}` |

## Web portal (police console, 5 live routes)

| Route | Endpoint | Accepts / reads |
|---|---|---|
| `/login` | `A-01`, `A-02` (also manual token paste) | `{email}`, `{email, code}` |
| `/` Dashboard | `P-01 GET /police/requests?limit=200`, `P-02 GET /audit-logs?limit=10` | stat cards computed client-side |
| `/requests` | `P-01` (`status`, `priority` filters) + `P-04 GET /police/volunteers`, `P-05 PATCH /police/requests/:id/assign` | assign body `{volunteer_id}`; volunteers query `lat?, lng?, search?` |
| `/requests/:requestId` | `Q-03 GET /requests/:id`, `P-04`, `P-05` | timeline rebuilt from request timestamps |
| `/verification` | `V-01 GET /verifications`, `V-03 PATCH /verifications/:id` | `{status:"APPROVED"\|"REJECTED"}` |
| `/emergencies` | `E-02 GET /police/emergency-events`, `E-03 PATCH /police/emergency-events/:id` | filters `status`, `senior_id`, `from`, `to`, `limit`, `cursor`; review body `{status:"REVIEWED"}` |
| `/seniors`, `/seniors/:seniorId` | `P-06 GET /police/seniors`, `P-07 GET /police/seniors/:id` | filters `search`, `status`, `limit`, `cursor`. Aadhaar is never returned |
| `/volunteers`, `/volunteers/:volunteerId` | `P-04 GET /police/volunteers`, `P-05b GET /police/volunteers/:id` | filters `lat`, `lng`, `available`, `search`, `limit` |
| `/audit-logs` | `P-02 GET /audit-logs` | filters `entity_type`, `entity_id`, `actor_id` (`"null"` = system), `action`, `from`, `to`, `limit`, `cursor` |

## Gaps

Recorded so nobody re-derives them from the plans.

1. **Monitoring and Map are the only unbuilt web pages.** Everything else —
   Dashboard, Requests, Request Detail, Verification, Emergencies, Seniors,
   Volunteers, Volunteer Detail, Audit Logs — has a real page behind a real
   endpoint. Monitoring has no defined purpose, and Map needs a mapping library
   (it needs no new route: `GET /police/requests` and
   `GET /police/emergency-events` already return coordinates). See
   `web-portal-gaps.md`.

   Corrected 2026-09-27: this previously listed Emergency Events, Volunteers and
   Audit Logs as unbuilt *and* unbacked. Their endpoints already existed; the
   Senior Profile and Volunteer Detail routes were added in this pass.
2. **A-04 `/auth/logout` is called by nobody.** Both clients only clear local
   storage (`mobile/lib/screens/senior_home_screen.dart`,
   `web/src/components/layout/Sidebar.tsx`), so refresh tokens stay valid
   server-side until they expire.
3. **A-06 `PATCH /me/fcm-token` is called by nobody**, so no device push token
   reaches the backend. R-01/R-02 accept an optional `fcm_token` but
   `mobile/lib/services/registration_service.dart` never sends one.
4. **Senior registration drops `emergency_contact`** — the API accepts it, the
   app does not send it.
5. **Reject-with-reason is UI-only on web.** The design calls for a reason dialog
   and the API accepts `reason?`, but `reviewVerification` in
   `web/src/api/client.ts` sends only `status`.
6. **No `/api/registrations/*` or `/api/me/fcm-token` on web** — by design, it is
   a police console.

## Drift against the plan docs

- `client-design/mobile-app.md` §12 lists 11 pages; the app now has 16.
- `web-portal-api-connection.md` lists 7 endpoints; the code now uses 9 (P-04 and
  P-05 were added later — see `api-plan.md`).
- `client-design/web-portal.md` §18 route structure is still aspirational; the
  live routes are the five in the table above.
