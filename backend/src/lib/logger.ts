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