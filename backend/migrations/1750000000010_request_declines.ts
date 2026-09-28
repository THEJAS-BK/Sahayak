import type { MigrationBuilder } from 'node-pg-migrate'

/**
 * Per-volunteer declines.
 *
 * A decline is not a request status: the request is still live and other
 * volunteers can take it, so `help_requests.status` stays DISPATCHED. What we
 * need to remember is "this particular volunteer was asked and said no",
 * otherwise /nearby keeps offering it and the volunteer is asked again on
 * every refresh.
 */
export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable('request_declines', {
    request_id: { type: 'uuid', notNull: true, references: 'help_requests', onDelete: 'CASCADE' },
    volunteer_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    reason: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  })
  // One decline per volunteer per request; makes the endpoint idempotent.
  pgm.createIndex(
    'request_declines',
    ['request_id', 'volunteer_id'],
    { unique: true, name: 'idx_request_declines_unique' },
  )
  // /nearby filters on volunteer_id for every request the caller can see.
  pgm.createIndex('request_declines', ['volunteer_id'], {
    name: 'idx_request_declines_volunteer',
    ifNotExists: true,
  })
}

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable('request_declines')
}
