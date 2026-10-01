import type { EmergencyEvent, PoliceRequest } from '../../api/types';

/**
 * Two records with coordinates, so the map has something to draw before the
 * backend has any.
 *
 * This exists because an empty map cannot be evaluated. Pin shape, hover text,
 * selection, the panel's paging — none of it is observable on a blank canvas, and
 * the failures that matter here (a tooltip that never opens, a selected row that
 * does not highlight its pin) only appear once there is a pin under the cursor.
 *
 * Positions are real places (Bandra in Mumbai, Connaught Place in Delhi) so the
 * default centre and the "Fit all" bounds are worth looking at. They are not
 * anyone's actual address.
 *
 * Plain object literals on purpose: the callers build these inside a branch that
 * a production build folds away, and a top-level `const` of function calls gave
 * the bundler a reason to keep them. `.test` emails and invented names must not
 * ship into a bundle that can reach a real dispatch screen.
 */
const minutesAgo = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

export const demoRequest = (): PoliceRequest => ({
  id: 'demo-request-1',
  category: 'medical',
  description: 'Chest pain and difficulty breathing since this morning. Needs a doctor urgently.',
  details: null,
  latitude: 19.0596,
  longitude: 72.8295,
  priority: 'urgent',
  source: 'senior_app',
  status: 'DISPATCHED',
  image_url: null,
  has_photo: false,
  created_at: minutesAgo(140),
  updated_at: minutesAgo(12),
  dispatched_at: minutesAgo(90),
  accepted_at: null,
  completed_at: null,
  cancelled_at: null,
  senior: {
    id: 'demo-senior-1',
    email: 'demo.senior@sahayak.test',
    full_name: 'Meera Deshmukh',
    phone_number: '+91 98200 00001',
  },
  assigned_volunteer: null,
});

export const demoEmergency = (): EmergencyEvent => ({
  id: 'demo-sos-1',
  senior_id: 'demo-senior-2',
  trigger_type: 'acoustic_distress',
  source: 'senior_app',
  help_request_id: null,
  detail: null,
  latitude: 28.6315,
  longitude: 77.2167,
  escalated_to_112: false,
  escalated_at: null,
  status: 'LOGGED',
  created_at: minutesAgo(8),
  updated_at: minutesAgo(8),
  senior: {
    id: 'demo-senior-2',
    email: 'demo.senior2@sahayak.test',
    full_name: 'Harpreet Singh',
    phone_number: '+91 98200 00002',
  },
});