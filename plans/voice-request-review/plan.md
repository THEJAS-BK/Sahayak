# Voice request review dialog + backend body preview

## Goal

The voice agent finishes gathering what it needs, publishes the payload to the app over the
`sahayak_request` data channel, and the app shows a centered review dialog. The senior edits what
they want, then either sends the request or keeps talking. The backend logs the request body and
returns `201` without persisting anything when `REQUESTS_DRY_RUN=true`. A camera tile is present as
a placeholder only.

## Flow

1. Envelope arrives on the data channel → mic mutes → centered review dialog opens.
2. **Send request** → `ApiClient.post('/api/requests', body: draft.toCreateBody())` → dialog closes,
   mic unmutes, confirmation bubble. On `ApiException` → error banner, pending card stays for retry.
3. **Continue conversation** → dialog closes, mic unmutes, a pinned "Ready to send" card sits above
   the mic button; tapping it re-opens the same dialog with the saved draft.
4. A newer envelope arriving while the dialog is open replaces the draft and re-opens the dialog once
   (no stacked modals).
5. **Camera** → dashed, disabled tile reading "Add a photo — coming soon"; tapping it shows a snackbar
   only.

## Mobile (`mobile/`)

### New `lib/widgets/request_review_dialog.dart`

```
╭──────────────────────────────────╮
│ Here's what I noted              │  navyDark header strip
├──────────────────────────────────┤
│ What do you need?                │
│ [ Groceries                 ▾ ]  │  DropdownButtonFormField
│ How soon do you need it?         │  grocery_assistance → Groceries,
│ [ Normal ] [ Urgent ]             │  medical → Medical help,
│ In your own words                 │  transport → Transport, other → Other
│ ┌──────────────────────────────┐ │
│ │ Need rice and oil…           │ │  TextField, maxLines 4
│ └──────────────────────────────┘ │
│ Also noted: rice, oil             │  details read-only, hidden if absent
│ ┌──────────────────────────────┐ │
│ │  ▣ Add a photo — coming soon │ │  camera placeholder, disabled
│ └──────────────────────────────┘ │
│ [  Continue conversation  ]      │  OutlinedButton, AppColors.senior
│ [      Send request        ]     │  PrimaryButton, AppColors.accentBlue
╰──────────────────────────────────╯
```

- `showDialog(barrierDismissible: false)` inside `ConstrainedBox(maxHeight: 0.85 * screen)` plus a
  `SingleChildScrollView`, so a large system font or a short screen still works.
- Returns `VoiceHelpRequest?` — null means continue, non-null is the confirmed draft. Send stays
  disabled while the description is empty.
- Reuses `PrimaryButton`, `AppColors` and `AppTheme`; no new fonts or palette.

### New `lib/widgets/pending_request_card.dart`

Strip above the mic button: status dot + category label + one-line description + "Review" chevron.
Held in screen state rather than in the transcript `ListView`, so it survives the text-fallback path
that rebuilds `_messages` from `_agentService.history`
(`screens/agent_conversation_screen.dart:168-198`).

### `lib/services/voice_payload.dart`

- Add `copyWith({category, description, priority})` so the dialog can yield an edited draft.
- `toCreateBody()` becomes the live POST body.
- UI labels stay out of this non-UI class.

### `lib/widgets/voice_call.dart`

- Add `Future<void> setMicrophoneEnabled(bool)` to `VoiceCallController` (after line 126), wrapping
  `room.localParticipant?.setMicrophoneEnabled`; a no-op when not in a call. `CallState` is untouched.

### `lib/screens/agent_conversation_screen.dart`

- Add `VoiceHelpRequest? _pendingRequest`, `bool _reviewOpen`, `bool _sending`.
- `_onSahayakRequest` (117-156) keeps the parse, `isValid` check and `_seenRequestIds` dedupe, then
  sets pending → mutes → `showDialog` → handles the result.
- Send: `ApiClient.post('/api/requests', body: draft.toCreateBody())`; on 2xx clear pending and append
  a "Request sent for <category>…" bubble; on `ApiException` map `REQUEST_ALREADY_OPEN` to "You
  already have a help request open. A volunteer is on the way.", otherwise "Could not send your
  request: …", and keep the card.
- Update the class doc comment (11-22) to describe the review step.

## Backend (`backend/`)

### `src/config/index.ts`

- Add `REQUESTS_DRY_RUN: emptyToUndefined` to the env schema and export
  `requests: { dryRun: env.REQUESTS_DRY_RUN === 'true' || env.REQUESTS_DRY_RUN === '1' }`.
  Default off, i.e. current behaviour.

### `src/modules/requests/requests.routes.ts`

In the Q-01 handler, after zod validation (line 40) and the existing `logger.info` (line 42), before
the BR-13 query:

```ts
if (config.requests.dryRun) {
  console.log(
    `\n[requests] DRY RUN — POST /api/requests from ${req.user!.id} (${req.user!.role}) at ${new Date().toISOString()}\n` +
    JSON.stringify(parsed.data, null, 2),
  )
  ok(res, { dry_run: true, request_id: null, status: 'PENDING', dispatched_to: [] }, 201)
  return
}
```

Import `config` from `'../../config/index.js'` (same path as `requests.service.ts:3`). No DB write, no
matching, no FCM.

### `.env.example`

- Add `REQUESTS_DRY_RUN=false` with a one-line comment. For the demo, set `REQUESTS_DRY_RUN=true` in
  `backend/.env`.

`tests/requests.test.ts` (Q-01/Q-04/Q-05 assert real persistence and dispatch) stays green because the
flag is off there.

## Verification

- `cd mobile && flutter analyze && flutter test` — new `test/request_review_dialog_test.dart` (fields
  render from a v1 envelope; edit + Send returns the edited draft; Continue returns null; Send is
  disabled on an empty description) plus `copyWith` cases in `test/voice_payload_test.dart`.
- `cd backend && npm run typecheck && npm test`.
- Manual: `REQUESTS_DRY_RUN=true npm run dev`, then Send in the app → pretty JSON body in the terminal.
  On Android the app defaults to `http://10.0.2.2:3000` (`config/app_config.dart:23`); use
  `--dart-define=API_BASE_URL=http://<LAN-IP>:3000` on a physical device.

## Out of scope

- `_onAgentTranscript` overwrites the trailing agent bubble
  (`screens/agent_conversation_screen.dart:101-103`); the pending card is unaffected.
- Hardcoded lat/lng in `toCreateBody`; the dead `/api/agent/chat` fallback.
