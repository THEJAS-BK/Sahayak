import type { MigrationBuilder } from 'node-pg-migrate'

export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable('user_verifications', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    role: { type: 'text', notNull: true, check: "role IN ('senior','volunteer')" },
    form_data: { type: 'jsonb', notNull: true },
    fcm_token: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'PENDING', check: "status IN ('PENDING','APPROVED','REJECTED')" },
    reviewed_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    reviewed_at: { type: 'timestamptz' },
    review_reason: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.createTrigger('user_verifications', 'user_verifications_set_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'set_updated_at',
    level: 'ROW',
  })
  pgm.createIndex('user_verifications', ['user_id'], {
    unique: true,
    where: "status IN ('PENDING','APPROVED')",
    name: 'idx_verifications_one_open_per_user',
    ifNotExists: true,
  })
  pgm.createIndex('user_verifications', ['status', 'created_at'], {
    name: 'idx_verifications_status_created',
    ifNotExists: true,
  })

  pgm.createTable('senior_profiles', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, unique: true, references: 'users', onDelete: 'CASCADE' },
    full_name: { type: 'text', notNull: true },
    phone_number: { type: 'text', notNull: true },
    home_latitude: { type: 'numeric', notNull: true, precision: 9, scale: 6 },
    home_longitude: { type: 'numeric', notNull: true, precision: 9, scale: 6 },
    preferred_language: {
      type: 'text',
      notNull: true,
      default: 'kannada',
      check: "preferred_language IN ('kannada','english','tulu')",
    },
    emergency_contact: { type: 'jsonb' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.createTrigger('senior_profiles', 'senior_profiles_set_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'set_updated_at',
    level: 'ROW',
  })

  pgm.createTable('volunteer_profiles', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, unique: true, references: 'users', onDelete: 'CASCADE' },
    full_name: { type: 'text', notNull: true },
    phone_number: { type: 'text', notNull: true },
    organization: { type: 'text' },
    skills: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
    id_proof_ref: { type: 'text' },
    base_latitude: { type: 'numeric', notNull: true, precision: 9, scale: 6 },
    base_longitude: { type: 'numeric', notNull: true, precision: 9, scale: 6 },
    current_latitude: { type: 'numeric', precision: 9, scale: 6 },
    current_longitude: { type: 'numeric', precision: 9, scale: 6 },
    location_updated_at: { type: 'timestamptz' },
    is_available: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  pgm.createTrigger('volunteer_profiles', 'volunteer_profiles_set_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'set_updated_at',
    level: 'ROW',
  })
}

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable('volunteer_profiles')
  pgm.dropTable('senior_profiles')
  pgm.dropTable('user_verifications')
}