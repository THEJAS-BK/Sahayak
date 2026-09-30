/**
 * Dates, elapsed time and the label vocabulary.
 *
 * These used to be re-declared in ten separate page files, with the same
 * `categoryLabels` map copied three times and `priorityLabel` bypassed in two
 * more. Anything that formats a timestamp or a lifecycle state for a person goes
 * through here, so it can only be spelled one way.
 */

import type { RequestPriority, RequestStatus } from '../api/types';

/** The status machine, in the order a request travels through it. */
export const REQUEST_STATUSES: RequestStatus[] = [
  'PENDING',
  'MATCHING',
  'DISPATCHED',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'UNASSIGNED',
];

/** Everything that is not COMPLETED or CANCELLED — the live board. */
export const OPEN_STATUSES: RequestStatus[] = [
  'PENDING',
  'MATCHING',
  'DISPATCHED',
  'ACCEPTED',
  'IN_PROGRESS',
  'UNASSIGNED',
];

export const statusLabel = (status: RequestStatus): string =>
  status
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');

/**
 * The categories the API can return, spelled for a person. An unknown category
 * still reads as words rather than an identifier, because the agent pipeline
 * can add one without a frontend release.
 */
const CATEGORY_LABELS: Record<string, string> = {
  grocery_assistance: 'Grocery assistance',
  medical_assistance: 'Medical assistance',
  transport_assistance: 'Transport assistance',
  companionship: 'Companionship',
  medicine: 'Medicine',
  emergency: 'Emergency',
};

export const categoryLabel = (category: string): string =>
  CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ');

export const priorityLabel = (priority: RequestPriority): string =>
  priority === 'urgent' ? 'Urgent' : 'Normal';

/**
 * What tripped the emergency agent. Spelled out because the column used to read
 * "semantic_llm", which tells an officer nothing about how the SOS was raised.
 */
const TRIGGER_LABELS: Record<string, string> = {
  semantic_llm: 'Detected distress',
  acoustic_distress: 'Acoustic distress',
  keyword_repetition: 'Keyword repetition',
};

export const triggerLabel = (trigger: string): string =>
  TRIGGER_LABELS[trigger] ?? trigger.replace(/_/g, ' ');

export const verificationRoleLabel = (role: string): string =>
  role === 'senior' ? 'Senior' : role === 'volunteer' ? 'Volunteer' : role;

/** A UUID shown in a table cell, where the full 36 characters are noise. */
export const shortId = (id: string): string => (id.length <= 8 ? id : id.slice(0, 8));

// ── Dates ────────────────────────────────────────────────────────────────────

/** `17 Sep 2026, 6:45 pm` — the default for anything in a table cell. */
export const formatDateTime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/** `17 Sep 2026`. */
export const formatDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';

/** `as of 6:45:02 pm` — the freshness stamp in the header. */
export const formatClock = (at: Date | null | undefined): string =>
  at
    ? at.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';

/**
 * The console's own calendar day, for `GET /police/overview`.
 *
 * Neon runs in UTC. If the console omits the window, the API falls back to the
 * *server's* midnight, so an officer in IST reading the board at 07:00 would see
 * yesterday's completions counted as today's — and the number would quietly
 * disagree with the same day filtered on the Requests page. The client therefore
 * always states its own day.
 */
export const localDayWindow = (now = new Date()): { from: string; to: string } => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
};

// ── Elapsed time ─────────────────────────────────────────────────────────────

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago something happened, in the shortest unit that stays useful.
 *
 * `4m`, `2h 14m`, `3d`. The clock is what an officer actually reads on a help
 * request — "how long has this person been waiting" — so it gets a column to
 * itself rather than a formatted timestamp buried among identifiers.
 */
export const elapsedLabel = (iso: string | null | undefined, now = Date.now()): string | null => {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;

  const ms = Math.max(0, now - then);
  if (ms < MINUTE) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
  if (ms < DAY) {
    const hours = Math.floor(ms / HOUR);
    const minutes = Math.floor((ms % HOUR) / MINUTE);
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
};

/**
 * How long a request has been waiting decides whether it is routine or whether
 * someone should be dispatched. Thresholds are the escalation ladder the plan
 * calls for: under half an hour is normal, half an hour is worth a look, two
 * hours is not.
 */
export type WaitTone = 'neutral' | 'warning' | 'error';

export const waitTone = (iso: string | null | undefined, now = Date.now()): WaitTone => {
  if (!iso) return 'neutral';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'neutral';
  const ms = Math.max(0, now - then);
  if (ms >= 2 * HOUR) return 'error';
  if (ms >= 30 * MINUTE) return 'warning';
  return 'neutral';
};

/** A terminal request is not "waiting" for anything, so it never escalates. */
export const isOpenStatus = (status: RequestStatus): boolean =>
  status !== 'COMPLETED' && status !== 'CANCELLED';

/**
 * The end of a filter's `to` value.
 *
 * `<input type="date">` hands back `YYYY-MM-DD`, which `new Date()` reads as
 * *local midnight* on that day. A `to` of `2026-09-27` compared against a request
 * raised at 14:00 would therefore exclude the whole day the officer thought they
 * were including — the range silently loses its final day.
 *
 * A full `datetime-local` value already has its own time, so it is taken as given.
 */
export const dayEnd = (value: string): Date | null => {
  if (value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // Date-only input: stretch to the last millisecond of the day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
};
