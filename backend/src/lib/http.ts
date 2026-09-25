import type { NextFunction, Request, Response } from 'express'
import { ApiError, Status } from './errors.js'

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data })
}

export function fail(res: Response, status: number, code: string, message: string, details?: unknown): void {
  res.status(status).json({ success: false, error: { code, message, ...(details === undefined ? {} : { details }) } })
}

export function toErrorResponse(err: unknown): { status: number; code: string; message: string; details?: unknown } {
  if (err instanceof ApiError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details }
  }
  if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === Status.BadRequest) {
    return { status: Status.BadRequest, code: 'INVALID_JSON', message: 'Malformed JSON body' }
  }
  return { status: Status.ServerError, code: 'INTERNAL', message: 'Internal server error' }
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>

export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}