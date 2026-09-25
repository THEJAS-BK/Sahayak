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
    },
  },
})