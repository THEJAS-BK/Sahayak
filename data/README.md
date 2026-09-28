# Dummy Data

Hand-curated dummy data for frontend development, mirroring the API contracts in
`plans/api-plan.md` and the UI wireframes in `plans/client-design/`.

## Layout

```
data/
├── README.md
├── mobile/        # Flutter app (senior + volunteer)
└── web/           # Police/admin portal (React)
```

## Conventions

- Every role/profile/request id uses the readable pattern `sen-0001`,
  `vol-0001`, `pol-0001`, `req-1024`, `evt-0001`, `ver-0001` — replace with
  real UUIDs when wiring to the API.
- Phone numbers use the `+9198xxxxxxxx` format.
- `aadhaar_number` is always a 12-digit string.
- Coordinates are `numeric(9,6)` lat/lng around Udupi district, Karnataka
  (Shirva, Udupi, Manipal, Kaup, Brahmavar).
- Timestamps are ISO 8601 UTC.
- The same fake people (`anitha` / `karthik` / ...) appear consistently across
  every file so screens can be cross-referenced.

## Mobile

| File | Purpose |
|---|---|
| `auth.json` | OTP request/verify + `/me` sample payloads |
| `registrations.json` | Senior/volunteer registration forms incl. `aadhaar_number`, `club_id` |
| `help-requests.json` | Senior's own requests (`Q-02` list) + create payload (`Q-01`) |
| `nearby-requests.json` | Dispatched requests near a volunteer (`Q-04`) |
| `emergencies.json` | Emergency event logging (`E-01`) |
| `me.json` | `/me` snapshot for a senior and a volunteer |

## Web

| File | Purpose |
|---|---|
| `dashboard.json` | Dashboard summary cards + lists (`web-portal.md` §4) |
| `verifications.json` | Registration list/detail + approve/reject (`V-01..V-03`) |
| `help-requests.json` | Monitoring queue + request detail (`P-01`) |
| `senior-profiles.json` | Senior profile + history + map markers (`web-portal.md` §9/§10) |
| `emergencies.json` | Emergency event list/detail (`E-02`) |
| `audit-logs.json` | Audit trail (`P-02`) |

## Notes

- This data is illustrative only and is not covered by the backend test suite.
- The same personas can be loaded into the dev database by
  `backend/scripts/seed.ts`, run via `npm run db:seed` /
  `npm run db:seed:fresh` — it is not a 1:1 dump of these files, but an
  equivalent snapshot with real UUIDs and `now()`-relative timestamps.
- Keep files in sync with `plans/api-plan.md` when contracts change.