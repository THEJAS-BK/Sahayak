export function encodeCursor(createdAt: string | Date, id: string): string {
  const ts = createdAt instanceof Date ? createdAt.toISOString() : createdAt
  return Buffer.from(`${ts}|${id}`, 'utf8').toString('base64url')
}

export function decodeCursor(cursor: string | undefined): { createdAt: string; id: string } | null {
  if (!cursor) return null
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8')
    const sep = raw.lastIndexOf('|')
    if (sep <= 0) return null
    const createdAt = raw.slice(0, sep)
    const id = raw.slice(sep + 1)
    if (!id) return null
    return { createdAt, id }
  } catch {
    return null
  }
}