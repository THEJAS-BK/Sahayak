import type { Queryable } from './pool.js'

export interface AuditInput {
  actorId: string | null
  action: string
  entityType: string
  entityId: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

/**
 * Appends an audit row. `actorId === null` for system-generated events
 * (e.g. dispatch sweep). Always called inside the same transaction as the
 * state change it describes.
 */
export async function writeAudit(db: Queryable, input: AuditInput): Promise<void> {
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before, after, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.actorId,
      input.action,
      input.entityType,
      input.entityId,
      input.before ?? null,
      input.after ?? null,
      input.metadata ?? null,
    ],
  )
}

export async function writeAuditMany(db: Queryable, entries: AuditInput[]): Promise<void> {
  for (const entry of entries) {
    await writeAudit(db, entry)
  }
}