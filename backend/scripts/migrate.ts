import 'dotenv/config'
import { runner } from 'node-pg-migrate'
import pg from 'pg'
import { config } from '../src/config/index.js'
import { assertDestructiveAllowed } from '../src/lib/db-guard.js'
import { logger } from '../src/lib/logger.js'

const COMMAND = process.argv[2] ?? 'up'

async function run(): Promise<void> {
  // `reset` drops the whole public schema. There is one shared database, so
  // this is guarded before a connection is even opened.
  if (COMMAND === 'reset') {
    assertDestructiveAllowed(config.databaseUrl, 'drop and recreate the public schema')
  }

  const db = new pg.Client({ connectionString: config.databaseUrl })
  await db.connect()

  try {
    if (COMMAND === 'reset') {
      logger.info('Resetting schema ...')
      await db.query('DROP SCHEMA public CASCADE')
      await db.query('CREATE SCHEMA public')
    }
  } finally {
    await db.end()
  }

  const direction = COMMAND === 'down' ? 'down' : 'up'
  await runner({
    databaseUrl: config.databaseUrl,
    dir: 'migrations',
    direction,
    count: direction === 'down' ? (process.argv[3] ? Number(process.argv[3]) : 1) : Infinity,
    migrationsTable: 'pgmigrations',
    log: (msg) => logger.info(msg),
  })

  logger.info(`Migrations ${direction} complete`)
}

run().catch((err) => {
  logger.error('Migration failed', err)
  process.exit(1)
})