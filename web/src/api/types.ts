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

export interface CurrentUser {
  id: string;
  email: string;
  role: string | null;
  is_active: boolean;
}

export type PriorityLabel = 'URGENT' | 'NORMAL';

export const priorityLabel = (p: RequestPriority): PriorityLabel =>
  p === 'urgent' ? 'URGENT' : 'NORMAL';