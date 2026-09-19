# Sahayak — Mobile App (Flutter)

Senior Citizen & Volunteer app. Screens map directly to the page flow in
`Sahayak_Client_Frontend_Design.pdf`.

## Structure

```
lib/
  main.dart                          entry point
  theme/app_theme.dart                colors, shared styling
  widgets/primary_button.dart         reusable button
  screens/
    splash_screen.dart                "Already Logged In?" check
    login_email_screen.dart           Create Account / Login + Enter Email
    otp_screen.dart                   OTP page
    role_selection_screen.dart        Volunteer vs Senior Citizen
    volunteer_registration_screen.dart
    senior_registration_screen.dart
    registration_submitted_screen.dart  shared "awaiting verification" page
    volunteer_home_screen.dart
    senior_home_screen.dart           "Click to Speak" entry point
    agent_conversation_screen.dart    voice UI placeholder (flow TBD)
```

Navigation currently uses plain `Navigator.push` / `MaterialPageRoute` — no
router package yet, kept intentionally simple to start.

## Run locally

```
flutter pub get
flutter run
```

## Not yet wired up (marked with `// TODO` in code)

- Real session check on splash (currently always routes to login)
- Email/OTP calls to backend
- Registration form submission to backend
- Police-verification status polling (the "Simulate verification approved"
  button on the submitted screen is dev-only, remove before ship)
- Voice-agent service integration on the agent conversation screen
- Profile screen, requests list/detail screens on volunteer home

## Scope reminder

Per the work-allocation doc: stay within `mobile/`. Anything touching
shared backend contracts needs Thejas's sign-off first.
