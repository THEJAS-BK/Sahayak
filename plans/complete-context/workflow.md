# Sahayak — End-to-End Workflows

How the pieces come together, flow by flow. Entry-point files are called out so
you can trace each step in code. Status codes follow
`backend/src/modules/requests/state.ts`.

---

## 1. Sign-in (OTP)

Anyone (senior, volunteer, officer) signs in with email + OTP.

```
mobile/enter_email_screen.dart ── POST /api/auth/otp/request
mobile/otp_screen.dart        ── POST /api/auth/otp/verify
        └► { user, access_token, refresh_token }
           └► SessionService stores tokens in platform secure storage
web/pages/Login/index.tsx     ── same endpoints; token held in localStorage["sahayak_token"]
```

- In dev every code verifies with `OTP_DEV_CODE` (`123456`).
- On a 401 the mobile `ApiClient` transparently calls `/api/auth/refresh`, then
  retries the original request once.
- `splash_screen.dart` restores the stored session and routes by role.

---

## 2. Registration → police verification

A new senior or volunteer applies; the police approve before they're active.

```
mobile role_selection → senior/volunteer_registration_screen (form only — NOT
   yet wired to the backend; this is the main remaining mobile TODO)
backend: registration creates a PENDING user_verification + user row
web/pages/Verification/index.tsx ── GET /api/verifications        (pending queue)
web pages PATCH /api/verifications/:id ── approve | reject
backend: on approve → user becomes active + profile (senior/volunteer) created
mobile registration_submitted_screen: "awaiting verification" (dev simulate-button)
```

---

## 3. Help request lifecycle

The core loop — raised by a senior, fulfilled by a volunteer.

```
Senior raises request
   • voice: "Click to Speak" (flow 4)  or  app form   → POST /api/requests
       status = PENDING
   • optional photo, chosen in the review dialog
       → POST /api/requests/:id/photo   (multipart, only once :id is known)
Backend (help-request service):
   PENDING ──scheduler──► MATCHING ──> DISPATCHED ──> ACCEPTED ──> IN_PROGRESS ──> COMPLETED
                                                       └──(mobile PATCH :id/accept)
   timeouts / no volunteer ──► UNASSIGNED   (any pre-accept state ──► CANCELLED)
```

- Matching/dedup/retries live in `backend/src/modules/matching/matching.service.ts`;
  `MATCH_RADIUS_M`, `DISPATCH_TIMEOUT_S`, `MAX_DISPATCH_ATTEMPTS` in `.env`.
- Volunteers see candidates via `GET /api/requests/nearby` and accept with
  `PATCH /api/requests/:id/accept` (mobile volunteer list UI is a TODO).
- Senior-facing volunteer reveal only from ACCEPTED onward
  (`ASSIGNMENT_STATUSES`).
- Every transition is appended to `audit_logs` and surfaces on the portal.
- **The photo is a separate, optional call made after the request exists**, not
  part of the create body — the request id is not known until `POST /api/requests`
  has answered. It may be sent for any request the senior still owns that is
  neither cancelled nor completed, so it can land before or after dispatch. If
  it fails the request is unaffected; every payload reports `has_photo` so a
  photo-less request is distinguishable from a failed upload.

---

## 4. Voice assistant (LiveKit)

```
mobile/senior_home_screen.dart "Click to Speak"
   └► mobile/agent_conversation_screen.dart
        └► POST /api/voice-sessions ──► { url, token, room }   (backend voice.service
              mints a per-room LiveKit AccessToken)
   └► mobile/widgets/voice_call.dart connects to the LiveKit room (audio)

livekit-voice-agent/agent.py joins the same room:
   STT(AssemblyAI) → LLM(GPT-4.1-mini) → TTS(Cartesia), VAD(Silero)
   └► when a need is captured, function_tool record_help_request publishes a
        v1 envelope {v, type, request_id, request} (category, description,
        priority, details) on data topic "sahayak_request"
   └► app parses it (voice_payload.dart), injects lat/lng + source:"voice_agent",
        and forwards to POST /api/requests (dedupe by request_id)
   └► agent's reply confirms: "…a volunteer will be in touch shortly."
```

Categories: `grocery_assistance`, `medical_assistance`, `transport_assistance`,
`other`; priority `normal` | `urgent`. Transcript bubbles stream live in
`agent_conversation_screen.dart`.

---

## 5. Emergency / SOS

```
mobile (in-app SOS: NOT wired yet — TODO) or operator action
   └► POST /api/emergency-events                    → status LOGGED, auto–escalated to 112
web portal: GET /api/police/emergency-events         (dashboard + list; placeholder page)
   └► PATCH /api/police/emergency-events/:id         → status REVIEWED (audit logged)
```

---

## 6. Police portal (web)

```
/login ── dev OTP (ashok.kini@example.com / 123456) or pasted JWT
Dashboard        → stats derived from GET /api/police/requests + recent GET /api/audit-logs
Requests         → GET /api/police/requests, server-side status/priority filters
RequestDetails   → GET /api/requests/:id (+ timeline from timestamps)
Verification     → GET /api/verifications + approve/reject
```

Emails/roles of request actors (senior + volunteer) are shown to police (full
PII), whereas the senior/volunteer app surfaces only what Q-08 allows.

---

## Cross-cutting

- **One backend, three clients** — all business rules live in the backend;
  clients render `{ success, data, error }` envelopes.
- **Audit trail** — approvals, verification outcomes and request transitions are
  all append-only `audit_logs` rows; the portal dashboard reads them as its
  activity feed.
- **Status matrix** — see complete-context README §7 for what's wired vs TODO;
  the mobile flow (4) is fully live end-to-end with a working LiveKit project.