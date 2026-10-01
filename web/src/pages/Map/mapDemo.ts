import type { EmergencyEvent, PoliceRequest } from '../../api/types';
import { toEmergencyItem, toRequestItem, type PlottedItem } from './mapItems';
import { demoEmergency, demoRequest } from './mapDemoData';

/**
 * Two records with coordinates, so the map has something to draw before the
 * backend has any.
 *
 * This exists because an empty map cannot be evaluated. Pin shape, hover text,
 * selection, the panel's paging — none of it is observable on a blank canvas, and
 * the failures that matter here (a tooltip that never opens, a selected row that
 * does not highlight its pin) only appear once there is a pin under the cursor.
 *
 * Gated to dev builds. The records are fabricated and would otherwise sit on a
 * live dispatch map looking exactly like real calls: a red unreviewed SOS in
 * Delhi is indistinguishable from a real one, and an officer acting on a fake
 * call is a worse failure than an empty map.
 *
 * The fixtures live in `mapDemoData.ts` and are only *constructed* inside the
 * branch below, because that is what lets a production build drop them. Building
 * them into a module-level const kept the invented names and `.test` emails in
 * the shipped bundle even though nothing read the result — `import.meta.env.DEV`
 * folds to `false`, but a const that was already evaluated is a side effect the
 * bundler has to keep.
 */
export const DEMO_ENABLED: boolean = import.meta.env.DEV;

/**
 * Positions are narrowed here rather than written inline on each fixture, so a
 * demo record cannot reach the map without going through the same narrowing the
 * real feed uses. A missing coordinate must produce "not mappable", never a pin
 * at [0, 0] in the Atlantic.
 */
function buildDemoItems(): PlottedItem[] {
  const request = demoRequest() as PoliceRequest & { latitude: number; longitude: number };
  const event = demoEmergency() as EmergencyEvent & { latitude: number; longitude: number };
  return [toRequestItem(request), toEmergencyItem(event)];
}

/** The demo records, or an empty list in a production build. */
export const demoItems: PlottedItem[] = DEMO_ENABLED ? buildDemoItems() : [];