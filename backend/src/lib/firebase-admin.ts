import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { config } from '../config/index.js'
import { logger } from './logger.js'

/**
 * One `firebase-admin` app for the whole backend.
 *
 * Both consumers need the same credential, and the SDK permits only one default
 * app per process: FCM push (`modules/notifications/push.ts`) and the Firestore
 * mirror (`modules/firebase-sync/`). Bootstrapping it in two places produced two
 * independent init paths, one of which initialised lazily from inside a send
 * call, so a misconfigured credential surfaced as a silently-logged push error
 * rather than a startup error.
 *
 * Uses the modular v14 entrypoints (`firebase-admin/app`) rather than the legacy
 * `firebase-admin` namespace, which is what the package's types actually describe.
 *
 * The credential comes from `FIREBASE_SERVICE_ACCOUNT_JSON`, accepting either a
 * path to the downloaded key file or the JSON inline. `FCM_SERVICE_ACCOUNT_JSON`
 * is still accepted as a fallback, but only for the credential: whether push
 * actually sends is decided separately by `FCM_ENABLED`, so pointing the
 * Firestore mirror at a service account cannot silently re-enable delivery.
 */

let app: App | null = null

/**
 * The initialised admin app, or null when no service account is configured.
 * Callers decide whether that is fatal: push degrades to logging, and the
 * mirror reports that it is not configured.
 */
export function getAdminApp(): App | null {
  if (app) return app

  const raw = config.firebaseServiceAccountPathOrJson
  if (!raw) return null

  const trimmed = raw.trim()
  // A value starting with '{' is inline JSON rather than a filename.
  const isInlineJson = trimmed.startsWith('{')
  const credential = isInlineJson ? cert(JSON.parse(trimmed)) : cert(trimmed)

  // The service account JSON carries its own project_id, so there is nothing to
  // override here.
  app = getApps()[0] ?? initializeApp({ credential })

  logger.info('[firebase] admin app ready', {
    source: isInlineJson ? 'inline-json' : 'file',
    projectId: app.options.projectId,
  })

  return app
}

/** True when a service account is configured, without initialising anything. */
export function isFirebaseConfigured(): boolean {
  return config.firebaseServiceAccountPathOrJson !== null
}

/**
 * True when push should actually deliver.
 *
 * Requires *both* a configured service account and `FCM_ENABLED`. The mirror
 * needs the credential but not this flag, so without the second condition
 * turning on the Firestore sync would quietly start sending notifications to
 * whatever device tokens happen to be in the database.
 */
export function isPushEnabled(): boolean {
  return config.fcm.enabled && isFirebaseConfigured()
}

/** Test seam: forget the cached app so a new credential can be picked up. */
export function resetAdminAppForTest(): void {
  app = null
}
