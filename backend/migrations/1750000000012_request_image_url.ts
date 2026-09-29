import type { MigrationBuilder } from 'node-pg-migrate'

/**
 * Move request photos off Postgres and onto Cloudinary.
 *
 * Previously `request_photos` held the decoded bytes in a `bytea` column, one
 * photo per request, capped at 4 MB. Images now upload straight to Cloudinary
 * through multer and the request row carries the resulting URL, so the database
 * stops growing by megabytes per request and every client can render the photo
 * straight from the CDN.
 *
 * `image_public_id` is kept alongside the URL purely so a replaced photo can
 * have its previous Cloudinary asset destroyed; it is never returned to a
 * client, because a public id is enough to address the asset on its own.
 *
 * The old table is dropped rather than left empty: its only writer was the
 * base64 endpoint this replaces, so there is nothing left to read from it.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.addColumns('help_requests', {
    image_url: { type: 'text' },
    image_public_id: { type: 'text' },
  })

  pgm.dropTable('request_photos')
}

export const down = (pgm: MigrationBuilder): void => {
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

  pgm.dropColumns('help_requests', ['image_url', 'image_public_id'])
}
