import type {
  AssignableVolunteerListResult,
  AuditLogListResult,
  CurrentUser,
  EmergencyListResult,
  PoliceAssignmentResult,
  PoliceRequest,
  RequestListResult,
  SeniorDetail,
  SeniorListResult,
  VerificationListResult,
  VerificationDetail,
  VolunteerDetail,
} from './types';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export const TOKEN_KEY = 'sahayak_token';
export const REFRESH_TOKEN_KEY = 'sahayak_refresh_token';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Role from the stored session. Read from the JWT as a fallback so a session
 * written before this key existed still resolves. The backend enforces roles on
 * every request regardless; this only decides what the UI shows.
 */
export function getSessionRole(): string | null {
  const stored = localStorage.getItem('sahayak_user');
  if (stored) {
    try {
      const role = (JSON.parse(stored) as { role?: string | null }).role;
      if (role) return role;
    } catch {
      // fall through to the token
    }
  }
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function setSession(payload: {
  access_token: string;
  refresh_token?: string | null;
  user?: { id: string; role: string | null; is_active: boolean };
}): void {
  localStorage.setItem(TOKEN_KEY, payload.access_token);
  const rt = payload.refresh_token;
  if (rt) localStorage.setItem(REFRESH_TOKEN_KEY, rt);
  else localStorage.removeItem(REFRESH_TOKEN_KEY);
  if (payload.user) localStorage.setItem('sahayak_user', JSON.stringify(payload.user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem('sahayak_user');
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (res.status === 401) {
    clearSession();
    if (window.location.pathname !== '/login') window.location.assign('/login');
    throw new ApiError(401, 'UNAUTHENTICATED', 'Access token required');
  }

  const json = (await res.json().catch(() => null)) as
    | { success: boolean; data: T; error?: { code: string; message: string } }
    | null;

  if (!json) {
    throw new ApiError(res.status, 'INVALID_RESPONSE', `Unexpected response (${res.status})`);
  }
  if (!res.ok || !json.success) {
    throw new ApiError(
      res.status,
      json.error?.code ?? 'REQUEST_FAILED',
      json.error?.message ?? `Request failed (${res.status})`,
    );
  }
  return json.data;
}

export interface OtpVerifyResult {
  access_token: string;
  refresh_token?: string;
  user: { id: string; role: string | null; is_active: boolean };
}

export function requestOtp(email: string): Promise<{ sent: boolean }> {
  return request('/auth/otp/request', { method: 'POST', body: { email } });
}

export function verifyOtp(email: string, code: string): Promise<OtpVerifyResult> {
  return request('/auth/otp/verify', { method: 'POST', body: { email, code } });
}

export function fetchCurrentUser(): Promise<CurrentUser> {
  return request('/me');
}

export function fetchPoliceRequests(params?: Record<string, string>): Promise<RequestListResult> {
  const query = params && Object.keys(params).length > 0
    ? `?${new URLSearchParams(params).toString()}`
    : '';
  return request(`/police/requests${query}`);
}

export function fetchRequestDetail(id: string): Promise<{ request: PoliceRequest }> {
  return request(`/requests/${id}`);
}

/** P-02: volunteers that can be dispatched by hand, nearest first. */
/**
 * Deliberately sends no coordinates: volunteer positions are not reliable yet
 * (registration-time `base_*` is usually just a locality), so a "nearest"
 * list would be false precision. The list is ordered "can take it first".
 * Pass `{ lat, lng }` once real positions exist — see
 * `plans/deferred-before-production.md`.
 */
export interface AssignableVolunteerQuery {
  lat?: number;
  lng?: number;
  search?: string;
}

export function fetchAssignableVolunteers(
  query: AssignableVolunteerQuery = {},
): Promise<AssignableVolunteerListResult> {
  const params = new URLSearchParams();
  if (query.lat != null && query.lng != null) {
    params.set('lat', String(query.lat));
    params.set('lng', String(query.lng));
  }
  if (query.search) params.set('search', query.search);
  return request(`/police/volunteers?${params.toString()}`);
}

/** P-03: hand a request to one named volunteer. */
export function assignRequestToVolunteer(
  requestId: string,
  volunteerId: string,
): Promise<PoliceAssignmentResult> {
  return request(`/police/requests/${requestId}/assign`, {
    method: 'PATCH',
    body: { volunteer_id: volunteerId },
  });
}

export function fetchVerifications(params?: Record<string, string>): Promise<VerificationListResult> {
  const query = params && Object.keys(params).length > 0
    ? `?${new URLSearchParams(params).toString()}`
    : '';
  return request(`/verifications${query}`);
}
export function fetchVerificationDetail(id: string): Promise<{ verification: VerificationDetail }> {
  return request(`/verifications/${id}`);
}
export function reviewVerification(
  id: string,
  status: 'APPROVED' | 'REJECTED',
  reason?: string,
): Promise<{ verification: unknown }> {
  return request(`/verifications/${id}`, {
    method: 'PATCH',
    body: {
      status,
      ...(reason ? { reason } : {}),
    },
  });
}
/**
 * P-02: recent activity. Takes a filter object rather than a bare limit so the
 * dedicated Audit Logs page can reuse this instead of adding a second call shape.
 */
export interface AuditLogQuery {
  entity_type?: string;
  entity_id?: string;
  /** Pass the string 'null' to select system-generated entries, per P-02. */
  actor_id?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export function fetchAuditLogs(query: AuditLogQuery = {}): Promise<AuditLogListResult> {
  return request(`/audit-logs?${new URLSearchParams(query as Record<string, string>).toString()}`);
}

/** E-02: the police SOS feed. */
export interface EmergencyQuery {
  status?: 'LOGGED' | 'REVIEWED';
  senior_id?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export function fetchEmergencyEvents(
  query: EmergencyQuery = {},
): Promise<EmergencyListResult> {
  return request(`/police/emergency-events?${new URLSearchParams(query as Record<string, string>).toString()}`);
}

/** E-03: LOGGED → REVIEWED. */
export function reviewEmergencyEvent(
  id: string,
): Promise<{ event: { event_id: string; status: 'REVIEWED' } }> {
  return request(`/police/emergency-events/${id}`, {
    method: 'PATCH',
    body: { status: 'REVIEWED' },
  });
}

/** P-06: the senior directory. */
export interface SeniorQuery {
  search?: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NONE';
  limit?: number;
  cursor?: string;
}

export function fetchSeniors(query: SeniorQuery = {}): Promise<SeniorListResult> {
  return request(`/police/seniors?${new URLSearchParams(query as Record<string, string>).toString()}`);
}

/** P-07: one senior with verification, request and emergency history. */
export function fetchSenior(id: string): Promise<{ senior: SeniorDetail }> {
  return request(`/police/seniors/${id}`);
}

/** P-05b: one volunteer with assignment history. */
export function fetchVolunteer(id: string): Promise<{ volunteer: VolunteerDetail }> {
  return request(`/police/volunteers/${id}`);
}