# PostgreSQL → Firestore dual-write

## Status

Implemented, **inert by default**. The trigger and the queue are live; the drain
only runs when `FIREBASE_SYNC_ENABLED=true`. Nothing has been written to
Firestore yet, because the Firestore database does not exist yet.

## The problem

The Flutter app currently talks only to the Express backend, which means the
backend is a hard dependency: no network, no help requests. Firestore gives the
app direct reads (and eventually direct writes) with client-side caching, so a
senior in a patchy-signal area can still see their request and the volunteers
nearby can still see the job.

Firestore is therefore used as a **read-side replica only**. All writes continue
to go through the backend, which keeps every existing invariant — matching,
rate limits, audit logging, FCM dispatch — in one place.

## Architecture

```
service / script
      │  write
      ▼
┌──────────────┐   AFTER INSERT/UPDATE/DELETE trigger, same transaction
│  PostgreSQL  │ ──────────────────────────────────────┐
│ source of    │                                       │ INSERT
│ truth        │◄── drain re-reads current row state ──┤
└──────────────┘                                       ▼
                                            ┌───────────────────────┐
                                            │ firebase_sync_outbox │
                                            │ pending / attempts / │
                                            │ last_error / synced_at│
                                            └───────────┬───────────┘
                                                        │ batch, idempotent set()
                                                        ▼
                                                ┌─────────────┐
                                                │  Firestore  │ replica
                                                └─────────────┘
```

### Why an outbox instead of writing to Firestore in the request path

A Postgres row and a Firestore document cannot be committed atomically. Writing
to Firestore inline would mean either a request that returns 500 after Postgres
already committed, or a request that reports success while the replica silently
disagrees. The outbox makes the queue a *transactional* consequence of the
write: if the transaction rolls back, the queue entry rolls back with it, so the
mirror can never replay a change that Postgres itself discarded.

It also means a Firestore outage degrades to a stale replica instead of a
failing request. The help-request path does not gain a new external dependency.

### Why a trigger instead of service-level calls

Writes to these seven tables are spread across 13 modules. A hand-maintained
list of "remember to call the mirror here" would eventually miss one, and the
resulting bug is a replica that is quietly wrong with no error anywhere. A
trigger cannot be forgotten.

## Mirrored tables

| Table | Collection | Firestore document ID |
|---|---|---|
| `users` | `users` | `id` |
| `user_verifications` | `user_verifications` | `id` (own surrogate, **not** `user_id`) |
| `senior_profiles` | `senior_profiles` | `id` |
| `volunteer_profiles` | `volunteer_profiles` | `id` |
| `help_requests` | `help_requests` | `id` |
| `emergency_events` | `emergency_events` | `id` |
| `request_declines` | `request_declines` | `request_id` + `_` + `volunteer_id` |

Deliberately **not** mirrored: `audit_logs`, `otp_codes`, `otp_attempts`,
`refresh_tokens`. These are high-churn, short-lived, and not useful to the app
(OTP codes must not leave Postgres). Mirroring them would turn every state
change into a billed Firestore write for data nobody reads.

### Conversion rules

Postgres types do not survive a round trip to Firestore intact, so the writer
normalises them (`src/modules/firebase-sync/firestore.ts`):

- `numeric` → `number`. `pg` returns these as **strings**; left alone, every
  distance calculation in Firestore yields `NaN` without raising an error. A
  non-numeric value is passed through as a string rather than becoming `NaN`.
- `timestamptz` → ISO 8601 string. Firestore stores Timestamp objects, but the
  mobile client compares against `DateTime.parse` output, so a stable string
  keeps both sides agreeing.
- `jsonb` stays an object, so nested data (`dispatch_batch`) remains queryable
  and indexable.
- `users` additionally gets a derived `emailLower`. Firestore has no
  case-insensitive index, so every "find this user by email" query has to
  normalise the search term on both sides.

## Consistency model

- **At-least-once delivery, idempotent writes.** Every write is a `set()` keyed
  on the document ID, so replaying an entry — after a crash, a retry, or an
  overlapping drain — converges instead of duplicating.
- **Deletes win.** If a row was updated and then deleted within one batch, the
  collapse step emits a delete. Applying the upsert instead would resurrect a
  document that must not exist.
- **Latest state, not captured state.** The drain re-reads each row from
  Postgres instead of trusting what the trigger recorded. By the time an entry
  drains the row may have moved on, and re-reading is both correct and
  self-healing. A row deleted between enqueue and drain is treated as resolved:
  the trigger has already queued its delete, and leaving the entry pending would
  retry it every tick until it was dead-lettered as if it had failed.
- **A burst collapses.** A request moving PENDING → MATCHING → DISPATCHED
  enqueues three entries for one document; only the final state is written.
- **Bounded retries.** After `FIREBASE_SYNC_MAX_ATTEMPTS` (default 5) failures an
  entry is dead-lettered, counted by `firebase:sync:status`, and only requeued
  deliberately via `npm run firebase:sync:retry`. Nothing is ever silently
  dropped.
- **Concurrent drains are safe.** `FOR UPDATE SKIP LOCKED` lets each drain take
  a disjoint set of rows instead of blocking on rows another drain holds.

## Configuration

All in `backend/.env`; see `backend/.env.example`.

| Variable | Default | Meaning |
|---|---|---|
| `FIREBASE_SYNC_ENABLED` | `false` | Master switch. When false the queue still fills and nothing drains. |
| `FIREBASE_DATABASE_ID` | `(default)` | Firestore database ID. |
| `FIREBASE_SYNC_INTERVAL_S` | `30` | Drain interval in seconds. |
| `FIREBASE_SYNC_BATCH` | `200` (max 400) | Rows per drain. |
| `FIREBASE_SYNC_MAX_ATTEMPTS` | `5` | Failures before dead-lettering. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | — | Path to the service-account key, or the JSON itself. `FCM_SERVICE_ACCOUNT_JSON` is still accepted as a fallback. |
| `FCM_ENABLED` | `false` | Whether push actually sends. Independent of the credential, so enabling the mirror does not enable push. |

The key is shared with push — the same service account authorises both messaging
and Firestore — but the two features no longer share a single switch. Push is
off unless `FCM_ENABLED` is explicitly set, so pointing the mirror at a service
account does not quietly start delivering notifications.

`secrets/` and `*service-account*.json` are gitignored. Never commit the key.

## Operating it

```bash
npm run firebase:sync:status     # queue depth, oldest lag, dead-letter count
npm run firebase:backfill        # one-time export of pre-existing rows
npm run firebase:sync:retry      # requeue dead-lettered entries
```

`npm run firebase:backfill` reads the tables directly instead of going through
the outbox. The trigger only records writes made from the moment it was
installed, so on a database that already holds data the queue starts with no
history and the mirror would be missing every pre-existing row. It is safe to
re-run: every document is written with `set()` on a primary-key ID, so a second
run converges. Afterwards it marks the pre-backfill queue entries synced, since
those rows are already in Firestore.

## Enabling it

1. In Firebase Console → **Firestore Database** → Create database → region
   **`asia-south1` (Mumbai)**. Firestore offers `asia-south1` as a location
   choice, which is why it was selected over the RTDB default.
2. Project settings → Service accounts → Generate new private key. Save it
   **outside** the repo, e.g. `backend/secrets/firebase.json`.
3. Point the app at it:
   ```
   FIREBASE_SERVICE_ACCOUNT_JSON=./secrets/firebase.json
   FIREBASE_SYNC_ENABLED=true
   ```
4. `npm run firebase:backfill`, then `npm run firebase:sync:status` and confirm
   `pending` drains to 0.

## Tests

`backend/tests/firebase-sync.test.ts` covers the Postgres half — trigger
enqueue on insert/update/delete, the `request_declines` composite key, the
guarded `OLD.id` reference, transaction rollback discarding the queue entry, the
collapse rules, and the conversion helpers. **Firestore is never contacted**, so
the suite needs no service account and runs with the mirror disabled.

## Known gaps

- The client still reads only from the Express API. Firestore is populated but
  unused; switching the app to direct reads is a separate, later change.
- `FOR UPDATE SKIP LOCKED` serialises the *claim* in Postgres, but the Firestore
  write happens after that transaction commits. Two drains racing can therefore
  both apply the same entry. This is harmless — writes are idempotent — but if
  concurrent drains ever become a throughput problem, add a durable lease
  (`claimed_at` + `claimed_by`) instead of relying on the row lock.
- There is no end-to-end test against a real Firestore instance, because no
  service account is committed and tests must run without credentials.
