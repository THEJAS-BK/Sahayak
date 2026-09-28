import type { NextFunction, Request, Response } from 'express'
import { errors } from '../lib/errors.js'
import { verifyAccessToken, type AccountRole } from '../modules/auth/tokens.service.js'

export interface AuthUser {
  id: string
  role: AccountRole
  isActive: boolean
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
      refreshToken?: string
    }
  }
}

function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization
  if (!header) return undefined
  const [scheme, token, ...rest] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) return undefined
  return token
}

/** Parses the Bearer access token and attaches req.user. 401 when absent/invalid. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = bearerToken(req)
  if (!token) {
    next(errors.unauthorized('Access token required'))
    return
  }
  try {
    const { id, role, isActive } = verifyAccessToken(token)
    req.user = { id, role, isActive }
    next()
  } catch (err) {
    next(err)
  }
}

/** Requires the Bearer token to BE a refresh token (for /api/auth/refresh). */
export function requireRefreshToken(req: Request, _res: Response, next: NextFunction): void {
  const token = bearerToken(req)
  if (!token) {
    next(errors.unauthorized('Refresh token required'))
    return
  }
  req.refreshToken = token
  next()
}

/** Requires req.user to exist and have one of the given roles (403 otherwise). */
export function requireRole(...roles: ('senior' | 'volunteer' | 'police')[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(errors.unauthorized())
      return
    }
    if (!roles.includes(req.user.role as 'senior' | 'volunteer' | 'police')) {
      next(errors.forbidden('FORBIDDEN', 'This action is not allowed for your role'))
      return
    }
    next()
  }
}

/** BR-01: no protected feature until the account is active. */
export function requireActive(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(errors.unauthorized())
    return
  }
  if (!req.user.isActive) {
    next(errors.forbidden('ACCOUNT_INACTIVE', 'Account is not yet approved or is inactive'))
    return
  }
  next()
}

export function requireAuthenticated(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(errors.unauthorized())
    return
  }
  next()
}