import type { MigrationBuilder } from 'node-pg-migrate'

export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'text', notNull: true },
    role: { type: 'text', check: "role IN ('senior','volunteer','police')" },
    is_active: { type: 'boolean', notNull: true, default: false },
    fcm_token: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.sql("CREATE UNIQUE INDEX idx_users_email_lower ON users (lower(email))")

  pgm.createTrigger('users', 'users_set_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'set_updated_at',
    level: 'ROW',
  })
}

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTrigger('users', 'users_set_updated_at')
  pgm.dropTable('users')
}