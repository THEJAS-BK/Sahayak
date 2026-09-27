# Deferred before production

Shortcuts taken on purpose while the data to do better is missing. Each one is
safe to run today, wrong to ship, and has an owner-sized fix written down. Check
this file before any demo to a real user, and treat every **Must fix** item as a
release blocker. There are five.

Status legend: **Must fix** = ships broken or leaks a secret. **Should fix** =
visible quality gap. **Nice to have** = polish.

---

## 0. Must fix — rate limiting is switched OFF right now (2026-09-26)

**This is the one that is actively disarmed in the working tree.**

`backend/.env` contains `RATE_LIMIT_DISABLED=true`, which turns off **both** OTP
throttles:

| Limiter | Where | Limit |
|---|---|---|
| Per-IP, in memory | `src/middleware/rate-limiters.ts` | 10 requests / hour / IP |
| Per-email, DB-backed | `src/modules/auth/otp.service.ts` (`assertCanIssue`) | 3 codes / 10 min / email |

**Why it is off.** Switching between the police account and freshly registered
seniors while testing kept tripping the limits, and the per-email one is stored
in `otp_codes`, so it survives a server restart — a restart does not clear it
and there is no way to unlock an account except waiting out the 10 minutes. It
made the portal look broken.

**How it is implemented.** A single `RATE_LIMIT_DISABLED` env flag, read in
`config.rateLimitDisabled` and honoured in both limiters. It is forced off when
`NODE_ENV=production`, so the flag cannot be shipped by accident even if it is
left in the deployed env. Tests pin it to `false` in `vitest.config.ts`, because
A-01 asserts the issuance limit and would otherwise pass vacuously.

**What is still protecting you.** The fixed 6-digit dev code means brute force
is not the exposure here. `MAX_FAILED_ATTEMPTS` (5 wrong codes / 10 min) is
**not** disabled, and a wrong code is still rejected — verified.

**Before any real deployment:**

1. Remove `RATE_LIMIT_DISABLED=true` from `backend/.env` and the deployed env.
2. Key both limiters on **email as well as IP**. Ten requests per hour per IP is
   unusable for a shared egress IP or a NAT'd office, and one abuser behind that
   IP locks out every user. The per-IP bucket is also trivially shared between
   unrelated people.
3. Move the counters out of memory into the database (or Redis) so they are
   shared across instances and survive restarts deliberately rather than by
   accident.
4. Decide real values: OTP issuance and verification are the two operations that
   actually cost money or leak a code, so those are the ones to keep tight;
   everything else can be generous.
5. Confirm with `curl` that a burst really does return 429 once re-enabled —
   nothing in the app surfaces the limit clearly to a user at present.

---

## 1. Must fix — the dev OTP code is hardcoded and shown to users

**Today.** `OTP_DEV_CODE=123456` in `backend/.env`. The backend only honours it
when `NODE_ENV !== 'production'`, so the backend gate is fine. The **web** app is
not gated at all:

- `web/src/pages/Login/index.tsx:7` — `const DEV_OTP_CODE = '123456';`
- the same file **auto-fills** the field (`setCode(DEV_OTP_CODE)`) and renders
  "Dev OTP code (OTP_DEV_CODE) is 123456" under the button, in every build.

**Why it matters.** A production build shows the code to whoever loads the page.
Against a real OTP provider nothing would match, so login just fails — but we
publish the answer, and the provider is not wired yet anyway (see §1.1).

**Fix, in order.**

1. Gate the hint and the auto-fill on `import.meta.env.DEV` so a production
   bundle cannot contain either. This is a two-line change; do it first.
   *Verified leak:* `npm run build` currently leaves one `123456` and the
   "Dev OTP code" string in `dist/assets/*.js`.
2. Wire a real SMS/email sender (Twilio/MSG91 for SMS) behind the same
   `otp.service.ts` interface. `otp_codes.code` and `otp_attempts` already
   exist, and expiry/attempt limits are enforced, so only delivery is missing.
3. Remove `OTP_DEV_CODE` from `backend/.env.example` and the deployed env.
4. Keep `123456` working locally: it stays gated to non-production on the
   backend, which is what makes the flow testable without a provider.

(The rate limiting around this flow is currently switched off — see §0.)

**Done when.** `npm run build` in `web/` produces a bundle with no `123456`
string in it, and a real phone number receives a real code.

---

## 2. Must fix — "nearest volunteer" is faked with data we do not trust

**Today.** The police assign dialog (P-04 / P-05) lists **any available
volunteer**, ready-first, and shows no distance at all. `fetchAssignableVolunteers`
sends no coordinates on purpose, and the distance badge was removed from
`AssignVolunteerDialog`.

**Why.** Volunteer positions are not real. `volunteer_profiles.current_latitude`
/ `current_longitude` are only written while a volunteer is on an active job
(BR-09), and `location_updated_at` is treated as stale after 10 minutes. What
remains is `base_latitude` / `base_longitude`, which is whatever locality the
volunteer typed at registration — for most users that is a neighbourhood, not a
point. Sorting on it produces confident wrong answers: "620 m away" between two
people in different parts of the city, and a volunteer at the bottom of the list
who could actually walk there.

**This got worse on 2026-09-27, and is now the top risk in the file.** Automatic
matching was changed to offer each request to the **single nearest** eligible
volunteer instead of a fan-out (see §4). Under fan-out, a wrong nearest-neighbour
ranking was merely a poor ordering — the request also reached the other four
people in range and somebody would take it. Under single-target there is no
fallback: if the ranking picks the wrong person, the request is now held by
precisely the wrong volunteer and nobody else is told. **The matcher is no longer
safe to run on guessed coordinates.** Until positions are real, prefer police
hand-assignment (P-05).

**The backend already supports the fix.** P-04 accepts `lat`/`lng` and returns
`distance_m`, ordering `can_assign DESC, distance_m ASC`. Nothing needs to be
rebuilt — only better coordinates fed in.

**Fix.**

1. Get real positions. Either a `POST /volunteers/me/location` ping from the
   app on a timer, or capture device GPS at registration instead of asking for
   a locality. Confirm the freshness window is appropriate for a volunteer who
   moves around a neighbourhood on foot.
2. Seed real volunteers with real coordinates before trusting any ranking.
3. Pass `{ lat, lng }` from the request's location in the assign dialog, restore
   the `distance_m` badge, and re-enable the `ORDER BY distance_m` path.
4. Decide the product rule this exposes: if *no* volunteer is within
   `MATCH_RADIUS_M`, does police get offered the nearest anyway with a warning,
   or nothing? Today, manual dispatch is the only way such a request is served.
5. Then re-check auto-dispatch accuracy against real data before trusting it to
   silently dispatch — and note that "silently" now means "with no second
   recipient to fall back on".

**Done when.** Distance is shown in the dialog, the ordering is stable, and the
displayed distances match reality for a few volunteers you check by hand.

---

## 3. Must fix — there is no push delivery at all; polling is a stopgap (2026-09-26)

**Nothing is being pushed, and nothing ever has been.** This is not a flaky
integration to debug, it is an absent one:

| Piece | State |
|---|---|
| `firebase_messaging` / `firebase_core` in `mobile/pubspec.yaml` | **absent** |
| `mobile/android/app/google-services.json` | **absent** |
| `mobile/ios/Runner/GoogleService-Info.plist` | **absent** |
| Client code calling `PATCH /api/users/me/fcm-token` | **absent** |
| `backend/src/modules/users/users.routes.ts:30` (the route) | exists, unused |
| `users.fcm_token` | nullable, so `NULL` for every volunteer |

**Why nothing arrives.** Two separate gaps now, and both are silent. First,
`sendPush` in `backend/src/modules/notifications/push.ts` is a **log-only stub**
— the `firebase-admin` SDK and its credential were removed along with the
Firestore mirror, so a push "succeeds" by writing a line to the log. Second,
`pushOrLog` (`backend/src/modules/notifications/request.ts`) returns immediately
when the token is null, and no client ever registers one, so every volunteer has
`fcm_token IS NULL`. So `notifyDispatch` notifies nobody, every time, without a
single error. A dispatched request produces **zero** notifications and logs
**zero** failures — it looks completely healthy.

The `fcm_token` column and the call sites that populate it were deliberately
left in place, so this is a delivery gap rather than a data-model gap. They are
simply unused until push is built.

**What is carrying it instead.** `volunteer_home_screen.dart` polls
`GET /api/requests/nearby` every 15s while the app is open, and again on
`AppLifecycleState.resumed`, announcing arrivals with a banner and the bell
badge. That covers the app-in-foreground case only. Backgrounded, killed, or
never-opened, the volunteer finds out by opening the app. The poll interval is
injected as `VolunteerHomeScreen.pollInterval` so tests can disable it.

**This matters more since matching became single-target (§4).** The poll is no
longer just a convenience over a five-volunteer fan-out — it is currently the
*only* way the one chosen volunteer ever hears about the request. There is no
second recipient to fall back on.

**Why the dependency was not just added.** The FlutterFire Gradle plugin
requires `google-services.json` at build time; without it the Android build
fails outright. Inventing placeholder credentials would break the build rather
than fix delivery, so this waits on real config.

**Fix, in order.**

1. Create the Firebase project and register the Android app under the existing
   `applicationId`, `com.example.sahayak_mobile`
   (`mobile/android/app/build.gradle.kts`), plus the iOS app
   (`com.example.sahayakMobile`, matching the bundle id). Use the real ids you
   intend to ship — this id is a placeholder and should be replaced before the
   Firebase project is created, not after.
2. Commit `google-services.json` and `GoogleService-Info.plist` (they are not
   secrets in the usual sense, but they are project-identifying; keep them out
   of public forks if that matters).
3. Add `firebase_core` + `firebase_messaging`; call
   `FirebaseMessaging.instance.requestPermission()` on iOS, then
   `getToken()` and `PATCH /api/users/me/fcm-token`.
4. Handle `onTokenRefresh` to keep the stored token current, and **clear the
   token on sign-out** (`SessionService.clear`) or the next person to use that
   phone receives another volunteer's requests.
5. Act on the `type=request_dispatched` data payload by deep-linking to
   `RequestDetailScreen`.
6. Treat an `UNREGISTERED`/404 response from FCM as "clear the stored token",
   and send a real push when the token is absent rather than dropping it — right
   now a missing token is indistinguishable from a delivered message.
7. Then delete the polling fallback, or keep it as the foreground backstop and
   say which is which.

**Done when.** The app is killed, a senior raises a request, the phone buzzes
within a second or two, and tapping it opens that request.

---

## 4. Must fix — dispatch radius runs on coordinates typed at registration

**Today.** `MATCH_RADIUS_M=5000` in `backend/.env`, and urgent requests double
it (`src/modules/matching/matching.service.ts`). A volunteer is only a candidate
if **all** of these hold:

- `users.is_active = true`
- `user_verifications.status = 'APPROVED'`
- **`volunteer_profiles.is_available = true`**
- no `ACCEPTED`/`IN_PROGRESS` assignment already
- within the radius of the request, measured against
  `COALESCE(current_*, base_*)`

**Changed on 2026-09-27: a request now goes to ONE volunteer, not a fan-out.**
`findCandidates` became `findBestCandidate` and the request is offered to the
nearest eligible volunteer only; `dispatch_batch` still exists but holds a single
entry. `DISPATCH_BATCH_SIZE` is gone. The reason this matters for the list below
is that it removes one failure mode and sharpens another:

- **Removed:** the same job being pushed at up to five phones at once, with
  whoever happened to be awake winning it. The senior was told "help is on the
  way" while three other volunteers were also being buzzed for the same errand.
- **Sharpened:** because there is now exactly one intended recipient, a *wrong*
  choice is worse than it was. If the nearest volunteer is chosen on a guessed
  coordinate, the request is now stuck with precisely the wrong person instead of
  quietly also reaching the right one. Real positions went from "improves
  ranking" to "the whole feature depends on it".

**Two traps, both silent.**

- **`is_available` defaults to `false`.** A volunteer who registers and never
  taps the availability toggle is never dispatched to, and never appears in
  `/nearby`. This is the single most common reason "requests are not being
  delivered". The app now shows an off-duty banner with a **Go on duty** button,
  but the server-side default is unchanged on purpose — going on duty is a
  deliberate commitment, not something a new account should do implicitly.
- **The radius is measured from a place name.** `current_latitude` is only
  written while a volunteer is mid-job (BR-09) and is stale after 10 minutes,
  so in practice it is `base_latitude`/`base_longitude` — the locality typed at
  registration. Same root cause as §2: a neighbourhood, not a point. A volunteer
  6 km away is simply invisible, with no explanation to anyone.

**Why it is worse than "nobody was told".** `markDispatched` sets the request to
`DISPATCHED` **with an empty batch** when there are no candidates. Since
`/nearby` requires membership in `dispatch_batch`, such a request can never be
seen by anyone. The senior's app shows it as dispatched and waiting, the sweep
retries on the same empty radius every `DISPATCH_TIMEOUT_S`, and after
`MAX_DISPATCH_ATTEMPTS=3` it lands in `UNASSIGNED` — which is terminal and has no
police recovery path (§5). So the worst case is roughly four and a half minutes
of a senior believing help is on the way, ending in a state nobody can act on.
The create response does return `dispatched_to`, so an empty array is
detectable, but nothing surfaces it to the senior today.

*Partial mitigation now in place.* The recovery sweep passes
`onlyIfCandidate`, so an `UNASSIGNED` request is no longer rewritten to
`DISPATCHED` before anyone is available — it stays put and is retried silently.
That closes the ping-pong, not the underlying problem: a request created where
nobody is eligible is still marked `DISPATCHED` and still invisible.

**Also worth knowing: `dispatch_batch` is not an authorisation check.** It
controls who *sees* a request in `/nearby` (Q-04), and it is what the accept and
decline paths read, but `acceptRequest` itself only checks
`status = 'DISPATCHED'` (`requests.service.ts:283`). Any on-duty volunteer who
learns a request id can accept it, even one it was never offered. Low practical
risk, since the id comes from `/nearby` or from police, but it means the batch is
a routing hint rather than a guarantee.

**Diagnose a specific volunteer with:**

```sql
select u.email,
       u.is_active,
       uv.status            as approval,
       vp.is_available,
       vp.base_latitude,
       vp.base_longitude
from users u
left join volunteer_profiles vp on vp.user_id = u.id
left join user_verifications  uv on uv.user_id = u.id
where u.role = 'volunteer';
```

All three must be non-default — `is_active`, `APPROVED`, `is_available` — and
the base coordinates must be within `MATCH_RADIUS_M` of the request. Then
compare against what the dispatcher actually chose. With single-target dispatch
the batch has one entry, and that entry is the whole story:

```sql
select hr.id, hr.status, hr.priority, hr.dispatch_attempt,
       hr.dispatch_batch, hr.created_at
from help_requests hr
where hr.dispatch_batch = '[]'::jsonb
order by hr.created_at desc;
```

Anything listed there was dispatched to nobody. To see who a live request is
waiting on:

```sql
select hr.id, hr.status, hr.dispatch_attempt,
       e->>'id' as waiting_on_volunteer
from help_requests hr,
     lateral jsonb_array_elements(hr.dispatch_batch) e
where hr.status = 'DISPATCHED';
```

**Fix.**

1. Real positions first — see §2. Everything else here depends on it, and under
   single-target dispatch it is now load-bearing rather than a ranking nicety.
2. Until then, police hand-assignment (P-05) is the only reliable path, and it
   bypasses the radius entirely. Make that the documented manual procedure.
3. Decide the no-candidates product rule, which §2.4 also raises: tell the
   senior immediately that nobody is available, escalate to the police queue,
   or keep waiting? Right now the answer is "silently wait, then UNASSIGNED".
4. Do not mark a request `DISPATCHED` on an empty batch — or at least carry an
   explicit `awaiting_volunteer` state, so "nobody available" stops looking
   identical to "help is on the way".
5. Decide what a *decline* means now that there is only one recipient. Today
   `declineRequest` deliberately leaves the request in `DISPATCHED` on the
   reasoning that "other volunteers can still take it" — with one recipient
   there are no others, so a decline currently just sits there until the sweep
   times it out. The decline should hand the request straight to the next
   volunteer instead.
6. Reconsider whether `MATCH_RADIUS_M=5000` is even right, given §2: a radius
   computed from guessed coordinates is a confident wrong answer.

**Done when.** A request created where no eligible volunteer exists says so
promptly and lands somewhere a human can act, instead of timing out into
`UNASSIGNED`.

---

## 5. Should fix — things found while building, not yet decided

- **`UNASSIGNED` is terminal, so police cannot rescue a failed dispatch.** BR-03
  gives `UNASSIGNED` no outgoing transitions, and P-05 rejects it. A request that
  exhausts `MAX_DISPATCH_ATTEMPTS` therefore has no recovery path except
  cancelling, which is exactly the senior our feature is meant to protect. Needs
  either an `UNASSIGNED -> DISPATCHED` transition or a police-only override;
  both are one-line changes plus a test.
- **`REQUESTS_DRY_RUN` is `false` in `.env` and `.env.example`.** It is
  `emptyToUndefined`, so the key being absent means "really send". Default it to
  `true` outside production, and set it explicitly per environment.
- **One shared police login, no password.** `POLICE_BOOTSTRAP_EMAIL` is
  `police@gmail.com` and sign-in is OTP-only, so whoever reads that mailbox is
  the officer, and there is exactly one officer account with no way to add or
  revoke another. Real deployment needs per-officer accounts and a way to set
  the first one up.
- **Signup/verification is an officer approving an OTP-less record.** There is
  no ID document check behind `user_verifications`, so "approved" currently
  means "an officer clicked Approve". Fine while the team is the only user
  base; it is not an identity check.
- **The notifier is fire-and-forget** (`void notify...` after commit), so a
  push failure is invisible — no retry, no dead-letter, no metric. This is
  separate from §3: even once a client sends a token, nothing verifies it
  arrived. The OTP/SMS path in §1 needs to be reliable, not best effort.

---

## 6. Nice to have

- Volunteer directory paging: `next_cursor` is always `null` and the limit is
  hardcoded, so the list silently truncates once there are many volunteers.
- `P-04` search does not match skills, though skills are collected.
- The police requests list is a single page with no date range or filter for
  "unassigned" — the exact queue a dispatcher wants is the one view that does
  not exist.

---

## Quick checklist before any real user sees this

- [ ] `RATE_LIMIT_DISABLED` removed from the env, and both limiters keyed on
      email as well as IP with values that suit a real deployment
- [ ] `web` bundle contains no `123456`; hint gated on `import.meta.env.DEV`
- [ ] Real OTP provider wired; `OTP_DEV_CODE` out of the deployed env
- [ ] `REQUESTS_DRY_RUN` explicitly `false` **only** in production
- [ ] Volunteer coordinates are real and fresh, or the no-distance UI is kept
      deliberately and this file's §2 is still open
- [ ] `UNASSIGNED` has a police recovery path
- [ ] Firebase config in the tree, `fcm_token` registration live, and a real
      push verified on a locked phone with the app killed (§3)
- [ ] A request with no eligible volunteer surfaces that fact to the senior
      instead of sitting `DISPATCHED` until `UNASSIGNED` (§4)
- [ ] A real OTP-to-accept request was completed end to end on a physical phone
