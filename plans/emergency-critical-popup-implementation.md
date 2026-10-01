# Critical Emergency Popup — Implementation Plan (Read-Only in this file)
This document captures the design chosen from the four forks:
1. Agent auth: Shared agent secret + dispatch metadata (x-agent-key header)
2. Critical detection: raise_emergency tool + keyword guard (deterministic)
3. Volunteer popup: Flutter volunteer home screen
4. Police transport: In-process SSE for police console


## A. Backend Changes

### 1. Config (`backend/src/config/index.ts`)
Add `AGENT_SERVICE_KEY` environment variable. Validate as a string (min 32 chars recommended). Expose `config.agentServiceKey`.
- Import/validation: add `AGENT_SERVICE_KEY: z.string().min(32).optional()` or required in non-dev? Keep consistent with existing style (other secrets optional until used). Expose `agentServiceKey: typeof env.AGENT_SERVICE_KEY === 'string' ? env.AGENT_SERVICE_KEY : ''`.

### 2. Auth Middleware (`backend/src/middleware/auth.ts`)
Add `authenticateAgent` middleware:
- Read header `x-agent-key` (case-insensitive). If missing → 401 `UNAUTHENTICATED`.
- Compare against `config.agentServiceKey` using timing-safe comparison (buffer length equal). If mismatch → 401.
- Attaches `req.agent = { authenticated: true }` (typed via Express Request augmentation if desired).
- Does not set `req.user`. Agent calls identify the senior via `senior_id` in the request body (or from metadata).

### 3. Emergency Service (`backend/src/modules/emergency/emergency.service.ts`)
- Extend `CreateEmergencyInput` to include optional `senior_id?: string | null` (agent path may pass explicitly). Keep existing seniorId parameter semantics.
- No schema change to DB. Existing `emergency_events` is sufficient.
- Ensure createEmergency accepts either: (a) called with seniorId from `req.user.id` (app path), or (b) called with seniorId from input/body (agent path). Avoid breaking existing callers.

### 4. Emergency Routes (`backend/src/modules/emergency/emergency.routes.ts`)
Add new agent route: `POST /api/emergency-events/agent`
- Protected by `authenticateAgent` (not `requireRole('senior')`).
- Zod schema: same fields as createSchema but require `senior_id: z.uuid()` (and allow `source: 'voice_agent'`).
- Calls `createEmergency(db, parsed.data.senior_id, parsed.data)` (or adapted). 
- After transaction commit, emit SSE event (see 5) and call `notifyPolice` (fire-and-forget).

Keep existing `POST /` unchanged (senior JWT path).

### 5. In-Process SSE for Police Console
Create `backend/src/modules/emergency/events.ts`:
- Simple `EventEmitter` singleton: `emergencyEvents` exporting `emit(event: 'emergency_logged', payload: {...})` and `on/off`.
- Payload: full event shape (or minimal id/status/created_at/senior/trigger_type/lat/lng/help_request_id).

In route after successful commit of emergency creation, call `emergencyEvents.emit('emergency_logged', eventPayload)`.

Add police SSE endpoint in `emergency.routes.ts` (or separate router mounted under police):
- `GET /api/police/emergency-events/stream`
- Auth: `authenticate` + `requireRole('police')` + `requireActive`. But EventSource cannot set Authorization header. Accept token via query param `?token=<access_token>` OR accept session via cookie? Current web uses Bearer in fetch; for SSE, read `req.query.token` as fallback and, if present, validate it via the same JWT verification logic (or temporarily set `req.headers.authorization = 'Bearer ' + token` before `authenticate`). Keep minimal changes: extract token from query if header missing, pass through to `authenticate`.
- Response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no` (if behind proxy).
- Send initial comment/`event: connected` with retry. 
- Heartbeat: `event: ping` every 15s (prevents proxies from closing idle connections). 
- On `emergency_logged`, serialize full event as JSON and send `event: emergency_logged\ndata: <json>\n\n`.
- Clean up listeners on client disconnect (`req.on('close', ...)`).
- Optional: replay last N LOGGED events on connect (not strictly necessary; police console also polls).

Constraints: single-process only (matches cron/jobs design). No external pub/sub.

## B. LiveKit Voice Agent (Python)

### 1. Environment (`livekit-voice-agent/.env.example`)
Add:
```
BACKEND_URL=http://localhost:3000
AGENT_SERVICE_KEY=replace-with-32+char-shared-secret
```
(Keep `LIVEKIT_*` and `LIVEKIT_AGENT_NAME` as-is.)

### 2. Dependencies (`livekit-voice-agent/pyproject.toml`)
Add `httpx>=0.27.0,<0.28.0` (async). No other changes.

### 3. Agent (`livekit-voice-agent/agent.py`)
Key additions:
- Load `BACKEND_URL`, `AGENT_SERVICE_KEY` from env (fail gracefully with warning if missing, but log).
- Helper to extract `userId` from dispatch metadata: `ctx.job.metadata` is a JSON string from `RoomAgentDispatch.metadata = {"userId": ...}` (backend sets it). Parse and cache.
- HTTP client (httpx.AsyncClient) with base URL, timeout, and `x-agent-key` header.
- `raise_emergency` function_tool:
  - params: `trigger_type: Literal["semantic_llm","acoustic_distress"]` (agent path; `'keyword_repetition'` reserved for app/manual), `detail: str`, `latitude: float | None = None`, `longitude: float | None = None`
  - calls `POST /api/emergency-events/agent` with body `{ senior_id, trigger_type, source: "voice_agent", detail: {...} or string serialized, latitude, longitude }`
  - returns concise string with `event_id` if successful.
- Deterministic keyword guard (port from `voice-agent/src/distress/keyword.ts` critical cases):
  - Check for fall/breathe/chest/pain keywords (Kannada + English) with confidence >= 0.85. Also detect repeated distress words (>=2 consecutive identical distress tokens) → treat as high severity.
  - On high severity detection (and not already logged this turn/session), call `raise_emergency` with appropriate `trigger_type` (`keyword_repetition`-like semantics → prefer `acoustic_distress` or `keyword_repetition`? Use `acoustic_distress` for voice-triggered acoustic/keyword pattern; or `keyword_repetition` if matching exact repetition). Map to allowed enum values for agent route: `semantic_llm` or `acoustic_distress`. Choose `acoustic_distress` for deterministic keyword/respiratory/chest pain triggers.
  - Debounce: prevent duplicate emergency calls within N seconds (e.g. 10s) per session.
- Wire guard into turn processing (e.g. `on_user_turn_completed` or inspect final STT transcripts). Keep it non-blocking (try/except around HTTP).
- Tool result should be concise (per system rules). Never log secrets.

Notes: The agent cannot receive the senior's JWT. The dispatch metadata is the only identity passed from backend token minting (`voice.service.ts:47` sets metadata on RoomAgentDispatch). Read via `ctx.job.metadata` (string) and JSON-decode.

## C. Web Portal (Police Console)

### 1. API Client (`web/src/api/client.ts`)
Add `subscribeEmergencyEvents`:
- Returns an `EventSource` instance. Build URL: `${API_BASE.replace('/api','')}/api/police/emergency-events/stream?token=${encodeURIComponent(getToken() ?? '')}` (handle base differences). Or construct relative to same origin.
- Accepts callbacks: `onEmergencyLogged(event: EmergencyEvent)`, `onPing()`, `onError(err)`, `onOpen()`.
- Attaches listeners to `es.addEventListener('emergency_logged', ...)`, `es.addEventListener('ping', ...)`, `es.onerror`, `es.onopen`.

### 2. Emergency Alerts Provider (`web/src/lib/useEmergencyAlerts.tsx`)
New context:
- State: `activeCritical: EmergencyEvent | null`, `unseenIds: Set<string>`, `connected: boolean`, `lastEventAt: Date | null`.
- On SSE `emergency_logged`: parse payload. If `status === 'LOGGED'`, treat as critical. Track unseen by `id`. Show popup if not already showing (or replace with newest? Show newest LOGGED; if one already shown, can update or queue — show the most recent critical).
- Polling fallback: also call `fetchEmergencyEvents({ status: 'LOGGED', limit: 10 })` every 10s. Compare with unseenIds to detect new ones even if SSE drops. Reconnect SSE on error/backoff.
- `acknowledge(eventId)` clears popup (marks as seen for this session). 
- Mount only under police-authenticated area.

### 3. Critical Popup Component (`web/src/components/EmergencyCriticalAlert.tsx`)
Non-dismissible modal/dialog:
- No Escape key close, no backdrop click close, no X button. 
- Props: `event: EmergencyEvent`, `onView()` (navigate to `/emergencies`), `onAcknowledge()` (optional, but required to clear; acknowledge means officer saw it — does not call review API unless desired; viewing is enough; but to dismiss popup, call acknowledge).
- UI: solid red background/tint (use `error` tone), large "CRITICAL EMERGENCY — ATTENTION REQUIRED" heading, senior name/email/phone, trigger type (`triggerLabel`), time (`elapsedLabel`/`formatDateTime`), location if lat/lng present, link to linked request if exists.
- Primary action: "View in Emergencies" (navigates). Secondary optional: "Acknowledge" (dismisses popup without navigating). Both require user action.
- Accessibility: `role="alert"`, `aria-live="assertive"`, `aria-modal="true"`, focus trap enabled but cannot be dismissed via Escape.

Use existing `Modal` primitives? Extend or create new `AlertModal` with `dismissible=false`. Minimal change: copy Modal behavior but remove Escape/backdrop-close and close button.

### 4. Mount Point (`web/src/App.tsx`)
Inside `RequireAuth` (police-only), wrap children with `EmergencyAlertProvider` alongside/after `OverviewProvider`:
```tsx
<OverviewProvider>
  <EmergencyAlertProvider>
    <Suspense fallback={null}><Layout/></Suspense>
  </EmergencyAlertProvider>
</OverviewProvider>
```
Render `<EmergencyCriticalAlert .../>` inside the provider (at top level of the authenticated shell).

## D. Mobile (Flutter Volunteer)

### 1. Volunteer Emergency Endpoint (Backend)
Add volunteer-scoped list for active emergencies (LOGGED). Options:
- Extend `listEmergencyEvents` to allow role-based filtering? Or add `GET /api/emergency-events/active` protected by `requireRole('volunteer')` + `requireActive`. Returns `{ events: [...] }` (newest first), filtered to `status='LOGGED'`. No pagination required initially (limit e.g. 20).
Implementation: in `emergency.service.ts` add `listActiveLogged(db)`; in routes add volunteer router or mount `emergencyRoutesVolunteer.get('/active', ...)`.

Also ensure volunteer cannot call police endpoints.

### 2. Emergency Service (`mobile/lib/services/emergency_service.dart`)
Add:
```dart
Future<List<EmergencyEvent>> listActiveLogged() async {
  final data = await ApiClient.instance.get('/api/emergency-events/active');
  // parse list
}
```
Define `EmergencyEvent` model (or reuse map). Keep minimal fields needed for popup.

### 3. Volunteer Home Screen (`mobile/lib/screens/volunteer_home_screen.dart`)
- Track `_seenEmergencyIds = <String>{}` and `_activeCritical: EmergencyEvent?`.
- In `_load` (or new `_checkEmergencies`), call `EmergencyService.instance.listActiveLogged()` (or inline). Run on initial load and also as part of polling (every 15s). 
- On new LOGGED events (not seen), show non-dismissible red critical alert (full-screen dialog or modal bottom sheet that cannot be dismissed). 
- UI: red header, "CRITICAL EMERGENCY", trigger type, senior info (if present), created_at, location (button to open maps if lat/lng), actions: "Acknowledge" (dismiss, mark seen) and/or "View" (navigate to relevant screen). Non-dismissible: no back button override allows dismiss unless action taken; use `WillPopScope`/`PopScope` to block back.
- Block interaction until acknowledged/viewed. Use error color from theme.

## E. Tests, Migrations, Truncation

- No new DB table. No migration.
- If any new module files export singletons, no state leakage in tests. 
- Add `emergency_events` already truncated (present). If new in-mem events store added, not needed.
- Backend tests: extend `tests/emergency.test.ts` to cover agent route with `x-agent-key` (success + invalid key + missing senior_id), SSE endpoint auth (token via query), and event emission on create.
- Typecheck: `cd backend && npm run typecheck`, `cd web && npm run typecheck && npm run lint`. Python: `cd livekit-voice-agent && python -m py_compile agent.py` (minimal).

## Notes
- Agent auth uses timing-safe comparison; never log the shared key.
- SSE token in query is a pragmatic choice given EventSource header limitation; acceptable for internal police console over HTTPS.
- Keyword guard uses confidence >= 0.85 and repeated distress (>=2). Map to `acoustic_distress` for deterministic triggers; `semantic_llm` for LLM-inferred.
- Popups are intentionally non-dismissible to force attention.
- Single-process SSE matches existing in-process job design.
