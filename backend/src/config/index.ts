import 'dotenv/config'

const env = process.env

export const config = {
  port: Number(env.PORT ?? 3000),
  nodeEnv: env.NODE_ENV ?? 'development',
  // Database configuration (e.g. DATABASE_URL) will be added here when the
  // PostgreSQL connection is introduced.
} as const