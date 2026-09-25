# Sahayak — Mobile App (Flutter)

Senior Citizen & Volunteer app. Screens map directly to the page flow in
`Sahayak_Client_Frontend_Design.pdf`.

## Structure

```
lib/
  main.dart                          entry point -> SplashScreen
  config/app_config.dart             API base URL (dart-define, platform-aware)
  theme/app_theme.dart               colors, shared styling
  widgets/primary_button.dart        reusable button
  widgets/voice_call.dart            LiveKit mic/call control + data-channel events
  services/api_client.dart           authenticated HTTP client (envelope + token refresh)
  services/session_service.dart      secure-storage session persistence
  screens/
    splash_screen.dart               restore session -> route by role
    create_login_screen.dart         Create Account / Login entry
    enter_email_screen.dart          email entry -> POST /api/auth/otp/request
    otp_screen.dart                  OTP -> POST /api/auth/otp/verify
    role_selection_screen.dart       Volunteer vs Senior Citizen
    volunteer_registration_screen.dart
    senior_registration_screen.dart
    registration_submitted_screen.dart  shared "awaiting verification" page
    volunteer_home_screen.dart
    senior_home_screen.dart          "Click to Speak" entry point
    agent_conversation_screen.dart   live voice conversation w/ LiveKit agent
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

- Email + OTP sign-in (`/api/auth/otp/request`, `/api/auth/otp/verify`), logout
  (`/api/auth/logout`), with a session persisted in platform secure storage.
- Auto token refresh on 401 via the refresh token (`/api/auth/refresh`).
- Splash screen restores the session and routes by role (senior / volunteer).
- Senior home "Click to Speak" -> LiveKit voice session; the agent's structured
  help requests (published on the `sahayak_request` data channel) are posted to
  `/api/requests`. Voice transcript bubbles streamed live from the agent.
- Registration screens and the "awaiting verification" submitted page.

## Not yet wired up (marked with `// TODO` in code)

- Registration form submission to the backend (forms exist; the POST is not).
- Police-verification status polling (the "Simulate verification approved"
  button on the submitted screen is dev-only, remove before ship).
- Volunteer home request list/detail screens behind `/api/requests/me`.
- SOS / emergency trigger from the app (`POST /api/emergency-events` is ready
  on the backend but not invoked from the UI).
- Profile screen.

## Scope reminder

Stay within `mobile/`. Anything touching shared backend contracts needs
sign-off first.