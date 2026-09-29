import { Router } from 'express'
import { errors } from '../../lib/errors.js'
import { asyncHandler, ok } from '../../lib/http.js'
import { pool } from '../../database/pool.js'
import { authenticate, requireActive, requireRole } from '../../middleware/auth.js'
import { getPoliceOverview } from './overview.service.js'

const router = Router()

/**
 * P-08: counters for the Dashboard tiles.
 *
 * `from`/`to` bound the "completed today" tile. They are optional so a caller
 * that does not care gets the server's own day; the console sends its own
 * window so a station outside UTC still sees its own evening.
 */
function dayWindow(from: unknown, to: unknown): { todayStart: Date; todayEnd: Date } {
  const parse = (value: unknown): Date | null => {
    if (typeof value !== 'string' || value.trim() === '') return null
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date
  }

  const start = parse(from)
  const end = parse(to)
  if (from !== undefined && start === null) throw errors.badRequest('Invalid from timestamp')
  if (to !== undefined && end === null) throw errors.badRequest('Invalid to timestamp')

  if (start && end) return { todayStart: start, todayEnd: end }

  // A half-supplied window would silently skew the tile — an officer sending
  // only `from` would otherwise get their own start bound against the server's
  // midnight end, reporting a week of completions as "today". Fall back to the
  // server's own day for the whole window instead of mixing the two calendars.
  const now = new Date()
  const serverStart = new Date(now)
  serverStart.setHours(0, 0, 0, 0)
  const serverEnd = new Date(serverStart)
  serverEnd.setDate(serverEnd.getDate() + 1)
  return { todayStart: serverStart, todayEnd: serverEnd }
}

router.get(
  '/',
  authenticate,
  requireRole('police'),
  requireActive,
  asyncHandler(async (req, res) => {
    ok(res, await getPoliceOverview(pool, dayWindow(req.query.from, req.query.to)))
  }),
)

export default router
