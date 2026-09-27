import type { MigrationBuilder } from 'node-pg-migrate'

/**
 * Transactional outbox for the Postgres -> Firestore mirror.
 *
 * PostgreSQL stays the source of truth. Every write to a mirrored table appends
 * a row here *in the same transaction*, so the queue can never drift from the
 * data and a rollback discards the queue entry with it. A drain worker then
 * replays entries into Firestore and marks them synced; because Firestore writes
 * are keyed on the primary key, replaying an entry is idempotent, so at-least-once
 * delivery is safe and a Firestore outage degrades to a stale mirror rather than
 * a failed request.
 *
 * Done as a trigger rather than as calls sprinkled through the services on
 * purpose: writes are spread over 13 modules and a hand-maintained list would
 * eventually miss one, which is exactly the kind of gap nobody notices until the
 * mirror is quietly wrong.
 *
 * Only the business tables are mirrored. `audit_logs`, `otp_codes`,
 * `otp_attempts` and `refresh_tokens` are high-churn and short-lived, and
 * mirroring them would turn every state change into a billed Firestore write for
 * data nobody inspects.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable('firebase_sync_outbox', {
    id: { type: 'bigserial', primaryKey: true },
    table_name: { type: 'text', notNull: true },
    op: { type: 'text', notNull: true, check: "op IN ('upsert','delete')" },
    /** Primary key of the mirrored row; composite keys are joined with '_'. */
    row_id: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    attempts: { type: 'integer', notNull: true, default: 0 },
    last_error: { type: 'text' },
    synced_at: { type: 'timestamptz' },
  })

  // The drain only ever looks at unsynced rows, oldest first, so the index is
  // partial: once an entry is synced it leaves the index entirely and the table
  // stops costing anything beyond storage.
  pgm.createIndex('firebase_sync_outbox', ['created_at', 'id'], {
    name: 'idx_firebase_sync_pending',
    where: 'synced_at IS NULL',
  })
  // Lets the drain collapse a burst of updates to the same row down to the last
  // one instead of replaying every intermediate state.
  pgm.createIndex('firebase_sync_outbox', ['table_name', 'row_id'], {
    name: 'idx_firebase_sync_row',
    where: 'synced_at IS NULL',
  })

  pgm.sql(`
    CREATE OR REPLACE FUNCTION firebase_sync_enqueue() RETURNS trigger AS $$
    DECLARE
      target_row_id text;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        -- request_declines is a pure join table with no surrogate key, so its
        -- identity is the pair. Every other mirrored table has an id column.
        IF TG_TABLE_NAME = 'request_declines' THEN
          target_row_id := OLD.request_id::text || '_' || OLD.volunteer_id::text;
        ELSE
          target_row_id := OLD.id::text;
        END IF;
        INSERT INTO firebase_sync_outbox (table_name, op, row_id)
        VALUES (TG_TABLE_NAME, 'delete', target_row_id);
        RETURN OLD;
      END IF;

      IF TG_TABLE_NAME = 'request_declines' THEN
        target_row_id := NEW.request_id::text || '_' || NEW.volunteer_id::text;
      ELSE
        target_row_id := NEW.id::text;

        -- A primary key can change (rare here, but help_requests and friends are
        -- not append-only). If it did, the old document is orphaned in
        -- Firestore, so queue its removal as well. Nested rather than combined
        -- with AND because the join table has no id at all, and touching
        -- OLD.id there raises "record old has no field id" — PostgreSQL is not
        -- required to short-circuit, so the guard has to be structural.
        IF TG_OP = 'UPDATE' THEN
          IF OLD.id IS DISTINCT FROM NEW.id THEN
            INSERT INTO firebase_sync_outbox (table_name, op, row_id)
            VALUES (TG_TABLE_NAME, 'delete', OLD.id::text);
          END IF;
        END IF;
      END IF;

      INSERT INTO firebase_sync_outbox (table_name, op, row_id)
      VALUES (TG_TABLE_NAME, 'upsert', target_row_id);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `)

  // A PL/pgSQL FOREACH keeps the mirrored set in one place; adding a table later
  // is a one-word change here rather than another hand-written trigger.
  pgm.sql(`
    DO $$
    DECLARE
      mirrored text[] := ARRAY[
        'users',
        'user_verifications',
        'senior_profiles',
        'volunteer_profiles',
        'help_requests',
        'emergency_events',
        'request_declines'
      ];
      target text;
    BEGIN
      FOREACH target IN ARRAY mirrored LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'firebase_sync_' || target, target);
        EXECUTE format(
          'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I
             FOR EACH ROW EXECUTE FUNCTION firebase_sync_enqueue()',
          'firebase_sync_' || target,
          target
        );
      END LOOP;
    END;
    $$;
  `)
}

export const down = (pgm: MigrationBuilder): void => {
  pgm.sql(`
    DO $$
    DECLARE
      mirrored text[] := ARRAY[
        'users',
        'user_verifications',
        'senior_profiles',
        'volunteer_profiles',
        'help_requests',
        'emergency_events',
        'request_declines'
      ];
      target text;
    BEGIN
      FOREACH target IN ARRAY mirrored LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'firebase_sync_' || target, target);
      END LOOP;
    END;
    $$;
  `)
  pgm.sql('DROP FUNCTION IF EXISTS firebase_sync_enqueue()')
  pgm.dropTable('firebase_sync_outbox')
}
