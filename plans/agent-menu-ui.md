# Plan: Agent menu (chat-style greeting + quick replies)

UI-only change, strictly inside `mobile/`. No backend/API contract changes.

## Scope

- Add a chat-style "agent menu" on the existing agent conversation screen:
  greeting message, tappable quick-reply options, and a hardcoded
  follow-up reply.
- Seniors are the audience: font size >= 18, tap targets >= 48px, high contrast.

## Steps

1. **Inspect** `senior_home_screen.dart`, `agent_conversation_screen.dart`,
   `theme/app_theme.dart`, `widgets/primary_button.dart`. The home screen
   already has a large, labelled "Click to Speak" target that navigates to
   `AgentConversationScreen` via the existing `Navigator.push` /
   `MaterialPageRoute` pattern (senior_home_screen.dart:30-45). Nothing to
   change there — leave it as-is to keep the diff small.
2. **Rewrite** `agent_conversation_screen.dart` (placeholder only):
   - Keep the existing doc comment and the `StatefulWidget` + private
     `State` shape.
   - Add a private `_Message { text, fromAgent }` class and a `const`
     `List<String> _agentOptions` for the four quick replies, so both are
     easy to swap for real agent output later.
   - Local `List<_Message>` seeded with the greeting on screen open.
   - `ListView` of bubbles: agent = left white bubble, user = right
     `AppTheme.senior` bubble, both 18px text.
   - `_OptionsPanel` of full-width outlined buttons (48px+tall) shown after
     the greeting; tapping one adds it as a user message, hides the panel,
     and appends the hardcoded agent reply "Okay, tell me a bit more about
     what you need."
   - Auto-scroll to the latest message after a selection.
3. **Run** `flutter analyze` inside `mobile/` and fix anything in the two
   screens.

## Constraints honoured

- No new packages, no state-management/router packages (plain
  `Navigator.push` / `MaterialPageRoute`).
- No mic, speech, TTS, network, or backend calls; no text input.
- Colours from `theme/app_theme.dart`; `PrimaryButton` not used for the
  options because it cannot set >= 18px label text — outlined buttons with
  explicit 18px text are used instead.
- No renames/refactors of existing files; existing `// TODO` comments kept.

## Files

- `mobile/lib/screens/agent_conversation_screen.dart` — chat UI rewrite.
- `mobile/lib/screens/senior_home_screen.dart` — unchanged (already routes
  to the conversation screen).
- `plans/agent-menu-ui.md` — this plan.