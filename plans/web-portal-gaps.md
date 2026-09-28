# Web police portal — page coverage

Verified by reading the code on 2026-09-27, and updated as work landed. This
supersedes the earlier "no backend list endpoints" claim, which was out of date.

## Status

| # | Page | Route | Endpoint | State |
|---|---|---|---|---|
| 1 | Dashboard | `/` | `GET /police/requests`, `GET /audit-logs` | built |
| 2 | Requests | `/requests` | `GET /police/requests` | built |
| 3 | Request Detail | `/requests/:requestId` | `GET /requests/:id`, `GET /police/volunteers`, `PATCH /police/requests/:id/assign` | built |
| 4 | Verification | `/verification` | `GET /verifications`, `PATCH /verifications/:id` | built |
| 5 | Emergencies | `/emergencies` | `GET /police/emergency-events` (E-02), `PATCH /police/emergency-events/:id` (E-03) | built |
| 6 | Seniors | `/seniors`, `/seniors/:seniorId` | `GET /police/seniors` (P-06), `GET /police/seniors/:id` (P-07) | built — **route added** |
| 7 | Volunteers | `/volunteers`, `/volunteers/:volunteerId` | `GET /police/volunteers` (P-04), `GET /police/volunteers/:id` (P-05b) | built — **detail route added** |
| 8 | Audit Logs | `/audit-logs` | `GET /audit-logs` (P-02) | built |
| 9 | Monitoring | — | — | **not built — undefined** |
| 10 | Map | — | none needed | **not built — needs a map library** |

Everything except Monitoring and Map now has a real page behind a real endpoint.

## Corrections to earlier docs

1. **"Emergencies has no backend list endpoint" was wrong.** E-02 and E-03 existed
   in `backend/src/modules/emergency/emergency.routes.ts:53` and `:66`, both
   `requireRole('police')`, both covered by `tests/emergency.test.ts:68`. The
   sidebar carried the stale claim as a code comment and greyed-out nav items;
   both are gone.

2. **The README has no `§2.3`.** A page-coverage table citing `/ route, §2.3`
   referred to section numbering that does not exist in the current `README.md`.

3. **`senior_profiles` has an `emergency_contact` jsonb column.** An earlier
   draft of this file claimed it had to be dug out of `user_verifications.form_data`.
   It is a real column; `GET /police/seniors/:id` returns it directly.

## Endpoints added in this pass

New, all police-only, all tested in `backend/tests/police-directory.test.ts`:

### `GET /api/police/seniors` and `GET /api/police/seniors/:id`

```ts
// GET /police/seniors?search=&status=PENDING|APPROVED|REJECTED|NONE&limit=&cursor=
{ seniors: [{ id, email, is_active, full_name, phone_number,
               home_latitude, home_longitude, preferred_language,
               is_verified, verification_status, request_count, created_at }],
  next_cursor: string | null }

// GET /police/seniors/:id
{ senior: { /* profile fields */, emergency_contact,
             verifications: [{ id, role, status, review_reason,
                               reviewer_email, reviewed_at, created_at }],
             requests: [...], emergencies: [...] } }
```

- `backend/src/modules/police/seniors.service.ts` (new; the `seniors/` module
  directory was previously empty).
- A `users` row with `role='senior'` and no `senior_profiles` row is **listed**,
  with null profile fields. That is the window between approval and completing
  the form, and hiding them would make the person unreviewable.
- `verification_status` is derived, never stored, so the `status` filter is
  expressed against the same `EXISTS` the SELECT uses. A filter that disagreed
  with the rows it returns would be worse than no filter.
- **`aadhaar_number` is deliberately not returned.** It is a government
  identifier with no use in the console; surfacing it would only widen the blast
  radius of a stolen police session. Asserted by a test that greps the whole
  response body.
- A volunteer id 404s, so the console cannot probe which user ids hold which role.

### `GET /api/police/volunteers/:id`

```ts
{ volunteer: { id, email, is_active, full_name, phone_number, organization,
               skills, club_id, id_proof_ref, is_available, is_verified,
               verification_status, base_latitude, base_longitude,
               current_latitude, current_longitude, location_updated_at,
               active_request_id,
               assignments: [{ request_id, category, status, created_at,
                               dispatched_at, accepted_at, completed_at,
                               distance_m, was_assigned, declined }] } }
```

- Assignment history is derived from `help_requests.dispatch_batch` via
  `jsonb_array_elements`, not a join table, because that is where dispatch
  already records who was offered what.
- `was_assigned` reads `assigned_volunteer_id`, coalesced to `false`. It was
  briefly batch position, which is wrong: a volunteer can be first in a batch,
  decline, and then be first in a later batch they also did not get.
- `declined` comes from a `request_declines` join, so an officer reviewing a slow
  dispatch can see "offered and said no" rather than an empty row.

## Not built, and why

### Monitoring — purpose undefined

Nothing in the plans says what this page shows: a live request status board,
system health, or dispatch telemetry are three different products. It was left
unbuilt rather than invented, because a guessed contract is harder to unpick
than a missing page.

If it means "live", the portal currently polls nothing and would need a push
channel. Nothing in the backend provides one: the Firestore mirror has been
removed and push notifications are not implemented, so this would be built from
scratch (server-sent events, or a WebSocket) rather than switched on.

### Map — no backend work needed, but a dependency decision

- **No new route is required.** `GET /police/requests` already returns
  `latitude`/`longitude` per request and `GET /police/emergency-events` already
  returns them per event. The map is a rendering concern over data the console
  can already fetch.
- `web/package.json` has no mapping library; adding Leaflet or MapLibre is a
  dependency decision, not a bug fix.
- A first version should plot **requests and emergencies only**. Volunteer
  markers would be misleading: `base_*` is whatever was typed at registration,
  often just a locality, and `current_*` only exists once live position updates
  ship.

## Client changes

- `web/src/api/client.ts`: `fetchEmergencyEvents`, `reviewEmergencyEvent`,
  `fetchSeniors`, `fetchSenior`, `fetchVolunteer`. `fetchAuditLogs` changed from
  `fetchAuditLogs(limit)` to `fetchAuditLogs(query)` so the dedicated page and
  the Dashboard share one call shape; `Dashboard/index.tsx` was updated.
- `web/src/api/types.ts`: `EmergencyEvent`, `PoliceSenior`, `SeniorDetail`,
  `VolunteerDetail`, `VolunteerAssignment`, `EmergencyStatus`, `EmergencyTrigger`,
  `VerificationDerivedStatus`.
- New pages: `Emergencies`, `Seniors`, `SeniorDetails`, `Volunteers`,
  `VolunteerDetails`, `AuditLogs`. Obsolete `.gitkeep` files removed.
- `App.tsx`: six routes added. `Sidebar.tsx`: `pending`/`SOON` machinery deleted
  — every nav item is now a real page.

## Deliberate UI constraints

- **No distance column on the volunteers list.** Volunteer positions are not
  reliable; `can_assign` from the server is the column that matters. Showing
  distance next to a registration-time locality would be false precision.
- **Keyset pagination, not offset**, on every list. A new SOS arriving while an
  officer is mid-scroll would otherwise shift rows and duplicate the one being
  read.
- **Volunteer "last reported" is labelled `(stale)`** outside 10 minutes, and the
  freshness is computed at fetch time rather than during render.
- **Aadhaar is never fetched or displayed**, and the backend does not send it.

## Verification

```bash
cd backend && npm test          # 132 tests, incl. police-directory.test.ts
cd web && npm run lint && npm run build
```
