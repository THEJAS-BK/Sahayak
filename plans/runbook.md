# Runbook

> Status: **As-built.** Commands verified against this build. Where something is
> still unproven it says so rather than implying it works.

Consolidated from the retired "real data and voice readiness" note, whose
"police-only seeder" premise no longer held once `db:seed -- --demo` existed.

## Running the whole stack

```bash
# 1. database — Neon, already migrated. Seed if the portal is empty.
cd backend
npm run db:seed              # police account only
npm run db:seed -- --demo    # + a demo senior, volunteer and two help requests

# 2. api
npm run dev

# 3. agent worker — separate shell. Only needed for the voice path.
cd livekit-voice-agent && uv run agent.py dev

# 4. clients
cd mobile && flutter run
cd web && npm run dev
```

The voice agent worker is **not** needed for help requests, dispatch or the
police portal. It is only needed to talk to the agent.

## Police dispatch by hand

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
rescue it — noted in `deferred-before-production.md`, not changed.

## Status

| Area | State |
| --- | --- |
| Fabricated seeder data | Removed |
| Police bootstrap (`seed.ts`, `POLICE_BOOTSTRAP_EMAIL`) | Done, tested |
| Demo seed (`db:seed -- --demo`) | Done, idempotent |
| Dev OTP `123456` | Kept |
| Web login prefilled demo account | Removed |
| Police manual dispatch (`GET /police/volunteers`, `PATCH /police/requests/:id/assign`) | Done, tested live |
| Volunteer "nearest" ranking | Deferred: listed ready-first, no distance — `deferred-before-production.md` §2 |
| Dev OTP `123456` in the web bundle | Deferred: leaks in production build — `deferred-before-production.md` §1 |
| Push delivery | Not implemented — `sendPush` is a logging stub; email only |
| Token-only voice architecture | Holds; backend mints tokens only |
| Agent auto-dispatch via token `roomConfig` | Fixed and verified live |
| LiveKit inference STT/LLM/TTS without extra keys | Verified |
| Structured envelope -> app -> `POST /api/requests` | Implemented, unit-tested |
| Live mic session producing the envelope | **Not yet run** |

### The one unproven thing

The full room session has not been observed producing the `sahayak_request`
envelope, because no live microphone input has been used — the audio under test
was synthesised and pushed frame by frame. Dispatch, STT, the envelope contract
(`voice_payload.dart`, covered by tests) and the app-side POST are each verified
separately. What is missing is a single end-to-end run with a human voice, which
is a manual step, not a code change.
