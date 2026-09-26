# Voice Agent — Structured Output (v1)

Plan + contract for delivering **structured help requests** from the LiveKit
voice agent to the Flutter app and into the backend.

Status: **implemented** (`agent.py` envelope v1 + `mobile/lib/services/voice_payload.dart`).

---

## 1. Goal

The voice agent captures what a senior asks for, turns it into a **validated,
versioned JSON envelope**, sends it to the app over the LiveKit **data channel**
(topic `sahayak_request`), and the app posts the equivalent of `Q-01
POST /api/requests` (`plans/api-plan.md` line 112).

```
livekit-voice-agent  ──data channel: sahayak_request──►  Flutter app  ──POST /api/requests──►  backend
   record_help_request (tool)    { v, type, request_id, request }        + lat/lng + source      Q-01
```

The agent **never adds latitude/longitude/source** — the app injects them
(dummy values for now), because the agent has no location context.

## 2. Why

The previous bare payload `{category, description, priority, details?}` was
missing the backend's required `latitude`, `longitude`, and `source`, so
`POST /api/requests` returned `400 Invalid help request`. The tool arguments
were also loosely typed (`category: str`), allowing invalid categories and
over-long descriptions.

## 3. Contract (agent → app)

Topic: `sahayak_request`. Envelope:

```json
{
  "v": 1,
  "type": "help_request",
  "request_id": "<uuid4>",
  "request": {
    "category": "grocery_assistance" | "medical_assistance" | "transport_assistance" | "other",
    "description": "… (1–2000 chars)",
    "priority": "normal" | "urgent",
    "details": {
      "items": ["rice", "oil"],
      "symptom": "fever since last night",
      "destination": "KMC Hospital"
    }
  }
}
```

- `v` — envelope schema version. The app soft-checks it (legacy bare payloads
  without `v` are still accepted and migrated to the same shape).
- `request_id` — uuid for dedupe: the app ignores repeats of an already-seen id
  (the agent may re-publish or the data channel may deliver duplicates).
- `details` is optional; only populated keys are sent. The agent captures three
  typed extras: `items`, `symptom`, `destination`.

## 4. App → backend (Q-01 body)

The app builds the exact Q-01 body:

```json
{
  "category": "grocery_assistance",
  "description": "…",
  "details": { "items": ["rice", "oil"] },
  "latitude": 12.9716,          // placeholder for now
  "longitude": 77.5946,         // placeholder for now
  "priority": "normal",
  "source": "voice_agent"
}
```

- `source` is forced to `"voice_agent"`.
- `latitude`/`longitude` are placeholders; a future step should use the
  senior's profile home coords or device location.

## 5. Changes

| File | Work |
|---|---|
| `livekit-voice-agent/agent.py` | `record_help_request` typed with `Literal` enums + `items`/`symptom`/`destination`; emits v1 envelope with `request_id`; clamps description ≤ 2000; logs the published payload. |
| `mobile/lib/services/voice_payload.dart` (new) | `VoiceHelpRequest.fromDataChannel()` parses the envelope (or legacy payload), validates category/priority, and `toCreateBody()` emits the Q-01 body with dummy coords + `source: "voice_agent"`. |
| `mobile/lib/screens/agent_conversation_screen.dart` | `_onSahayakRequest` routes through `VoiceHelpRequest`, dedupes by `request_id`, and shows a typed confirmation bubble (category + urgent flag). |
| `plans/voice-integration.md`, `plans/complete-context/workflow.md` | Cross-link this doc. |

Backend: **no changes** — the contract already matches `createSchema`
(`backend/src/modules/requests/requests.routes.ts:22`).

## 6. Verification

- `python -m py_compile agent.py` / restart `uv run agent.py dev`.
- `flutter analyze` clean, `flutter test` green.
- Live smoke: talk to the agent, confirm a `help_requests` row is created
  (previously this path 400'd).
- Backend `npm test` stays green (no backend change).