# Connecting to PostgreSQL

Last verified: 2026-09-26

## The one thing to get right

Since 2026-09-26 the backend uses **port 5432**, the PostgreSQL 18 server
registered in pgAdmin as `postgres`, with the databases owned by the `postgres`
superuser.

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/sahayak        # in backend/.env
DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5432/sahayak_test
```

**Connect a GUI to 5432** — that is where the live data is.

The earlier 5432 attempt (2026-09-18) was abandoned mid-way and left fabricated
seeder rows behind. That database has since been dropped and rebuilt from
migrations, so those personas (`anitha.dev@example.com` and friends) are gone
for good. If you ever see them, you are looking at a different instance.

## The other server on this machine (5433)

A second, rootless cluster still exists on port 5433 (data dir
`backend/.pgdata`, started by `backend/scripts/dev-db.sh`, role `sahayak`, no
password). **Nothing points at it any more.** It is kept only as a fallback, so
reverting is a two-line change in `backend/.env` plus `npm run db:start`. Do not
run migrations against both at once and be surprised by divergent data.

## If you see fabricated data, you are on the wrong port

There is a **second, unrelated PostgreSQL server on port 5432** (the pgAdmin /
distro install, user `postgres`, password `postgres`). Nothing in the running
stack points at it. Its `sahayak` database still holds the personas from the
original fake-data seeder — `anitha.dev@example.com`, `ganesh.rao@example.com`,
`divya.poojary@example.com` and friends, 16 users / 13 requests / 17 audit rows
as of 2026-09-26.

Those rows are **not** what the app reads. They are a leftover from before the
seeder was replaced, left behind by the abandoned move to pgAdmin documented
below. Seeing them means your client is pointed at 5432.

Check which one you are on:

```bash
export PATH=/usr/pgsql-18/bin:$PATH PGPASSWORD=postgres

# Should contain police@gmail.com and nothing else.
psql -h 127.0.0.1 -p 5432 -U postgres -d sahayak -c \
  "SELECT email, role FROM users ORDER BY email;"

# Should be 0 in a freshly seeded database.
psql -h 127.0.0.1 -p 5432 -U postgres -d sahayak -c \
  "SELECT count(*) FROM help_requests;"
```

A correctly seeded dev database contains exactly one row in `users`
(`police@gmail.com`) and nothing in any business table — seniors and
volunteers only appear once a person registers through the real UI and an
officer approves them. See `backend/scripts/seed.ts`.

## Migrations and seed

```bash
cd backend
npm run db:migrate                 # 10 migrations
npm run db:seed                    # police account only; refuses if data exists
npm run db:seed:fresh              # wipe business tables, then bootstrap police
```

`POLICE_BOOTSTRAP_EMAIL` in `backend/.env` decides which account is created.

## Tests use a different database

`vitest.config.ts` points both `DATABASE_URL` and `DATABASE_URL_TEST` at
`sahayak_test` on the same server, so running the suite never touches dev data:

```bash
npm test                           # 68 tests, all against sahayak_test
```

## Connecting a GUI

| | |
|---|---|
| Host | `localhost` |
| Port | **5432** |
| User | `postgres` |
| Password | `postgres` |
| Database | `sahayak` (dev) or `sahayak_test` (tests) |

---
