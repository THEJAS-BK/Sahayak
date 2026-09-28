import type { MigrationBuilder } from 'node-pg-migrate'

export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable('otp_codes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'text', notNull: true },
    code_hash: { type: 'text', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true },
    used: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.sql('CREATE INDEX idx_otp_codes_email_created ON otp_codes (email, created_at DESC)')
  pgm.createIndex('otp_codes', ['email'], { where: 'used = false', name: 'idx_otp_codes_email_unused', ifNotExists: true })

  pgm.createTable('otp_attempts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'text', notNull: true },
    success: { type: 'boolean', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.createIndex('otp_attempts', ['email', 'created_at'], {
    name: 'idx_otp_attempts_email_created',
    ifNotExists: true,
  })
}

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable('otp_attempts')
  pgm.dropTable('otp_codes')
}