import 'dotenv/config'
import { z } from 'zod'

const DURATION_RE = /^(\d+)([smhd])$/

export function parseDurationToSeconds(value: string): number {
  const m = DURATION_RE.exec(value)
  if (!m) throw new Error(`Invalid duration: ${value} (expected like 15m, 8h, 90d)`)
  const n = Number(m[1])
  const unit = m[2]
  if (unit === 's') return n
  if (unit === 'm') return n * 60
  if (unit === 'h') return n * 3600
  return n * 86400 // d
}

const intFromEnv = (fallback: number) =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? fallback : v),
    z.coerce.number().int().positive(),
  )

const strFromEnv = (fallback: string) =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? fallback : v),
    z.string().min(1),
  )

const emptyToUndefined = z.preprocess(
  (v: unknown) => (typeof v === 'string' && v.length === 0 ? undefined : v),
  z.unknown(),
)

const rawEnv = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: intFromEnv(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_URL_TEST: z.string().optional(),
    PG_POOL_MAX: intFromEnv(10),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: z.string().regex(DURATION_RE, 'Must look like 15m / 8h / 90d').default('15m'),
    JWT_REFRESH_TTL: z.string().regex(DURATION_RE, 'Must look like 15m / 8h / 90d').default('90d'),
    MATCH_RADIUS_M: intFromEnv(5000),
    DISPATCH_BATCH_SIZE: intFromEnv(100),
    DISPATCH_TIMEOUT_S: intFromEnv(90),
    MAX_DISPATCH_ATTEMPTS: intFromEnv(3),
    REQUESTS_DRY_RUN: emptyToUndefined,
    RATE_LIMIT_DISABLED: emptyToUndefined,
    SMTP_HOST: emptyToUndefined,
    SMTP_PORT: emptyToUndefined,
    SMTP_USER: emptyToUndefined,
    SMTP_PASS: emptyToUndefined,
    SMTP_FROM: emptyToUndefined,
    SMTP_SECURE: emptyToUndefined,
    OTP_DEV_CODE: emptyToUndefined,
    LIVEKIT_URL: emptyToUndefined,
    LIVEKIT_API_KEY: emptyToUndefined,
    LIVEKIT_API_SECRET: emptyToUndefined,
    LIVEKIT_TOKEN_TTL_SECONDS: intFromEnv(300),
    LIVEKIT_AGENT_NAME: strFromEnv('sahayak'),
    CLOUDINARY_CLOUD_NAME: emptyToUndefined,
    CLOUDINARY_API_KEY: emptyToUndefined,
    CLOUDINARY_API_SECRET: emptyToUndefined,
    CLOUDINARY_FOLDER: strFromEnv('sahayak'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return
    // SMTP is required in production because email is the notification path
    // that ships. Push is not implemented, so it gates nothing.
    const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const
    for (const key of required) {
      if (env[key] === undefined) {
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when NODE_ENV=production` })
      }
    }
  })

const parsed = rawEnv.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment configuration:')
  for (const issue of parsed.error.issues) {
    const path = issue.path.join('.') || '(root)'
    console.error(`  - ${path}: ${issue.message}`)
  }
  process.exit(1)
}

const env = parsed.data
const smtpHost = typeof env.SMTP_HOST === 'string' ? env.SMTP_HOST : ''

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  databaseUrlTest: env.DATABASE_URL_TEST || undefined,
  jwt: {
    secret: env.JWT_SECRET,
    issuer: 'sahayak-backend',
    audience: 'sahayak',
    accessTtl: env.JWT_ACCESS_TTL,
    accessTtlS: parseDurationToSeconds(env.JWT_ACCESS_TTL),
    refreshTtl: env.JWT_REFRESH_TTL,
    refreshTtlS: parseDurationToSeconds(env.JWT_REFRESH_TTL),
    policeAccessTtl: '8h',
    policeAccessTtlS: 8 * 3600,
  },
  matching: {
    radiusM: env.MATCH_RADIUS_M,
    batchSize: env.DISPATCH_BATCH_SIZE,
    timeoutS: env.DISPATCH_TIMEOUT_S,
    maxAttempts: env.MAX_DISPATCH_ATTEMPTS,
  },
  requests: {
    /** When true, POST /api/requests logs the body and returns 201 without persisting. */
    dryRun: env.REQUESTS_DRY_RUN === 'true' || env.REQUESTS_DRY_RUN === '1',
  },
  /**
   * Escape hatch for local development only. True when RATE_LIMIT_DISABLED is
   * set, and always false in production so the flag cannot be shipped by
   * accident. Re-enable the limiter before any real deployment — see
   * `plans/deferred-before-production.md`.
   */
  rateLimitDisabled:
    (env.RATE_LIMIT_DISABLED === 'true' || env.RATE_LIMIT_DISABLED === '1') && env.NODE_ENV !== 'production',
  smtp:
    smtpHost.length > 0
      ? {
          host: smtpHost,
          port: env.SMTP_PORT === undefined ? 587 : Number(env.SMTP_PORT) || 587,
          user: typeof env.SMTP_USER === 'string' ? env.SMTP_USER : '',
          pass: typeof env.SMTP_PASS === 'string' ? env.SMTP_PASS : '',
          from: typeof env.SMTP_FROM === 'string' ? env.SMTP_FROM : '',
          secure: env.SMTP_SECURE === 'true' || env.SMTP_SECURE === '1',
        }
      : null,
  pool: {
    max: env.PG_POOL_MAX,
  },
  otpDevCode: typeof env.OTP_DEV_CODE === 'string' ? env.OTP_DEV_CODE : null,
  livekit: {
    url: typeof env.LIVEKIT_URL === 'string' ? env.LIVEKIT_URL : '',
    apiKey: typeof env.LIVEKIT_API_KEY === 'string' ? env.LIVEKIT_API_KEY : '',
    apiSecret: typeof env.LIVEKIT_API_SECRET === 'string' ? env.LIVEKIT_API_SECRET : '',
    tokenTtlS: env.LIVEKIT_TOKEN_TTL_SECONDS,
    agentName: env.LIVEKIT_AGENT_NAME,
  },
  /**
   * Request photo uploads. Optional: every credential may be absent, and the
   * app then runs exactly as before minus photo upload. Deliberately not
   * validated at boot, because the rest of the API has nothing to do with
   * Cloudinary and should not refuse to start over a missing photo backend.
   * `isCloudinaryConfigured` is what gates the upload route.
   */
  cloudinary: {
    cloudName: typeof env.CLOUDINARY_CLOUD_NAME === 'string' ? env.CLOUDINARY_CLOUD_NAME : '',
    apiKey: typeof env.CLOUDINARY_API_KEY === 'string' ? env.CLOUDINARY_API_KEY : '',
    apiSecret: typeof env.CLOUDINARY_API_SECRET === 'string' ? env.CLOUDINARY_API_SECRET : '',
    folder: env.CLOUDINARY_FOLDER,
  },
} as const

export type Config = typeof config