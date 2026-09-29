import type { MigrationBuilder } from 'node-pg-migrate'

/**
 * One photo per help request, stored inline as bytea.
 *
 * Postgres is the only storage the backend has (no S3/blob service is
 * provisioned), so the image bytes live next to the data they belong to.
 * The client compresses before upload and the API caps the decoded size,
 * which keeps rows small enough for bytea to be a non-issue at this scale.
 * Replacing the photo upserts on request_id.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable('request_photos', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    request_id: {
      type: 'uuid',
      notNull: true,
      unique: true,
      references: 'help_requests',
      onDelete: 'CASCADE',
    },
    uploaded_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    content_type: {
      type: 'text',
      notNull: true,
      check: "content_type IN ('image/jpeg','image/png','image/webp')",
    },
    data: { type: 'bytea', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
}

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable('request_photos')
}
