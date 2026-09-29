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
- Mobile — `mobile/lib/services/api_client.dart`: unwraps the envelope and
  retries once after `POST /api/auth/refresh` on 401. Two timeouts: 10 s for
  ordinary calls, 90 s for the Q-09 photo upload, which streams through the
  backend into Cloudinary and will not finish inside 10 s on a slow connection.
- Q-09 is the one call that is not JSON: `postMultipart` builds a
  `multipart/form-data` body with a `photo` part and decodes the same envelope.
  Because a `MultipartRequest` cannot be replayed once sent, the body is rebuilt
  from the file on each attempt rather than reused.
- Web — `web/src/api/client.ts`: token in `localStorage["sahayak_token"]`, 401
  clears the session and redirects to `/login` (no refresh retry).

## Mobile app (Flutter, 17 screens)

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
| My Requests | `Q-02 GET /requests/me` | `{requests:[…]}`, each with `image_url` + `has_photo`; renders a thumbnail when `has_photo` |
| Senior Request Detail | `Q-03 GET /requests/:id`, `Q-08 GET /requests/:id/volunteer`, `Q-07 PATCH /requests/:id/cancel` | Q-08 → `{volunteer:{full_name, phone_number, organization, skills[]}}`. `image_url` + `has_photo`; tap opens a full-screen viewer |
| Agent Conversation | `POST /api/voice-sessions`, `A-05 GET /me`, `Q-01 POST /requests`, `Q-09 POST /requests/:id/photo` | voice-sessions → `{url, token, room}`. Q-01 body from `services/voice_payload.dart`: `{category, description, details?, latitude, longitude, priority, source:"voice_agent"}`; lat/lng injected from `GET /api/me` home coords. Q-09 is a **second call, after Q-01 returns a `request_id`**, and only when the senior picked a photo in the review dialog. A Q-09 failure is reported in the sent-message text and never rolls the request back — resending would trip BR-13 |
| Volunteer Home | `A-05 GET /me`, `Q-04 GET /requests/nearby?lat&lng&radius_m`, `Q-02 GET /requests/me`, `L-02 PATCH /volunteers/me/availability`, `Q-05 PATCH /requests/:id/accept`, `Q-03`, `Q-05b PATCH /requests/:id/decline` | availability `{is_available}`; decline `{reason? ≤280}`; nearby default radius 5000 m |
| Volunteer Request Detail | — | no direct calls; callbacks from Volunteer Home |
| Request Accepted | `Q-06 PATCH /requests/:id/status`, `Q-03` | `{status:"IN_PROGRESS"\|"COMPLETED"}` |

## Web portal (police console, 13 live routes)

| Route | Endpoint | Accepts / reads |
|---|---|---|
| `/login` | `A-01`, `A-02` (also manual token paste) | `{email}`, `{email, code}`. The dev OTP is only surfaced in a dev build |
| `/` Dashboard | `P-08 GET /police/overview`, `P-02 GET /audit-logs?limit=10` | stat cards from the server-side aggregate; the client no longer counts a capped page |
| `/requests` | `P-01 GET /police/requests` (`status`, `priority`, `from`, `to`, `limit`, `cursor`) + `P-04 GET /police/volunteers`, `P-05 PATCH /police/requests/:id/assign` | keyset pagination; assign body `{volunteer_id}`; volunteers query `lat?, lng?, search?`. Rows carry `image_url` + `has_photo`; a 48 px thumbnail is rendered when present |
| `/requests/:requestId` | `Q-03 GET /requests/:id`, `P-04`, `P-05` | timeline rebuilt from request timestamps. Photo card renders `image_url` full size, linking to the original |
| `/monitoring` | `P-01 GET /police/requests` (`status`, `priority`, `from`, `to`) | same endpoint as `/requests`, re-presented as an operational board; 15 s poll |
| `/map` | `P-01 GET /police/requests`, `E-02 GET /police/emergency-events` | no new route needed — both already return coordinates. 30 s poll |
| `/verification` | `V-01 GET /verifications` (`status`, `limit`, `cursor`), `V-02 GET /verifications/:id`, `V-03 PATCH /verifications/:id` | review body `{status, reason?}` |
| `/emergencies` | `E-02 GET /police/emergency-events`, `E-03 PATCH /police/emergency-events/:id` | filters `status`, `senior_id`, `from`, `to`, `limit`, `cursor`; review body `{status:"REVIEWED"}` |
| `/seniors`, `/seniors/:seniorId` | `P-06 GET /police/seniors`, `P-07 GET /police/seniors/:id` | filters `search`, `status`, `limit`, `cursor`. Aadhaar is never returned |
| `/volunteers`, `/volunteers/:volunteerId` | `P-04 GET /police/volunteers`, `P-05b GET /police/volunteers/:id` | filters `lat`, `lng`, `available`, `search`, `limit` |
| `/audit-logs` | `P-02 GET /audit-logs` | filters `entity_type`, `entity_id`, `actor_id` (`"null"` = system), `action`, `from`, `to`, `limit`, `cursor` |

Anything outside this list renders a 404. The shell is guarded by
`RequireAuth`, which also rejects a non-police session rather than letting a
senior or volunteer land in a frame of pages that will all 403.

## Gaps

Recorded so nobody re-derives them from the plans.

1. **Monitoring and Map are built.** Both were unbuilt as of 2026-09-27 and now
   have real pages. Neither needed a new endpoint: `GET /police/requests` and
   `GET /police/emergency-events` already return coordinates, and Monitoring is
   a re-presentation of `P-01`. Map plots only requests and emergencies — the
   `home_latitude` / `base_latitude` on seniors and volunteers are
   registration-time estimates, and pinning an officer's map to them would look
   like live tracking that does not exist. Unmapped rows are counted on screen
   instead of silently dropped.

   Corrected 2026-09-27: this previously listed Monitoring and Map as unbuilt
   *and* unbacked. Monitoring has no defined purpose even now — it is a board
   over `P-01`, and if the design settles on one, it should be a different
   endpoint.
2. **`A-04 POST /auth/logout` is now called on web.** `logout()` in
   `web/src/api/client.ts` posts it and clears local state. Police accounts have
   no refresh token, so the call is skipped for them and the local clear still
   happens. **Mobile still does not call it** — it only clears local storage, so
   a mobile refresh token stays valid server-side until it expires.
3. **A-06 `PATCH /me/fcm-token` is called by nobody**, so no device push token
   reaches the backend. R-01/R-02 accept an optional `fcm_token` but
   `mobile/lib/services/registration_service.dart` never sends one.
4. **Senior registration drops `emergency_contact`** — the API accepts it, the
   app does not send it.
5. **`P-08 GET /police/overview` is new in this pass.** The Dashboard used to
   derive its tiles from one capped `P-01` page, so any total above the page
   size was wrong. The route is police-only, takes an optional `from`/`to` bound
   for the "completed today" tile, and falls back to the server's own day if only
   one bound is supplied.
6. **No `/api/registrations/*` or `/api/me/fcm-token` on web** — by design, it is
   a police console.
7. **Request photos are a two-call sequence, and the ordering is load-bearing.**
   The senior picks a photo in the review dialog, `Q-01` creates the request,
   and only then does the client `POST /api/requests/:id/photo` with the
   `request_id` from the Q-01 response. The photo cannot ride along in the Q-01
   body, because the id does not exist until Q-01 has answered.

   A failed upload is reported in the sent-message text and the request is left
   alone. Resending would trip BR-13 (one open request per senior) and tell a
   senior who has already been dispatched to that they have a duplicate.

   Clients must not try to read the image back: there is no image GET endpoint.
   `image_url` is a public Cloudinary URL and `has_photo` says whether to render
   it. Anything holding a request payload can therefore show the photo without a
   further call, and the URL is shareable by anyone who has it — a senior's
   address and belongings are visible in it, so it should not be treated as
   access-controlled.

8. **The client must name the image type correctly, and the file name is no
   guide.** `POST /:id/photo` checks the MIME type on the part, and
   `image_picker` copies the picked image into its own cache where the copy is
   often named with no usable extension — and on Android it returns an `XFile`
   with no `mimeType` at all. Deciding from the file name rejected valid PNGs
   before they left the phone. `mobile/lib/services/image_type.dart` now reads
   the file signature and falls back to the name only when the bytes cannot be
   read.

   HEIC is reported as unsupported rather than mislabelled as JPEG. With
   `imageQuality` set the picker re-encodes, so it is rare; supporting it
   properly means adding an on-device transcoder.

## Drift against the plan docs

- `client-design/mobile-app.md` §12 lists 11 pages; the app now has 17.
- `client-design/web-portal.md` §18 route structure is still aspirational; the
  live routes are the thirteen in the table above.
