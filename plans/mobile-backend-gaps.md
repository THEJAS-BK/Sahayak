# Mobile ↔ backend gaps

Backend issues found while auditing `mobile/` against the API, on 2026-09-29.
The mobile side of each one was already worked around in the app.

**Status: all three fixed** (backend and the mobile client that reads the
changed contract). The analysis below is kept as the record of why.

## 1. `POST /api/auth/refresh` omits `is_active` — fixed

`backend/src/modules/auth/auth.routes.ts:58`

```ts
ok(res, { access_token: accessToken, refresh_token: refreshToken, user: { id: user.id, role: user.role } })
```

The OTP verification response a few lines up (`:40-43`) *does* include it:

```ts
user: { id: user.id, role: user.role, is_active: user.isActive }
```

`refreshSession` already has `user.isActive` in scope — `rotateRefreshToken`
re-reads the row fresh (`tokens.service.ts:137`) rather than trusting the token
— so the field is available and the response simply drops it.

**Why it matters.** A client that treats the refresh response as the source of
truth for account state cannot learn that an account is still awaiting approval.
The app is left showing a dashboard it is not allowed to use, or retrying
requests that come back `ACCOUNT_INACTIVE`, until the user signs in again.

**Fix.** Done: the refresh response now mirrors the OTP-verify envelope
exactly, `user: { id, role, is_active, verification_status }`
(`auth.routes.ts`). The `api_client.dart` JWT-claim fallback is harmless and
was left in place, but is no longer load-bearing.

## 2. `refreshSession` will rotate tokens for an inactive account — fixed

`backend/src/modules/auth/auth.service.ts:92-95`

```ts
export async function refreshSession(rawToken: string): Promise<VerifiedSession> {
  const { refreshToken, user } = await rotateRefreshToken(pool, rawToken)
  return { user, accessToken: signAccessToken(user,'8h'), refreshToken }
}
```

There is no `is_active` check. The refresh itself returns `200` with a working
token pair; the account is only rejected later, by `requireActive`
(`backend/src/middleware/auth.ts:72-82`), which reads the `is_active` claim off
the access token and answers `403 ACCOUNT_INACTIVE`.

**Live today, for rejected applicants.** A rejected verification leaves
`is_active = false` and `role = null` (`verifications.service.ts:138-141` only
touches the user row on `APPROVED`), and the applicant still holds the refresh
token minted at OTP verification. So they can keep refreshing indefinitely and
get `200` every time. Combined with gap 1, nothing in the response tells them
they were rejected — the app has no way to route them back to the submitted
screen.

**Latent, for suspensions.** No code path currently sets `is_active = false`
(only the `= true` on approval exists), so this cannot yet hand a working
session to a *deactivated* account. It becomes exactly that as soon as a
deactivation or suspension feature lands, and it will not be caught, because
refresh is the path that looks like it validates the account.

**Fix.** Done (`auth.service.ts`):

```ts
if (!user.isActive) {
  await revokeRefreshToken(pool, rawToken)
  throw errors.forbidden('ACCOUNT_INACTIVE', 'Account is not yet approved or is inactive')
}
```

Revoking on the way out also stops the client from retrying in a loop.

## 3. `GET /api/me` mixes snake_case and camelCase — fixed

`backend/src/modules/users/users.routes.ts:16-23` returns the envelope in
snake_case, and hands `me.profile` through untouched. That profile object is
built by `shape()` (`users.service.ts:28-32`), which camelCases *every* column
of a `SELECT *`:

```ts
for (const [k, v] of Object.entries(row)) out[camel(k)] = v
```

So one response contains `is_active` and `verification_status` alongside
`profile.fullName`, `profile.phoneNumber`, `profile.homeLatitude`,
`profile.isAvailable`. Every other endpoint in the API is snake_case.

**Why it matters.** It is a silent failure, not an error: a client that reads
`profile.full_name` gets `null` and renders a blank profile with no signal that
anything is wrong. That is exactly what `mobile/lib/services/profile_service.dart`
was doing before this pass.

**Fix.** Done: snake_case wins, and `shape()` (`users.service.ts`) now passes
the profile row through under its native column names, so `GET /api/me` speaks
one convention end to end. `data/mobile/me.json` already documented the
snake_case shape, so this aligns the endpoint with the reference payload.

The mobile client was updated in the same change:
`profile_service.dart` reads `full_name`/`phone_number`/`home_latitude`/
`base_latitude`/`is_available`, and the fixtures in
`mobile/test/backend_contract_test.dart` and
`mobile/test/volunteer_request_flow_test.dart` now serve snake_case.

**Still worth doing.** `shape()` is still a blanket pass-through of
`SELECT *`, so a future column on the profile tables is published to the client
the moment it is added. An explicit column map would fail closed instead. The
Aadhaar number is the reason this has not already bitten — see below.

## Not a problem, checked

- **Aadhaar is not exposed by `/api/me`.** `shape()` passes a `SELECT *`
  through, which would publish any new sensitive column, but the Aadhaar
  number lives in `user_verifications.form_data`, not in
  `senior_profiles`/`volunteer_profiles` (`migrations/1750000000006_registrations.ts`).
  Worth keeping in mind if identity fields are ever migrated onto the profile
  tables.
- **`role` being `null` and `is_active` false before approval is by design**
  (BR-01), and `GET /api/registrations/me` is authenticated but not
  role-gated, so a pending applicant can discover their own status. The mobile
  app relies on that endpoint; no backend change needed.
- **The LiveKit token grants `canUpdateOwnMetadata`**, which the agent needs to
  receive the conversation-language attribute. Correct as issued.
