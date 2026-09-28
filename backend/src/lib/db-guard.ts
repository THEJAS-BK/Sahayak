/**
 * Guards against pointing a destructive operation at the wrong database.
 *
 * The project runs against a single shared Postgres (Neon) that every teammate
 * and the demo use. There is no local instance to fall back to, so two mistakes
 * are both easy to make and expensive:
 *
 *  1. `DATABASE_URL_TEST` left pointing at the same database as
 *     `DATABASE_URL`, which makes every `npm test` truncate shared data —
 *     including the seeded police account a demo depends on.
 *  2. Running `db:reset` (`DROP SCHEMA public CASCADE`) or a fresh seed against
 *     the shared database.
 *
 * Both fail closed: they throw rather than warn, because the recovery is
 * restoring other people's work, not re-running a command.
 */

/** Set to '1' to deliberately override the destructive-operation guard. */
const DESTRUCTIVE_OVERRIDE_ENV = 'SAHAYAK_ALLOW_DESTRUCTIVE'

export interface DatabaseIdentity {
  host: string
  port: string
  database: string
}

/**
 * A safe-to-log identity for a connection string: host, port and database, with
 * the password and query string discarded. This is what gets printed, so it must
 * never echo a secret.
 */
export function databaseIdentity(url: string): DatabaseIdentity {
  const parsed = new URL(url)
  return {
    host: parsed.hostname.toLowerCase(),
    port: parsed.port || '5432',
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
  }
}

/** Human-readable target with no credentials in it. */
export function describeTarget(url: string): string {
  const id = databaseIdentity(url)
  return `${id.host}:${id.port}/${id.database}`
}

function sameDatabase(a: string, b: string): boolean {
  const x = databaseIdentity(a)
  const y = databaseIdentity(b)
  return x.host === y.host && x.port === y.port && x.database === y.database
}

/**
 * Fails when the test database is the same database the app uses.
 *
 * Called before the pool is used so a misconfigured `.env` stops the process
 * rather than quietly truncating the shared database on the first test file.
 */
export function assertTestDatabaseIsolated(databaseUrl: string, databaseUrlTest: string | undefined): void {
  if (!databaseUrlTest) return
  if (!sameDatabase(databaseUrl, databaseUrlTest)) return

  throw new Error(
    'DATABASE_URL_TEST points at the same database as DATABASE_URL.\n' +
      `  both are ${describeTarget(databaseUrl)}\n` +
      'Tests truncate every table, so this would erase the shared database.\n' +
      'Point DATABASE_URL_TEST at a separate test database (a Neon test branch).',
  )
}

/**
 * Fails when a destructive command is aimed at `DATABASE_URL`.
 *
 * There is no way to ask "is this database shared?" any more: the project has
 * exactly one database and everyone uses it. So this blocks by default and
 * requires a deliberate override, which is the honest shape of the problem —
 * `db:reset` is a last-resort command, not a routine one.
 *
 * The override is read from the environment so the escape hatch has to be typed
 * at the call site (`SAHAYAK_ALLOW_DESTRUCTIVE=1 npm run db:reset`) instead of
 * being a flag argument a script could pass unconditionally.
 */
export function assertDestructiveAllowed(url: string, action: string): void {
  if (process.env[DESTRUCTIVE_OVERRIDE_ENV] === '1') return

  throw new Error(
    `Refusing to ${action}: ${describeTarget(url)} is the shared database.\n` +
      "That would destroy every teammate's data and cannot be undone.\n" +
      'If you are certain this is throwaway data, re-run with ' +
      `${DESTRUCTIVE_OVERRIDE_ENV}=1`,
  )
}
