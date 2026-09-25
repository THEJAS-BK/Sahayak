import type { MigrationBuilder } from 'node-pg-migrate'

export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable('help_requests', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    senior_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    category: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true },
    details: { type: 'jsonb' },
    latitude: { type: 'numeric', notNull: true, precision: 9, scale: 6 },
    longitude: { type: 'numeric', notNull: true, precision: 9, scale: 6 },
    priority: { type: 'text', notNull: true, default: 'normal', check: "priority IN ('normal','urgent')" },
    source: { type: 'text', notNull: true, check: "source IN ('voice_agent','flutter_app')" },
    status: {
      type: 'text',
      notNull: true,
      default: 'PENDING',
      check:
        "status IN ('PENDING','MATCHING','DISPATCHED','ACCEPTED','IN_PROGRESS','COMPLETED','CANCELLED','UNASSIGNED')",
    },
    assigned_volunteer_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    dispatch_attempt: { type: 'integer', notNull: true, default: 0 },
    dispatched_at: { type: 'timestamptz' },
    dispatch_batch: { type: 'jsonb' },
    accepted_at: { type: 'timestamptz' },
    completed_at: { type: 'timestamptz' },
    cancelled_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.createTrigger('help_requests', 'help_requests_set_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'set_updated_at',
    level: 'ROW',
  })
  pgm.createIndex('help_requests', ['senior_id'], {
    unique: true,
    where: "status IN ('PENDING','MATCHING','DISPATCHED','ACCEPTED','IN_PROGRESS')",
    name: 'idx_help_requests_one_open_per_senior',
    ifNotExists: true,
  })
  pgm.createIndex('help_requests', ['status', 'dispatched_at'], {
    name: 'idx_help_requests_status_dispatched',
    ifNotExists: true,
  })
  pgm.createIndex('help_requests', ['assigned_volunteer_id'], {
    name: 'idx_help_requests_assigned_volunteer',
    ifNotExists: true,
  })
  pgm.sql('CREATE INDEX idx_help_requests_created_at ON help_requests (created_at DESC)')
}

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable('help_requests')
}