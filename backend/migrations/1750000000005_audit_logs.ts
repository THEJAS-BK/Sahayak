import type { MigrationBuilder } from 'node-pg-migrate'

export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable('audit_logs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    actor_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    action: { type: 'text', notNull: true },
    entity_type: { type: 'text', notNull: true },
    entity_id: { type: 'uuid', notNull: true },
    before: { type: 'jsonb' },
    after: { type: 'jsonb' },
    metadata: { type: 'jsonb' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.createIndex('audit_logs', ['entity_type', 'entity_id'], { name: 'idx_audit_entity', ifNotExists: true })
  pgm.sql('CREATE INDEX idx_audit_created_at ON audit_logs (created_at DESC)')
  pgm.createIndex('audit_logs', ['actor_id'], { name: 'idx_audit_actor', ifNotExists: true })
}

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable('audit_logs')
}