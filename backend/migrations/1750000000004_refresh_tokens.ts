import type { MigrationBuilder } from 'node-pg-migrate'

export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable('refresh_tokens', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    family_id: { type: 'uuid', notNull: true },
    token_hash: { type: 'text', notNull: true, unique: true },
    expires_at: { type: 'timestamptz', notNull: true },
    consumed_at: { type: 'timestamptz' },
    revoked_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.createIndex('refresh_tokens', ['family_id'], { name: 'idx_refresh_tokens_family', ifNotExists: true })
  pgm.createIndex('refresh_tokens', ['user_id'], { name: 'idx_refresh_tokens_user', ifNotExists: true })
}

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable('refresh_tokens')
}