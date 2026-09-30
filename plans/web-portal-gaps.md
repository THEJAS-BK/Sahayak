# Web police portal — page coverage

Verified by reading the code on 2026-09-27, and updated as work landed. This
supersedes the earlier "no backend list endpoints" claim, which was out of date.
Re-verified against the backend routes and zod schemas on 2026-09-30.

## Status

| # | Page | Route | Endpoint | State |
|---|---|---|---|---|
| 1 | Dashboard | `/` | `GET /police/overview` (P-08, new), `GET /police/requests` (recent rows) | built — **shared overview poller** |
| 2 | Requests | `/requests` | `GET /police/requests` | built — **keyset pagination wired** |
| 3 | Request Detail | `/requests/:requestId` | `GET /requests/:id`, `GET /police/volunteers`, `PATCH /police/requests/:id/assign` | built |
| 4 | Verification | `/verification` | `GET /verifications`, `GET /verifications/:id` (V-02), `PATCH /verifications/:id` | built — **detail is a modal, not a route** |
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

## Third pass: design system and console rebuild

No endpoint changed in this pass. Every page was rewritten onto a shared
primitive set, and the bugs found were all in how the frontend talked to
endpoints that already existed.

### `web/src/index.css`

Rebuilt as a token layer: semantic names (`--color-navy`, `--color-ink-muted`,
`--color-rule`, `--radius-panel`, `--shadow-overlay`, `--text-*`) over raw
values, plus `:focus-visible` rings, `prefers-reduced-motion`, Leaflet chrome
styling, `.tnum` / `.mono` / `.sr-only` utilities, and compatibility aliases for
the old raw names still referenced from behind the refactor.

### `web/src/components/ui/`

`Badge`, `Button`, `Card`, `Table`, `Section`, `Field`, `Modal`, `Alert`,
`EmptyState`, `Skeleton`, `PageHeader`, `StatTile`, `SearchInput`, `FilterChip`,
`AgeCell`. Seniors and Volunteers each carried a byte-identical private
`FilterChip`; Monitoring's used `aria-pressed` while the others announced no
state at all. Hue encodes lifecycle, not interactivity: a status badge is the
only thing in the console that uses colour to mean "state".

`Alert` grew a `note` role — a standing caveat that must reach a screen reader
but must not be announced assertively, or a page that mounts with one shoves
every other announcement off the queue.

### Bugs fixed, all frontend-side

- **`/police/overview` was reporting the wrong day.** The backend falls back to
  the *server's* day when `from`/`to` are absent, and Neon runs UTC — so
  "completed today" was wrong for every officer east of UTC+0 for eight hours
  after midnight local. `localDayWindow()` in `lib/format.ts` now sends the
  browser's day, and `useOverview` uses it.
- **`dayEnd()` excluded the last day.** `2026-09-27T14:00` was read as 14:00 on
  the 27th rather than the end of it, so an officer's final hours were missing
  from every date-filtered board.
- **`AgeCell` called `Date.now()` during render.** The prop was already threaded
  from the fetch, but `now` was optional with a `Date.now()` fallback, so the
  fallback silently reintroduced the drift the prop existed to prevent. `now` is
  now required, which is also why the three call sites assert it: the rows only
  exist once a fetch has landed.
- **`Verification` had a route but no screen.** `/verification/:verificationId`
  was registered and the file deleted in an earlier pass; the detail view is a
  modal reached from a queue row, so the route is now gone rather than dead.
- `Header`, `Map` and `AuditLogs` referenced tokens that were never defined
  (`--shadow-md`, `--color-text`), which resolved to nothing at paint time.

### Shell

`Header` owns the page title, the live attention count and the server freshness
timestamp. `OverviewProvider` wraps the authenticated tree and polls `P-08` every
30 s so the badge, the Dashboard tiles and Monitoring share one request instead
of three. `RequireAuth` rejects a non-police session at the router, with a
sign-out button, because every route behind it would otherwise render a shell of
empty pages and 403s.

### Code splitting

Every route was eagerly imported, so Leaflet shipped to officers who never opened
the map: 536 kB / 157 kB gzipped in one chunk. Routes are now `React.lazy`, with
the `Suspense` boundary *inside* `Layout` so an arriving chunk does not blank the
sidebar and header the officer is navigating with.

```text
before   index.js  278 kB │ gzip  88 kB   (was 536 kB │ gzip 157 kB)
         Map.js    165 kB │ gzip  49 kB   (Leaflet, loaded only on /map)
```

`Login` stays eager — it is where an unauthenticated officer lands, so making it
wait on a chunk request adds a round trip to the one screen with nothing to show
first.

### Contract audit

Every function in `web/src/api/client.ts` was checked against the mounted route
and its zod schema. All paths, query parameters, response wrappers, and status
enums match; `RequestStatus` is identical to the backend enum and
`RequestPriority` is lowercase as the backend expects. Two things worth recording
because they are easy to get wrong:

- **`actor_id='null'`** is a literal string, not the string `"null"`. `P-02`
  translates it to SQL `NULL`. The Audit page sends it as typed.
- **`INVALID_OTP` is deliberately not `UNAUTHENTICATED`.** The client discards the
  session on a 401 `UNAUTHENTICATED`, so a mistyped code at sign-in would throw
  away a valid session and claim the token expired.

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
- **`GET /verifications` takes no `search`.** The queue's search box says so in
  its placeholder and filters the loaded page, for the same reason the Requests
  one is labelled "Search loaded rows". Paging the whole table to filter it would
  be worse than the limitation.
- **A senior with no emergency contact is called out**, not shown as a dash. It
  is a gap an officer can act on, unlike an optional field that is simply blank.
- **Volunteer base coordinates carry a standing caveat** on the detail page. They
  are whatever was typed at registration and are often only a locality. The
  dispatch `distance_m` is real and is not caveated.
- **`REVIEWED` on an emergency event is neutral, not resolved.** It means an
  officer has seen it. Green there would claim the senior is safe.

## Known limitations

1. **No automated tests for `web/`.** No test runner and no component tests exist
   for the console; the refactor's verification is typecheck, lint, build, and the
   contract audit above. Worth adding before the next round of UI work.
2. **`oxlint` warns on every page's fetch-on-mount** (`set-state-in-effect`) and
   on `useOverview.tsx` (`only-export-components`). Both are the rule
   over-reaching: synchronising with the API *is* the external-system case the
   rule's own help text describes, and the second is only about fast-refresh
   ergonomics while editing. No errors.
3. **`Monitoring` still has no defined product** — see below.
4. **No live position.** `current_*` only exists once a push channel ships.


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
