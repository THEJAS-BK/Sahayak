const LEVELS = ['debug', 'info', 'warn', 'error'] as const
type Level = (typeof LEVELS)[number]

function shouldLog(level: Level, minLevel: Level): boolean {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(minLevel)
}

function jsonArgs(args: unknown[]): unknown[] {
  return args.map((a) => {
    if (typeof a === 'string' || typeof a === 'number' || typeof a === 'boolean' || a === null || a === undefined) {
      return a
    }
    if (a instanceof Error) {
      // `message` and `stack` are non-enumerable, so plain JSON.stringify turns
      // every Error into `{}`. Anything logged as an error was unreadable —
      // including the guards that refuse to drop a shared database, where the
      // whole point is that a human reads the message. Enumerable own
      // properties are spread last so driver-specific fields (`code` on pg
      // errors) survive alongside the standard ones.
      return {
        name: a.name,
        message: a.message,
        stack: a.stack,
        ...Object.fromEntries(Object.entries(a)),
      }
    }
    try {
      return JSON.stringify(a)
    } catch {
      return String(a)
    }
  })
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (shouldLog('debug', 'debug')) console.debug('[debug]', ...jsonArgs(args))
  },
  info: (...args: unknown[]) => {
    if (shouldLog('info', 'debug')) console.info('[info]', ...jsonArgs(args))
  },
  warn: (...args: unknown[]) => {
    if (shouldLog('warn', 'debug')) console.warn('[warn]', ...jsonArgs(args))
  },
  error: (...args: unknown[]) => {
    if (shouldLog('error', 'debug')) console.error('[error]', ...jsonArgs(args))
  },
} as const