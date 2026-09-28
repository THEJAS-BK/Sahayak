import 'dotenv/config'
import { defineConfig } from 'vitest/config'
import { assertTestDatabaseIsolated } from './src/lib/db-guard.js'

/**
 * Resolve the test database from the real `.env`, before the overrides below
 * replace it.
 *
 * `DATABASE_URL_TEST` is required and may not be the same database as
 * `DATABASE_URL`. Tests truncate every table, so a teammate who copied the
 * shared connection string into both variables would silently wipe everyone's
 * data on the next `npm test`. The old fallback here
 * (`DATABASE_URL_TEST || DATABASE_URL`) did exactly that.
 *
 * This check has to live in this file: the `env` block below deliberately points
 * `DATABASE_URL` at the test database so the request pipeline under test hits
 * the right place, which means by the time application code reads the config the
 * two values are indistinguishable.
 */
const appUrl = process.env.DATABASE_URL ?? ''
const rawTestUrl = process.env.DATABASE_URL_TEST

if (!rawTestUrl) {
  throw new Error(
    'DATABASE_URL_TEST must be set to run tests. Point it at a dedicated test ' +
      'database (a Neon test branch) — never at the shared one, because tests ' +
      'truncate every table.',
  )
}
assertTestDatabaseIsolated(appUrl, rawTestUrl)

const testUrl = rawTestUrl

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testUrl,
      DATABASE_URL_TEST: testUrl,
      // Tests exercise the real request pipeline, whatever the local .env says.
      REQUESTS_DRY_RUN: 'false',
      // Likewise: A-01 asserts the OTP issuance limit, so the dev escape hatch
      // in .env must not disable it here.
      RATE_LIMIT_DISABLED: 'false',
    },
  },
})