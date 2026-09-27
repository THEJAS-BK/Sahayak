# Connecting to PostgreSQL

Last verified: 2026-09-27

## Where the database lives

One **shared Neon Postgres**. Everyone — every teammate, and the demo — points
at the same database. There is no local Postgres instance any more.

Get the connection string from the Neon dashboard. Use the **pooled** endpoint
(the hostname containing `-pooler`); it is the right one for a server that holds
a handful of connections and uses transactions properly. The direct endpoint is
only needed for operations a transaction pool cannot perform.

```env
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require
```

Connect a GUI (pgAdmin, DBeaver, TablePlus) with the same string.

## The test database is a different database

`DATABASE_URL_TEST` must point at a **separate** database — a Neon test branch,
created in the Neon console.

```env
DATABASE_URL_TEST=postgresql://USER:PASSWORD@ep-yyy-pooler.REGION.aws.neon.tech/neondb?sslmode=require
```

This is not a formality. Tests truncate every table, so pointing
`DATABASE_URL_TEST` at the shared database would delete the seeded police
account and every teammate's work on the next `npm test`. The backend now
refuses to start if the two URLs resolve to the same database, and there is no
longer any fallback from one to the other.

Tests do not create or drop the test database. A transaction pool (which is what
the pooled endpoint is) cannot run `CREATE DATABASE` or `DROP DATABASE` at all,
and Neon has no `postgres` maintenance database to connect to in order to try.
So the test database is provisioned once and every run is migrations plus a
truncate — which is what the tests already did for isolation.

## Destructive commands are refused

`npm run db:reset` (`DROP SCHEMA public CASCADE`) and `npm run db:seed:fresh`
(truncate everything) are refused by default, because on a single shared
database they destroy other people's work irreversibly. Force them only when you
are certain the data is disposable:

```bash
SAHAYAK_ALLOW_DESTRUCTIVE=1 npm run db:reset
```

## What every teammate needs in `.env`

Distribute this as a complete file, so nobody has to guess. These fields must be
**byte-identical on every machine**:

| Variable | Why it must match |
|---|---|
| `DATABASE_URL` | the shared database |
| `JWT_SECRET` | sessions are signed with it — a mismatch means one machine rejecting another's tokens, with no obvious cause |
| `OTP_DEV_CODE` | otherwise everyone's dev OTP differs |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | the backend that mints join tokens must match the LiveKit instance |

These are per-machine and can differ: `PORT`, `CORS_ORIGIN`, and the path in
`FIREBASE_SERVICE_ACCOUNT_JSON` (send the key file separately).

`DATABASE_URL_TEST` should also be the same test branch for everyone — it holds
no real data.

## Earlier local instances

The local clusters on `:5432` and `:5433` are gone, along with
`backend/scripts/dev-db.sh` and the repo's `docker-compose.yml`. History of that
setup, including the abandoned first attempt and the fabricated seeder rows it
left behind, is in git history if it is ever needed.
