import type { EmergencyEvent, PoliceRequest } from '../../api/types';
import { categoryLabel, priorityLabel, statusLabel, triggerLabel } from '../../lib/format';
import { type Tone } from '../../lib/tone';

/**
 * What the map actually plots.
 *
 * Requests and SOS events arrive from two endpoints with different shapes and
 * different lifecycles, but on a map they are the same thing: a coordinate and
 * a colour. Collapsing both into one type here means the clustering, the marker
 * list and the side panel all iterate one list instead of each re-deriving
 * "what is a plottable record" in its own way.
 */
export type PlottedKind = 'request' | 'emergency';

export interface PlottedItem {
  kind: PlottedKind;
  /** The original record, for the popup and the side panel. */
  data: PoliceRequest | EmergencyEvent;
  lat: number;
  lng: number;
  color: string;
  /** Only an unreviewed SOS pulses. */
  pulse: boolean;
  urgent: boolean;
  /** Screen-reader description of the dot. */
  alt: string;
}

/**
 * Marker colours are literals rather than `var(--…)`. The marker markup is
 * injected into Leaflet's pane, and a CSS custom property only inherits through
 * the DOM tree — the pane is in the document, so it resolves today, but nothing
 * guarantees the injection point keeps inheriting. A hard-coded hex cannot
 * silently fail to a transparent marker.
 *
 * This is the one place in the app that reaches past the tone palette, and the
 * palette's own header comment says so: the GIS map is genuinely categorical
 * and keeps its own four colours.
 */
export const REQUEST_COLOR = '#2563eb';
export const URGENT_COLOR = '#d97706';
export const EMERGENCY_COLOR = '#dc2626';
export const REVIEWED_COLOR = '#64748b';

export const requestColor = (request: PoliceRequest): string =>
  request.priority === 'urgent' ? URGENT_COLOR : REQUEST_COLOR;

export const emergencyColor = (event: EmergencyEvent): string =>
  event.status === 'LOGGED' ? EMERGENCY_COLOR : REVIEWED_COLOR;

/**
 * Narrows the nullable coordinate columns to numbers. Written generically so the
 * predicate intersects the *whole* incoming type rather than collapsing it to
 * just the two fields.
 */
export function hasCoords<T extends { latitude: number | null; longitude: number | null }>(
  value: T,
): value is T & { latitude: number; longitude: number } {
  return value.latitude !== null && value.longitude !== null;
}

export function toRequestItem(request: PoliceRequest & { latitude: number; longitude: number }): PlottedItem {
  const urgent = request.priority === 'urgent';
  return {
    kind: 'request',
    data: request,
    lat: request.latitude,
    lng: request.longitude,
    color: requestColor(request),
    pulse: false,
    urgent,
    alt: `Help request: ${categoryLabel(request.category)}, ${priorityLabel(request.priority)}`,
  };
}

export function toEmergencyItem(
  event: EmergencyEvent & { latitude: number; longitude: number },
): PlottedItem {
  const logged = event.status === 'LOGGED';
  return {
    kind: 'emergency',
    data: event,
    lat: event.latitude,
    lng: event.longitude,
    color: emergencyColor(event),
    pulse: logged,
    urgent: false,
    alt: `Emergency SOS: ${triggerLabel(event.trigger_type)}, ${logged ? 'awaiting review' : 'reviewed'}`,
  };
}

/** Stable identity for a plotted record, used to key refs and the selection. */
export const itemKey = (kind: PlottedKind, id: string): string => `${kind}:${id}`;

/**
 * What the side panel is currently showing.
 *
 * `at` is a nonce. Selecting the row whose marker is already open has to
 * re-centre the map, and without a nonce that click is a no-op — the officer
 * presses it again and nothing happens either.
 */
export interface Selection {
  kind: PlottedKind;
  id: string;
  at: number;
}

export const selectionKey = (selection: Selection | null): string | null =>
  selection ? itemKey(selection.kind, selection.id) : null;

/** Tone for a request's priority chip, so the popups speak the same language as the tables. */
export const priorityTone = (request: PoliceRequest): Tone =>
  request.priority === 'urgent' ? 'error' : 'neutral';

export const requestSummary = (request: PoliceRequest): string =>
  `${categoryLabel(request.category)} · ${statusLabel(request.status)}`;
