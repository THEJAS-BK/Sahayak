# Web police portal — page coverage

Verified by reading the code on 2026-09-27, and updated as work landed. This
supersedes the earlier "no backend list endpoints" claim, which was out of date.

## Status

| # | Page | Route | Endpoint | State |
|---|---|---|---|---|
| 1 | Dashboard | `/` | `GET /police/overview` (P-08, new), `GET /audit-logs` | built |
| 2 | Requests | `/requests` | `GET /police/requests` | built — **keyset pagination wired** |
| 3 | Request Detail | `/requests/:requestId` | `GET /requests/:id`, `GET /police/volunteers`, `PATCH /police/requests/:id/assign` | built |
| 4 | Verification | `/verification` | `GET /verifications`, `GET /verifications/:id` (V-02), `PATCH /verifications/:id` | built — **detail drawer + reject reason** |
| 5 | Emergencies | `/emergencies` | `GET /police/emergency-events` (E-02), `PATCH /police/emergency-events/:id` (E-03) | built |
| 6 | Seniors | `/seniors`, `/seniors/:seniorId` | `GET /police/seniors` (P-06), `GET /police/seniors/:id` (P-07) | built — **route added** |
| 7 | Volunteers | `/volunteers`, `/volunteers/:volunteerId` | `GET /police/volunteers` (P-04), `GET /police/volunteers/:id` (P-05b) | built — **detail route added** |
| 8 | Audit Logs | `/audit-logs` | `GET /audit-logs` (P-02) | built |
| 9 | Monitoring | `/monitoring` | `GET /police/requests` (P-01) | built |
| 10 | Map | `/map` | `GET /police/requests` (P-01), `GET /police/emergency-events` (E-02) | built — **Leaflet** |

All ten pages now have a real page behind a real endpoint, plus `/login` and a
404. Everything outside the route table renders `NotFound`, and the shell refuses
a non-police session.

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

## Second pass: Monitoring and Map

Both were left unbuilt the first time round, Monitoring because its purpose was
undefined and Map because a mapping library is a dependency decision. Both are
now built, and the reason each turned out not to need new backend work is the
same: the data the console already fetches was already there.

### `GET /api/police/overview` (P-08) — new

Monitoring did turn out to need one thing the Dashboard was faking. The stat
tiles were derived client-side from a single `P-01 GET /police/requests?limit=200`
page, so any total above the page size was wrong and nothing said so.

- `backend/src/modules/police/overview.service.ts` (new),
  `overview.routes.ts` (new), mounted in `backend/src/routes/index.ts`.
- Police-only, `requireActive`. Counts open / waiting-for-volunteer / in-progress
  / urgent / completed-in-window, plus emergencies awaiting review, pending
  verifications and available volunteers. All in SQL, so no page cap.
- Optional `from` / `to` bound the "completed today" tile. **If only one is
  supplied the whole window falls back to the server's own day** — mixing an
  officer's start bound against a UTC end bound would report a week of
  completions as "today".

### Monitoring — `/monitoring`

- Still no defined product of its own. It is a re-presentation of `P-01` as a
  board: waiting-for-volunteer / volunteer-on-it / offer-not-answered, with a
  stacked bar, polling every 15 s, and click-through to request detail.
- **The "Unassigned" label was wrong.** It counted `DISPATCHED` together with
  `UNASSIGNED`, but a `DISPATCHED` request has a *named* volunteer who has not
  answered yet. The segment is now "Offer not answered", and the stat tile says
  the same thing.
- **The old poll doubled itself on every tick.** `requests.length` was in the
  effect's dependency list, so each response tore down the interval and
  immediately re-fired. Filters now live in a ref, synced in an effect.
- Filtering and the date range moved server-side. A `to` of `2026-09-27T14:00`
  was read as 14:00 on the 27th, not the end of it, so the officer's last few
  hours were missing from the board.

### Map — `/map`

- **Leaflet**, added to `web/package.json`. No new endpoint: `P-01` and `E-02`
  already return coordinates.
- **Requests and emergencies only.** `base_*` / `home_*` on volunteers and seniors
  are registration-time estimates, often just a locality; `current_*` only exists
  once live position updates ship. Pinning an officer's map to them would read as
  live tracking that does not exist. Rows with no usable coordinates are counted
  on screen rather than dropped without explanation.
- Polls every 30 s, fits to the loaded points, layer toggles, popups deep-link to
  the detail pages.
- **Full-bleed.** The old page sat inside a padded `<main>` under the header, so
  it was a box in the middle of the screen. `Layout` now treats `/map` as
  immersive: no header, no padding, `100dvh`, isolated stacking context so
  Leaflet's `z-index` values stop competing with the sidebar.

## Not built, and why

Nothing remains in this list. The two entries below are kept because they record
why each page ended up shaped the way it did.

### Monitoring — purpose still undefined

The page is built, but nothing in the plans says what it is *for*. It is a
status board over `P-01`, which is useful, but a live request board, system
health and dispatch telemetry are three different products and only one of them
shipped. If the design settles on another, it should get its own endpoint rather
than another re-presentation of `P-01`.

Live position would need a push channel, which does not exist: the Firestore
mirror has been removed and push notifications are not implemented. That would
be built from scratch (server-sent events, or a WebSocket) rather than switched
on.

### Map — the dependency call, made

- **No new route is required.** `GET /police/requests` already returns
  `latitude`/`longitude` per request and `GET /police/emergency-events` already
  returns them per event. The map is a rendering concern over data the console
  can already fetch.
- A first version plots **requests and emergencies only**, as above.

## Client changes

First pass:

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

Second pass:

- `web/src/api/client.ts`: `fetchPoliceOverview`, `fetchVerification`,
  `reviewVerification` now sends `reason`, and `logout` calls `A-04`.
  Three latent bugs fixed while in there: the JWT role decoder did not handle
  base64url (`-`/`_`), so a role read off a token with either in its payload came
  back `undefined`; `setSession` left the previous `sahayak_user` in place when
  only a token was passed; and a hung request had no timeout, leaving a spinner on
  screen forever.
- `web/src/api/types.ts`: `PoliceOverview`, `VerificationDetail`, and
  `CurrentUser.verification_status`.
- Rewritten: `Map/index.tsx` (as `MapPage`), `Dashboard`, `Verification`,
  `Requests`, `Monitoring`, `Login`, `Header`, `Sidebar`, `App`.
- `Layout.tsx` + `index.css`: full-bleed `/map`, marker/pin styling,
  `.auth-screen` viewport fallback.
- `web/package.json`: **Leaflet** added.

## Deliberate UI constraints

- **No distance column on the volunteers list.** Volunteer positions are not
  reliable; `can_assign` from the server is the column that matters. Showing
  distance next to a registration-time locality would be false precision.
- **Keyset pagination, not offset**, on every list. A new SOS arriving while an
  officer is mid-scroll would otherwise shift rows and duplicate the one being
  read. `/requests` now actually follows `next_cursor`; it used to fetch a page,
  throw the cursor away, and show no way to reach the rest.
- **Search fields say what they search.** `GET /police/requests` has no `search`
  parameter, so the Requests search box is labelled "Search loaded rows" and
  filters the pages already in memory. Labelling it "Search" would imply a
  server-wide search that does not exist.
- **A failed poll keeps the last good data.** Both Monitoring and the header
  badge surface the error without blanking the board — a board that empties
  because one request timed out reads as "no emergencies", which is the one
  conclusion an operator must never draw by accident.
- **Volunteer "last reported" is labelled `(stale)`** outside 10 minutes, and the
  freshness is computed at fetch time rather than during render.
- **Aadhaar is never fetched or displayed**, and the backend does not send it.
- **The dev OTP is not compiled into production builds.** The old Login page
  hardcoded `123456`, pre-filled it into the field, and printed it on the card,
  so any deployed bundle could be guessed into. It is now read from
  `import.meta.env.VITE_OTP_DEV_CODE` and gated on `import.meta.env.DEV`.

## Verification

```bash
cd backend && npm run typecheck
cd backend && npm test            # blocked: needs DATABASE_URL_TEST, see below
cd web && npm run typecheck && npm run lint && npm run build
```

> `web`'s `typecheck` and `build` pass `--force` to `tsc -b` deliberately. A
> plain `tsc -b` is incremental and exits 0 off a stale `tsbuildinfo` **without
> checking the files you changed** — which is how five files stayed broken in the
> tree while this command reported success. If you run `tsc -b` by hand here,
> add `--force` or delete the `.tsbuildinfo` files. This was fixed in `bc6eaab`;
> the breakage itself had been in the tree since `368bbe5`.

`backend/tests/police-overview.test.ts` is new in the second pass and is written
but **not yet executed** — `backend/.env` has `DATABASE_URL_TEST=` empty, and the
suite guards against running against the shared Neon database because it truncates
every table. Point it at a dedicated test branch and the count below will include
it:

```bash
cd backend && DATABASE_URL_TEST='<test-branch-url>' npm test
```
