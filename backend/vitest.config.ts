import 'dotenv/config'
import { defineConfig } from 'vitest/config'

const testUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL || ''

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