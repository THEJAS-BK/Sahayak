# Real Data and Voice Readiness

Goal: no fabricated data anywhere in the running stack, and a voice path that
reaches the agent without the backend ever creating or dispatching a room.

## Part 1 — Data

### Decision

The previous seeder invented a police officer, three seniors, three volunteers,
six requests, emergencies and audit history. All of it was removed. The only row
the system now creates on its own is the police account, because there is no
police self-signup and the approval queue would otherwise be unreachable.

Everything else is created by a person going through the real UI: OTP login
creates a role-less user, the role registration form fills the profile, and a
police account approves it.

### Bootstrap

`backend/scripts/seed.ts` is idempotent and police-only.

- `npm run db:seed` — upsert the police user, leave existing data alone.
- `npm run db:seed:fresh` — truncate all application tables, then create police.

The email comes from `POLICE_BOOTSTRAP_EMAIL`; the script refuses to run without
it rather than silently defaulting to a shared address. There is no password —
police sign in with email + OTP like everyone else.

```bash
cd backend
npm run db:seed:fresh
```

### Dev OTP

`123456` stays. `otp.service.ts` honours `OTP_DEV_CODE` when `NODE_ENV` is not
`production`, so the local flow is walkable without a mail provider. The web
login page shows the code as a hint because there is no inbox to read it from.

That hint is **not** gated, so the string ships in a production bundle — recorded
in `plans/deferred-before-production.md` §1 along with the missing SMS/email
provider.

### Consequence for testing

An empty database has exactly one login: `police@gmail.com`. Senior and
volunteer accounts must be registered before the approval queue has anything in
it. OTP issuing is rate limited to 10 requests per hour per IP, which is
deliberate for a real deployment; each `e2e:*` script needs four logins, so a
second run within the hour needs the dev server restarted (the bucket is in
memory).

## Part 2 — Voice

### Architecture

The backend's entire responsibility is minting a join token.

1. App authenticates, calls `POST /api/voice-sessions`.
2. Backend returns `{ url, token, room }` and nothing else. It does not create a
   room, does not call LiveKit's room API, and does not dispatch an agent.
3. App joins the room itself. The agent is already on its way.
4. Agent publishes the structured envelope on the `sahayak_request` data topic.
5. App renders a review dialog, and the app — not the agent — performs
   `POST /api/requests` with the senior's own coordinates.

Keeping the write on the app side means the request carries the authenticated
user's identity and location, and nothing reaches the database without a
confirmation tap.

### Automatic dispatch

With plain `AccessToken` grants the agent was never dispatched: the client
connected and sat in an empty room. Dispatch is requested *in the token*:

```ts
token.roomConfig = {
  agents: [new RoomAgentDispatch({ agentName: config.livekit.agentName })],
};
```

The worker must also register under that same name. LiveKit reads it from the
environment, not from the `AgentServer(...)` constructor:

```bash
LIVEKIT_AGENT_NAME=sahayak   # livekit-voice-agent/.env
```

With both halves in place the agent joins the room on the first connection.
Verified against a token minted by the real endpoint: `agent-AJ_...` appears in
the room shortly after the client connects.

### Providers

`agent.py` names models as strings (`assemblyai/universal-streaming:en`,
`openai/gpt-4o-mini`, `cartesia/sonic-2`). The SDK resolves these to
`livekit.agents.inference.*` and routes them through the LiveKit inference
gateway using the existing `LIVEKIT_API_KEY`. There are no AssemblyAI, OpenAI or
Cartesia plugin packages to install and no separate API keys to configure.

Streaming STT was confirmed against the gateway with real audio: interim and
final transcript events come back. An earlier attempt appeared to fail because
the test harness was comparing `SpeechEventType` members to lowercase strings.

### Known gap
The full room session has not yet been observed producing the `sahayak_request`
envelope, because no live microphone input has been used — the audio under test
was synthesised and pushed frame by frame. Dispatch, STT, the envelope contract
(`voice_payload.dart`, covered by tests) and the app-side POST are each verified
separately. What is missing is a single end-to-end run with a human voice, which
is a manual step, not a code change.

## Part 3 — Police dispatch by hand

Automatic matching is not always enough: the request may be created outside
every volunteer's radius, or dispatch may exhaust `MAX_DISPATCH_ATTEMPTS`. The
police portal therefore lists volunteers and lets an officer hand a request to
one by name.

Two things are deliberately *not* up for negotiation:

- **The volunteer still has to accept.** Police picking someone sets
  `assigned_volunteer_id` and `DISPATCHED`; `accepted_at` stays null.
- **Availability is not overridable.** An off-duty volunteer cannot be assigned,
  because Q-05 would refuse their accept and the senior would be stuck with a
  request nobody can take.

What police *can* override is the matcher's radius and batch size, which is the
part that actually fails. `UNASSIGNED` remains terminal per BR-03, so a request
that exhausted its attempts still needs that rule relaxed before police can
rescue it — noted, not changed.

## Part 4 — Runbook

```bash
# 1. database
cd backend && npm run db:seed:fresh

# 2. api
npm run dev

# 3. agent worker (separate shell, must be running for dispatch)
cd livekit-voice-agent && uv run agent.py dev

# 4. clients
cd mobile && flutter run
cd web && npm run dev
```

## Status

| Area | State |
| --- | --- |
| Fabricated seeder data | Removed |
| Police bootstrap (`seed.ts`, `POLICE_BOOTSTRAP_EMAIL`) | Done, tested |
| Dev OTP `123456` | Kept |
| Web login prefilled demo account | Removed |
| Police manual dispatch (`GET /police/volunteers`, `PATCH /police/requests/:id/assign`) | Done, tested live |
| Volunteer "nearest" ranking | Deferred: listed ready-first, no distance — `plans/deferred-before-production.md` §2 |
| Dev OTP `123456` in the web bundle | Deferred: leaks in production build — `plans/deferred-before-production.md` §1 |
| Token-only voice architecture | Holds; backend mints tokens only |
| Agent auto-dispatch via token `roomConfig` | Fixed and verified live |
| LiveKit inference STT/LLM/TTS without extra keys | Verified |
| Structured envelope -> app -> `POST /api/requests` | Implemented, unit-tested |
| Live mic session producing the envelope | Not yet run |
