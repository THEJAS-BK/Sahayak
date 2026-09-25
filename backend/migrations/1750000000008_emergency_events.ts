import type { MigrationBuilder } from 'node-pg-migrate'

export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable('emergency_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    senior_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    trigger_type: {
      type: 'text',
      notNull: true,
      check: "trigger_type IN ('semantic_llm','acoustic_distress','keyword_repetition')",
    },
    source: { type: 'text', notNull: true, check: "source IN ('voice_agent','flutter_app')" },
    help_request_id: { type: 'uuid', references: 'help_requests', onDelete: 'SET NULL' },
    detail: { type: 'jsonb' },
    latitude: { type: 'numeric', precision: 9, scale: 6 },
    longitude: { type: 'numeric', precision: 9, scale: 6 },
    escalated_to_112: { type: 'boolean', notNull: true, default: true },
    escalated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    status: { type: 'text', notNull: true, default: 'LOGGED', check: "status IN ('LOGGED','REVIEWED')" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.createTrigger('emergency_events', 'emergency_events_set_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'set_updated_at',
    level: 'ROW',
  })
  pgm.createIndex('emergency_events', ['status'], { name: 'idx_emergency_status', ifNotExists: true })
  pgm.sql('CREATE INDEX idx_emergency_senior_created ON emergency_events (senior_id, created_at DESC)')
}

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable('emergency_events')
}