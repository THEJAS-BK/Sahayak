# Connecting to the pgAdmin PostgreSQL Instance

Date: 2026-09-18

## Goal

Point the Sahayak backend at the pgAdmin-managed PostgreSQL instance instead of the rootless dev DB (`scripts/dev-db.sh`) that runs on port 5433.

## Prerequisites

- pgAdmin installed with a PostgreSQL server listening on `localhost:5432`
- Database role credentials: user `postgres`, password `postgres`
- Backend repo at `backend/`

## Steps

### 1. Verify the connection

```bash
PGPASSWORD=postgres /usr/pgsql-18/bin/psql -h localhost -p 5432 -U postgres -d postgres -c "SELECT version();"
```

Succeeded: `PostgreSQL 18.6 on x86_64-pc-linux-gnu ...`

If authentication fails (`FATAL: password authentication failed for user "postgres"`),
the DB role password differs from what was typed in pgAdmin — confirm the role password
in pgAdmin → Server → Properties → Connection.

### 2. Create the databases (idempotent)

```bash
for db in sahayak sahayak_test; do
  exists=$(PGPASSWORD=postgres /usr/pgsql-18/bin/psql -h localhost -p 5432 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'")
  if [ "$exists" = "1" ]; then
    echo "database '$db' already exists"
  else
    PGPASSWORD=postgres /usr/pgsql-18/bin/createdb -h localhost -p 5432 -U postgres "$db" && echo "created '$db'"
  fi
done
```

### 3. Point `backend/.env` at the new instance

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/sahayak
DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5432/sahayak_test
```

### 4. Apply migrations

```bash
cd backend && npm run db:migrate
```

Result: all 9 migrations applied (`bootstrap … registration_identity_fields`).

### 5. Seed demo data (optional)

Load the `data/` personas into the dev database so the frontend has realistic
rows to render:

```bash
cd backend && npm run db:seed        # fails if tables already contain data
cd backend && npm run db:seed:fresh  # wipes business tables, then reseeds
```

Seeds: 1 police officer, 5 seniors, 4 volunteers, 3 pending registrations,
requests in every state, emergencies and audit logs — see
`backend/scripts/seed.ts`. Note the dev server's BG-01 sweep re-dispatches and
eventually `UNASSIGN`s seeded `DISPATCHED` requests; stop it before seeding if
you need that state to persist.

### 6. Restart the backend

```bash
cd backend && npm run dev
```

## Result

- Dev database: `postgres://postgres:postgres@localhost:5432/sahayak`
- Test database: `postgres://postgres:postgres@localhost:5432/sahayak_test`
- Inspect via pgAdmin (localhost:5432, user `postgres`) or psql
- The rootless DB (port 5433) remains untouched; don't run both migrations on the same schema