# Voice Integration — End-to-End LiveKit Voice

Goal: senior taps a mic button in the Flutter app → live voice conversation with the LiveKit agent.

## Scope

1. **Backend** — `POST /api/voice-sessions` issues a short-TTL LiveKit join token to an authenticated user.
2. **Voice agent** — run in worker mode (`uv run agent.py dev`) using automatic dispatch; no pipeline changes.
3. **Flutter** — real email+OTP login (to obtain a JWT), then a mic/call button that connects to LiveKit.

Repo facts that shaped this design:

- The voice agent lives in `livekit-voice-agent/` (not `voice-agent/`).
- Backend already depends on `livekit-server-sdk@^2.19.1`; `backend/.env` already has `LIVEKIT_*` vars but `src/config/index.ts` does not parse them and `.env.example` omits them.
- `livekit-voice-agent/agent.py` already exports an `AgentServer` via `agents.cli.run_app(server)`. The CLI exposes `console`, `dev`, and `start` subcommands. Worker mode = `uv run agent.py dev`; the STT/LLM/TTS/VAD pipeline is untouched.
- The Flutter app had no networking, no auth, no base-URL config — a minimal API client + session service is required before voice wiring.

## Decision highlights

- Voice sessions are open to any authenticated role (`authenticate` only), per requirement.
- Endpoint is mounted under `/api`, so the real path is `POST /api/voice-sessions` (consistent with all other routes). Response uses the standard envelope: `{ success: true, data: { url, token, room } }`.
- `LIVEKIT_*` env vars are optional at boot; the endpoint returns `errors.server('Voice is not configured')` if any are missing at runtime.
- Mic button goes on `AgentConversationScreen` ("Talk to Sahayak").
- Login: `POST /auth/otp/request` + `POST /auth/otp/verify`, tokens persisted in `flutter_secure_storage`, splash does a `POST /auth/refresh` session restore, logout calls `POST /auth/logout`.
- All mobile platform checks are guarded by `kIsWeb`; microphone permission via `permission_handler` (Android `RECORD_AUDIO`).

## Part 1 — Backend

Files:

- `backend/src/config/index.ts` — add `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (optional strings), `LIVEKIT_TOKEN_TTL_SECONDS` (int, default 300); export `config.livekit`.
- `backend/.env.example` — document the four vars.
- `backend/src/modules/voice/voice.service.ts` — `createVoiceSession(userId): { url, token, room }`; room `voice_<userId>_<timestamp>`; grant `roomJoin + room + canPublish + canSubscribe + canPublishData`; TTL in seconds.
- `backend/src/modules/voice/voice.routes.ts` — `router.post('/', authenticate, asyncHandler(...))` → `ok(res, session)`.
- `backend/src/routes/index.ts` — mount `apiRouter.use('/voice-sessions', voiceRoutes)`.
- `backend/api-calls/10-voice-sessions.rest` — VS Code REST sample (house style).
- `backend/tests/voice-sessions.test.ts` — 401 without/invalid token; 200 issuance + unique rooms; 500 when unconfigured (happy path `describe.skipIf` when `LIVEKIT_*` env absent).

Verify: `npm run typecheck` and `npm test` in `backend/`.

## Part 2 — Voice agent (worker mode)

- No pipeline changes. `agent.py` already supports worker mode via CLI subcommand.
- Run `uv run agent.py dev` in `livekit-voice-agent/`; confirm registration with the LiveKit server.
- Automatic dispatch is used: the worker joins any room matching its registration — no per-room dispatch logic in the backend.
- Env: `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` + pipeline provider keys `OPENAI_API_KEY`, `ASSEMBLYAI_API_KEY`, `CARTESIA_API_KEY`.

## Part 3 — Flutter

Dependencies: `http`, `livekit_client`, `permission_handler`, `flutter_secure_storage`.

Android:
- `android/app/src/main/AndroidManifest.xml` — add `INTERNET` (currently debug/profile only) and `RECORD_AUDIO`.
- `android/app/build.gradle.kts` — `minSdk` 24 if required by `flutter_webrtc`.

New infrastructure:
- `lib/config/app_config.dart` — `API_BASE_URL` via `String.fromEnvironment`; platform-aware default (`http://10.0.2.2:3000` on Android emulator, `http://localhost:3000` elsewhere).
- `lib/services/session_service.dart` — secure-storage-backed session (access/refresh token + user), simple in-memory singleton, save/restore/update/clear.
- `lib/services/api_client.dart` — http client with Bearer header, envelope unwrapping (`data`/`error`), typed exception, single retry on 401 via `/auth/refresh`, 10s request timeout.

Login wiring:
- `enter_email_screen.dart` → `POST /auth/otp/request`.
- `otp_screen.dart` → `POST /auth/otp/verify`, persist session, route by returned `user.role`.
- `splash_screen.dart` → restore session via refresh → route by role.
- Role home screens → logout `POST /auth/logout` + clear session.

Voice call (`agent_conversation_screen.dart`):
- Mic/call toggle in `lib/widgets/voice_call.dart` (`VoiceCallControl`); state enum `idle | connecting | listening | agentSpeaking | disconnected`.
- Tap: request `Permission.microphone` (guarded by `kIsWeb`) → `POST /api/voice-sessions` → `Room().connect(url, token)` → `localParticipant.setMicrophoneEnabled(true)` → play agent track on subscribe/playback events.
- Agent-speaking detection via `ActiveSpeakersChangedEvent` (any remote participant speaking); `RoomDisconnectedEvent` → disconnected.
- Toggle-off / dispose → `_cleanup()` → `listener.dispose()` + `room.disconnect()` + `room.dispose()`.

Verify: `flutter analyze`; run with `--dart-define=API_BASE_URL=...`.

## Env before testing

- Backend: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_TOKEN_TTL_SECONDS` (already in `backend/.env`).
- Agent: same `LIVEKIT_*` + `OPENAI_API_KEY`, `ASSEMBLYAI_API_KEY`, `CARTESIA_API_KEY`.
- Flutter: `--dart-define=API_BASE_URL=http://<LAN-IP>:3000` (real device) or default `http://10.0.2.2:3000` (emulator); a real verified account to log in with.

## Implementation status (as built)

Executed in one pass, backend → agent → Flutter. Plan doc saved to `plans/voice-integration.md`
before implementation began.

### Part 1 — Backend ✅
- New: `src/modules/voice/voice.service.ts`, `src/modules/voice/voice.routes.ts`, `api-calls/10-voice-sessions.rest`, `tests/voice-sessions.test.ts`.
- Modified: `src/config/index.ts` (`config.livekit`), `src/routes/index.ts` (mounted at `/voice-sessions` → `POST /api/voice-sessions`), `.env.example`.
- Token grant: `roomJoin + room + canPublish + canSubscribe + canPublishData`, TTL = `LIVEKIT_TOKEN_TTL_SECONDS` (seconds). Identity = user id.
- Verification: `npm run typecheck` clean; `npm test` 55/55 (voice file 5/5, incl. happy-path against the real token endpoint).

### Part 2 — Voice agent ✅
- No code changes. `livekit-voice-agent/agent.py` already registers a worker via `agents.cli.run_app(server)`.
- Verified `uv run agent.py dev` connects and registers: `registered worker {id: AW_6j27VPwdWnyE, url: wss://sahayak-r0e1ur7g.livekit.cloud, region: India South}`.
- Automatic dispatch in effect; no explicit per-room dispatch.

### Part 3 — Flutter ✅
- Added deps (resolved): `http ^1.6.0`, `livekit_client ^2.13.0`, `permission_handler ^13.0.2`, `flutter_secure_storage ^11.2.0`.
- New: `lib/config/app_config.dart`, `lib/services/session_service.dart`, `lib/services/api_client.dart`, `lib/widgets/voice_call.dart`.
- Modified: `enter_email_screen` (OTP request), `otp_screen` (verify → save session → route by role), `splash_screen` (restore + refresh), `senior_home_screen` / `volunteer_home_screen` (logout), `agent_conversation_screen` (embeds `VoiceCallControl`).
- Android: `main/AndroidManifest.xml` adds `INTERNET` + `RECORD_AUDIO`; `build.gradle.kts` sets `minSdk = maxOf(flutter.minSdkVersion, 24)`.
- iOS: `Runner/Info.plist` adds `NSMicrophoneUsageDescription` (for `permission_handler`).
- Verification: `flutter analyze` clean; `flutter test` pass. APK build not run — no Android SDK on this machine (environmental limitation, not a code issue).

### Env notes from execution
- `backend/.env` already contained `LIVEKIT_*` (unused before); values confirmed live (agent registration succeeded).
- `livekit-voice-agent/.env` holds only `LIVEKIT_*`; the STT/LLM/TTS keys (`ASSEMBLYAI_API_KEY`, `OPENAI_API_KEY`, `CARTESIA_API_KEY`) must be present in the shell or `.env` for calls to actually work.
- Flutter base URL is compile-time via `--dart-define=API_BASE_URL`.

## Iteration 2 — dev-run fixes & live transcription (as built)

Follow-up after the first device test. Three problems surfaced: the app hung on
"Sending code..." (`http.post` has no timeout and the default base URL was
emulator-only while no Android device was detectable), OTP codes were invisible
in dev (no SMTP), and Android blocked cleartext HTTP. Then the live
transcription UI was added on top.

### Dev-run fixes ✅
- `backend/src/config/index.ts` — new optional `OTP_DEV_CODE`; exported as `config.otpDevCode`.
- `backend/src/modules/auth/otp.service.ts` — `generateCode()` returns `config.otpDevCode` when set AND `NODE_ENV != production`, else the original random 6-digit code.
- `backend/.env` + `.env.example` — `OTP_DEV_CODE=123456`. Fixed code verified end-to-end: `verify` with `123456` issues a token; dev log shows the code in the mail body.
- `backend/src/modules/notifications/email.ts` — `LogOnlySender` now logs the message body, so codes are readable in the backend terminal when SMTP is unset. (`sentEmails` array untouched; tests unaffected.)
- `backend/src/app.ts` — permissive dev CORS (`Access-Control-Allow-Origin: *`, OPTIONS preflight `204`) so Flutter web/desktop builds can call the API.
- `mobile/android/.../AndroidManifest.xml` — `android:usesCleartextTraffic="true"` so debug builds can reach `http://10.0.2.2:3000` / LAN HTTP (LiveKit is `wss://`, unaffected).
- `mobile/lib/config/app_config.dart` — base URL now platform-aware: `--dart-define` wins; else `kIsWeb` → localhost; Android → `http://10.0.2.2:3000`; else localhost. Uses `defaultTargetPlatform` (no `dart:io`, so web still compiles).
- `mobile/lib/services/api_client.dart` — 10s `.timeout()` on all HTTP calls; a dead/unreachable host now surfaces an error instead of hanging on "Sending code...".
- Verification: backend typecheck clean, `npm test` 55/55; `flutter analyze` clean, `flutter test` pass; `/health` 200 with CORS preflight 204.

### Live transcription UI ✅
- `mobile/lib/widgets/voice_call.dart`:
  - New `AgentTranscriptCallback = void Function(String text, bool isFinal)`; `VoiceCallControl` takes an optional `onTranscript`.
  - Listens for `TranscriptionEvent` on the room listener, ignores segments from the local participant, and forwards each non-empty segment's `text` + `isFinal`. (Dart `TranscriptionSegment` is the high-level type with `isFinal` — not the protobuf `final_5`.)
- `mobile/lib/screens/agent_conversation_screen.dart`:
  - `_Message` gains `isInterim`; interim agent bubbles render italic with a trailing `…`.
  - `_onAgentTranscript(text, isFinal)` feeds the thread: on first real transcript the mock greeting + quick-options are dropped; interim chunks update/replace one live bubble; final chunks commit it; auto-scrolls to bottom.
- Verification: `flutter analyze` clean, `flutter test` pass. (Not yet exercised on a live call.)

## Dev run guide (how to run it now)

1. **Database** — `cd backend && bash scripts/dev-db.sh` (Postgres on :5433, script idempotent) → `npm run db:migrate` → `npm run db:seed` (first time only; `--fresh` to reset).
2. **Backend** — `npm run dev` (tsx watch, port 3000). OTP codes appear in this terminal's `[mail:dev]` log lines.
3. **Voice agent** — `cd livekit-voice-agent && uv run agent.py dev`; wait for `registered worker` (needs `LIVEKIT_*` + `OPENAI_API_KEY`/`ASSEMBLYAI_API_KEY`/`CARTESIA_API_KEY`).
4. **App** — open `mobile/` in Android Studio, start an emulator (or plug in a device), then `flutter run`. Emulator default reaches the backend via `http://10.0.2.2:3000`; a physical device needs `--dart-define=API_BASE_URL=http://<LAN-IP>:3000`. Web/desktop default to `http://localhost:3000`.
5. **Login** — `test@example.com`, code is `123456` (dev-only). Senior Home → **Click to Speak** → **Start voice call** → grant mic permission → talk; the agent's speech streams into the chat transcript.
6. Sandbox emulators available: `Medium_Phone`, `sahayak_test` (`flutter emulators --launch <id>`).