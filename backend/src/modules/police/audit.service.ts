import { encodeCursor, decodeCursor } from '../../lib/pagination.js'
import type { Queryable } from '../../database/pool.js'

export interface AuditLogFilter {
  entity_type?: string
  entity_id?: string
  actor_id?: string | null
  action?: string
  from?: string
  to?: string
  limit?: number
  cursor?: string
}

export async function listAuditLogs(
  db: Queryable,
  filter: AuditLogFilter,
): Promise<{ logs: unknown[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200)
  const cursor = decodeCursor(filter.cursor)
  const params: unknown[] = []
  const where: string[] = []

  if (filter.entity_type) {
    params.push(filter.entity_type)
    where.push(`al.entity_type = $${params.length}`)
  }
  if (filter.entity_id) {
    params.push(filter.entity_id)
    where.push(`al.entity_id = $${params.length}::uuid`)
  }
  if (filter.actor_id !== undefined) {
    if (filter.actor_id === null) {
      where.push('al.actor_id IS NULL')
    } else {
      params.push(filter.actor_id)
      where.push(`al.actor_id = $${params.length}::uuid`)
    }
  }
  if (filter.action) {
    params.push(filter.action)
    where.push(`al.action = $${params.length}`)
  }
  if (filter.from) {
    params.push(filter.from)
    where.push(`al.created_at >= $${params.length}::timestamptz`)
  }
  if (filter.to) {
    params.push(filter.to)
    where.push(`al.created_at <= $${params.length}::timestamptz`)
  }
  if (cursor) {
    params.push(cursor.createdAt, cursor.id)
    where.push(`(al.created_at, al.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`)
  }
  params.push(limit)

  const sql = `
    SELECT al.*
    FROM audit_logs al
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT $${params.length}`

  const res = await db.query(sql, params)
  const rows = res.rows
  const next =
    rows.length === limit ? encodeCursor(rows[rows.length - 1].created_at, rows[rows.length - 1].id) : null

  return { logs: rows, next_cursor: next }
}