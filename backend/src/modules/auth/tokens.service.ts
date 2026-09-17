import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { StringValue } from 'ms'
import { config } from '../../config/index.js'
import { errors } from '../../lib/errors.js'
import type { Queryable } from '../../database/pool.js'

export type Role = 'senior' | 'volunteer' | 'police'
export type AccountRole = Role | null

export interface UserAccount {
  id: string
  email: string
  role: AccountRole
  isActive: boolean
}

interface RefreshRow {
  id: string
  user_id: string
  family_id: string
  expires_at: Date
  consumed_at: Date | null
  revoked_at: Date | null
}

interface RefreshTokenPayload {
  sub: string
  fam: string
  typ: string
}

function digest(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export function signAccessToken(account: { id: string; role: AccountRole; isActive: boolean }, ttl?: StringValue): string {
  return jwt.sign(
    { role: account.role, is_active: account.isActive },
    config.jwt.secret,
    {
      subject: account.id,
      expiresIn: (ttl ?? config.jwt.accessTtl) as StringValue,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    },
  )
}

export function verifyAccessToken(token: string): { id: string; role: AccountRole; isActive: boolean } {
  try {
    const payload = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }) as jwt.JwtPayload & { role?: AccountRole; is_active?: boolean }
    if (!payload.sub || typeof payload.sub !== 'string') throw new Error('missing subject')
    return { id: payload.sub, role: payload.role ?? null, isActive: payload.is_active ?? false }
  } catch {
    throw errors.unauthorized('Invalid or expired access token')
  }
}

function signRefresh(userId: string, familyId: string): string {
  return jwt.sign(
    { fam: familyId, typ: 'refresh', jti: crypto.randomUUID() },
    config.jwt.secret,
    {
      subject: userId,
      expiresIn: config.jwt.refreshTtl as StringValue,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    },
  )
}

/**
 * Creates a fresh refresh-token row for a user (new family) and returns the
 * raw token value. The raw token is never stored; only its SHA-256 is.
 */
export async function createRefreshToken(db: Queryable, userId: string): Promise<string> {
  const familyId = crypto.randomUUID()
  const raw = signRefresh(userId, familyId)
  const expiresAt = new Date(Date.now() + config.jwt.refreshTtlS * 1000)
  await db.query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, familyId, digest(raw), expiresAt],
  )
  return raw
}

/**
 * Rotates a refresh token: consumes the presented token and issues a new pair
 * inside the same family. Reuse of an already-consumed token revokes the whole
 * family and rejects with 401.
 */
export async function rotateRefreshToken(
  db: Queryable,
  rawToken: string,
): Promise<{ refreshToken: string; user: UserAccount }> {
  let payload: RefreshTokenPayload
  try {
    payload = jwt.verify(rawToken, config.jwt.secret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }) as RefreshTokenPayload
  } catch {
    throw errors.unauthorized('Invalid or expired refresh token')
  }
  if (payload.typ !== 'refresh' || !payload.fam) {
    throw errors.unauthorized('Invalid or expired refresh token')
  }

  const found = await db.query<RefreshRow>('SELECT * FROM refresh_tokens WHERE token_hash = $1', [digest(rawToken)])
  if (found.rowCount === 0) throw errors.unauthorized('Invalid or expired refresh token')
  const token = found.rows[0]

  if (token.revoked_at) throw errors.unauthorized('Invalid or expired refresh token')
  if (token.consumed_at) {
    await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1', [token.family_id])
    throw errors.unauthorized('Refresh token reuse detected; session revoked')
  }
  if (new Date(token.expires_at).getTime() <= Date.now()) {
    throw errors.unauthorized('Refresh token expired')
  }

  const newRaw = signRefresh(token.user_id, token.family_id)
  const expiresAt = new Date(Date.now() + config.jwt.refreshTtlS * 1000)

  await db.query('UPDATE refresh_tokens SET consumed_at = now() WHERE id = $1', [token.id])
  await db.query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [token.user_id, token.family_id, digest(newRaw), expiresAt],
  )

  const user = await db.query('SELECT id, email, role, is_active FROM users WHERE id = $1', [token.user_id])
  if (user.rowCount === 0) throw errors.unauthorized('Account no longer exists')
  const u = user.rows[0]
  return {
    refreshToken: newRaw,
    user: { id: u.id, email: u.email, role: u.role, isActive: u.is_active },
  }
}

/**
 * Revokes a single refresh token (logout). Idempotent.
 */
export async function revokeRefreshToken(db: Queryable, rawToken: string): Promise<void> {
  await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [
    digest(rawToken),
  ])
}

interface UserRow {
  id: string
  email: string
  role: AccountRole
  is_active: boolean
}

export function toUserAccount(u: UserRow): UserAccount {
  return { id: u.id, email: u.email, role: u.role, isActive: u.is_active }
}