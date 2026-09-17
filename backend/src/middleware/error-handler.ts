import type { NextFunction, Request, Response } from 'express'
import { toErrorResponse } from '../lib/http.js'
import { logger } from '../lib/logger.js'

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } })
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const mapped = toErrorResponse(err)
  if (mapped.status >= 500) {
    logger.error('Unhandled error', err)
  }
  res.status(mapped.status).json({
    success: false,
    error: { code: mapped.code, message: mapped.message, ...(mapped.details === undefined ? {} : { details: mapped.details }) },
  })
}