# Sahayak — Mobile App (Flutter)

Senior Citizen & Volunteer app. Screens map directly to the page flow in
`Sahayak_Client_Frontend_Design.pdf`.

## Structure

```
lib/
  main.dart                          entry point
  config/app_config.dart             API base URL (dart-define, platform-aware)
  theme/app_theme.dart               colors, shared styling
  models/help_request.dart           help request model / dummy payloads
  services/api_client.dart           authenticated HTTP client (envelope + token refresh)
  services/session_service.dart      real session (JWT) in platform secure storage
  services/user_session.dart         dev role marker in SharedPreferences
  services/agent_service.dart        text-chat client for /api/agent/chat
  widgets/primary_button.dart        reusable button
  widgets/chat_bubble.dart, mic_button.dart, text_input_bar.dart
  widgets/voice_call.dart            VoiceCallController: LiveKit call engine + control
  screens/
    splash_screen.dart               restore session -> route by role
    create_login_screen.dart         Create Account / Login entry
    enter_email_screen.dart          email entry -> POST /api/auth/otp/request
    otp_screen.dart                  OTP -> POST /api/auth/otp/verify (real login)
    role_selection_screen.dart       Volunteer vs Senior Citizen
    volunteer_registration_screen.dart
    senior_registration_screen.dart
    registration_submitted_screen.dart  shared "awaiting verification" page
    volunteer_home_screen.dart
    request_detail_screen.dart        volunteer Accept / Decline
    request_accepted_screen.dart      post-accept confirmation
    senior_home_screen.dart           "Click to Speak" entry point
    agent_conversation_screen.dart    LiveKit voice + text fallback + Dashboard exit
```

Navigation uses plain `Navigator.push` / `MaterialPageRoute` — no router
package yet, kept intentionally simple.

## Requirements

- Flutter SDK (developed against stable 3.47.x).
- The Sahayak backend running on `http://localhost:3000`.

## Run locally

```
flutter pub get
flutter run
```

By default the app talks to:

- Android emulator  -> `http://10.0.2.2:3000` (host loopback)
- Web / desktop i/o -> `http://localhost:3000`

To target another backend (physical device, etc.) inject the base URL at
build/run time:

```
flutter run --dart-define=API_BASE_URL=http://<your-host>:3000
```

> Android needs `INTERNET` and `RECORD_AUDIO` permissions — already declared in
> `android/app/src/main/AndroidManifest.xml` (with `usesCleartextTraffic` for
> dev HTTP).

## What is wired up

- Email + OTP sign-in: `/api/auth/otp/request` (enter email) and a **real**
  `/api/auth/otp/verify` call from the OTP screen, saving the returned JWT +
  refresh token into secure storage and routing by the user's role. Logout via
  `/api/auth/logout`.
- Auto token refresh on 401 via the refresh token (`/api/auth/refresh`).
- Splash screen restores the real session and routes by role (senior /
  volunteer); falls back to the dev `UserSession` marker, then to login.
- Senior home "Click to Speak" -> **LiveKit voice session**: `VoiceCallController`
  POSTs `/api/voice-sessions` for a room token and connects to the agent's
  room. The agent's speech streams in as transcript bubbles (interim -> final),
  and structured help requests published on the `sahayak_request` data channel
  are forwarded to `/api/requests`, with a confirmation bubble on success.
- Text input is a fallback path that calls `/api/agent/chat` (a planned
  endpoint; until it ships you get a friendly error banner).
- Registration screens and the "awaiting verification" submitted page.

## Not yet wired up (marked with `// TODO` in code)

- Registration form submission to the backend (forms exist; the POST is not).
- Police-verification status polling (the "Simulate verification approved"
  button on the submitted screen is dev-only, remove before ship)
- Profile screen on volunteer home
- Real accept/decline API (volunteer flow is dummy UI for now; the backend
  `/api/requests/nearby`, `/me`, `/:id/accept` endpoints are ready)
- In-app SOS / emergency trigger (`/api/emergency-events` is live on the
  backend but not invoked from the UI)

## Scope reminder

Stay within `mobile/`. Anything touching shared backend contracts needs
sign-off first.