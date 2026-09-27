export type RequestStatus =
  | 'PENDING'
  | 'MATCHING'
  | 'DISPATCHED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'UNASSIGNED';

export type RequestPriority = 'normal' | 'urgent';

export type VerificationRole = 'senior' | 'volunteer';

export type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface SeniorSummary {
  id: string;
  email?: string;
  full_name: string | null;
  phone_number: string | null;
}

export interface VolunteerSummary {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  organization?: string | null;
}

export interface PoliceRequest {
  id: string;
  category: string;
  description: string;
  details?: unknown;
  latitude: number | null;
  longitude: number | null;
  priority: RequestPriority;
  source: string;
  status: RequestStatus;
  dispatch_attempt?: number;
  /** Snapshot of who the request was offered to. Empty means nobody was in range. */
  dispatch_batch?: Array<{ id: string; latitude?: number; longitude?: number; distance_m?: number }> | null;
  created_at: string;
  updated_at: string;
  dispatched_at?: string | null;
  accepted_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  senior: SeniorSummary;
  assigned_volunteer: VolunteerSummary | null;
}

export interface RequestListResult {
  requests: PoliceRequest[];
  next_cursor: string | null;
}

/** A volunteer a police officer can hand a request to (P-02). */
export interface AssignableVolunteer {
  id: string;
  email: string;
  full_name: string | null;
  phone_number: string | null;
  organization: string | null;
  skills: string[];
  is_available: boolean;
  is_verified: boolean;
  latitude: number | null;
  longitude: number | null;
  distance_m: number | null;
  has_active_assignment: boolean;
  active_request_id: string | null;
  /** Server-side verdict for P-05: approved, on duty, not already on a job. */
  can_assign: boolean;
}

export interface AssignableVolunteerListResult {
  volunteers: AssignableVolunteer[];
  next_cursor: string | null;
}

export interface PoliceAssignmentResult {
  request_id: string;
  status: RequestStatus;
  category: string;
  volunteer: { id: string; full_name: string | null; phone_number: string | null; email: string };
  senior: { id: string; full_name: string | null; phone_number: string | null; email: string };
}

export interface VerificationSummary {
  id: string;
  email: string;
  full_name: string | null;
  role: VerificationRole;
  status: VerificationStatus;
  created_at: string;
  reviewed_at: string | null;
}

export interface VerificationListResult {
  verifications: VerificationSummary[];
  next_cursor: string | null;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  created_at: string;
}

export interface AuditLogListResult {
  logs: AuditLog[];
  next_cursor: string | null;
}

export type EmergencyStatus = 'LOGGED' | 'REVIEWED';

export type EmergencyTrigger =
  | 'semantic_llm'
  | 'acoustic_distress'
  | 'keyword_repetition';

/** E-02: an SOS event in the police feed. */
export interface EmergencyEvent {
  id: string;
  senior_id: string;
  trigger_type: EmergencyTrigger;
  source: string;
  help_request_id: string | null;
  detail: Record<string, unknown> | null;
  latitude: number | null;
  longitude: number | null;
  escalated_to_112: boolean;
  escalated_at: string | null;
  status: EmergencyStatus;
  created_at: string;
  updated_at: string;
  senior: {
    id: string;
    email: string;
    full_name: string | null;
    phone_number: string | null;
  };
}

export interface EmergencyListResult {
  events: EmergencyEvent[];
  next_cursor: string | null;
}

export type VerificationDerivedStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NONE';

/** P-06: a senior in the police directory. */
export interface PoliceSenior {
  id: string;
  email: string;
  is_active: boolean;
  full_name: string | null;
  phone_number: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  preferred_language: string | null;
  is_verified: boolean;
  verification_status: VerificationDerivedStatus;
  request_count: number;
  created_at: string;
}

export interface SeniorListResult {
  seniors: PoliceSenior[];
  next_cursor: string | null;
}

/** P-07: one senior, with their history. Aadhaar is never returned. */
export interface SeniorDetail extends PoliceSenior {
  emergency_contact: {
    name?: string;
    phone?: string;
    relation?: string;
  } | null;
  verifications: Array<{
    id: string;
    role: VerificationRole;
    status: VerificationStatus;
    review_reason: string | null;
    reviewer_email: string | null;
    reviewed_at: string | null;
    created_at: string;
  }>;
  requests: Array<{
    id: string;
    category: string;
    status: RequestStatus;
    priority: RequestPriority;
    created_at: string;
    completed_at: string | null;
  }>;
  emergencies: Array<{
    id: string;
    trigger_type: EmergencyTrigger;
    status: EmergencyStatus;
    created_at: string;
  }>;
}

export interface VolunteerAssignment {
  request_id: string;
  category: string;
  status: RequestStatus;
  created_at: string;
  dispatched_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  /** The distance recorded in the dispatch batch at the time it was offered. */
  distance_m: number | null;
  /** Whether this volunteer actually got the job, not merely the first offer. */
  was_assigned: boolean;
  /** They were offered it and said no. */
  declined: boolean;
}

/** P-05b: one volunteer, with assignment history from the dispatch batch. */
export interface VolunteerDetail {
  id: string;
  email: string;
  is_active: boolean;
  full_name: string | null;
  phone_number: string | null;
  organization: string | null;
  skills: string[];
  club_id: string | null;
  id_proof_ref: string | null;
  is_available: boolean;
  is_verified: boolean;
  verification_status: VerificationDerivedStatus;
  base_latitude: number | null;
  base_longitude: number | null;
  current_latitude: number | null;
  current_longitude: number | null;
  location_updated_at: string | null;
  active_request_id: string | null;
  assignments: VolunteerAssignment[];
  created_at: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  role: string | null;
  is_active: boolean;
}

export type PriorityLabel = 'URGENT' | 'NORMAL';

export const priorityLabel = (p: RequestPriority): PriorityLabel =>
  p === 'urgent' ? 'URGENT' : 'NORMAL';