import type {
  AssignableVolunteerListResult,
  AuditLogListResult,
  CurrentUser,
  EmergencyListResult,
  PoliceAssignmentResult,
  PoliceOverview,
  PoliceRequest,
  RequestListResult,
  SeniorDetail,
  SeniorListResult,
  VerificationDetail,
  VerificationListResult,
  VerificationDetail,
  VolunteerDetail,
} from './types';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export const TOKEN_KEY = 'sahayak_token';
export const REFRESH_TOKEN_KEY = 'sahayak_refresh_token';
const USER_KEY = 'sahayak_user';

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
  const stored = localStorage.getItem(USER_KEY);
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
  return decodeJwtRole(token);
}

/**
 * A JWT payload is base64**url**: `-` and `_` stand in for `+` and `/`, and the
 * encoding is unpadded. `atob` only speaks standard base64, so handing it the
 * raw segment throws `InvalidCharacterError` for any real token long enough to
 * encode those characters — which is every one of them. Without this the
 * fallback above never worked and an officer whose `sahayak_user` key was
 * missing was locked out of the console as "not police".
 */
function decodeJwtRole(token: string): string | null {
  const segment = token.split('.')[1];
  if (!segment) return null;
  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded)) as { role?: string | null };
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
  // A payload with no user (the "paste a token" sign-in) must clear the previous
  // session's role, not inherit it. Leaving a stale `senior` in place sent the
  // next officer to the "Police access only" wall despite a valid police token.
  if (payload.user) localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
  else localStorage.removeItem(USER_KEY);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

/**
 * Matches the mobile client's 10 s budget. Without it a hung Neon connection
 * leaves a console page on "Loading…" forever with no way for the officer to
 * tell that apart from a slow query.
 */
const REQUEST_TIMEOUT_MS = 10_000;

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new ApiError(0, 'TIMEOUT', 'The server took too long to respond. Try again.');
    }
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection.');
  } finally {
    clearTimeout(timer);
  }

  const json = (await res.json().catch(() => null)) as
    | { success: boolean; data: T; error?: { code: string; message: string } }
    | null;

  if (!json) {
    throw new ApiError(res.status, 'INVALID_RESPONSE', `Unexpected response (${res.status})`);
  }
  if (!res.ok || !json.success) {
    const code = json.error?.code ?? 'REQUEST_FAILED';
    const message = json.error?.message ?? `Request failed (${res.status})`;
    // Only a genuinely unusable access token ends the session. A 401 that is
    // really about the credential the user is typing — a wrong OTP, sign-in
    // attempts at /auth/otp/* — must surface its own message and leave an
    // already-signed-in officer alone. Previously every 401 read as "Access
    // token required", so a mistyped code logged you out and lied about why.
    if (res.status === 401 && code === 'UNAUTHENTICATED') {
      clearSession();
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    throw new ApiError(res.status, code, message);
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

/**
 * A-04. Police accounts are issued an access token and no refresh token, so
 * there is nothing server-side to revoke for them and this call is skipped
 * rather than made with an empty body (which the endpoint rejects as a 400).
 * Callers must still clear the local session either way.
 */
export function logout(): Promise<{ logged_out: boolean } | null> {
  const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refresh) return Promise.resolve(null);
  return request('/auth/logout', { method: 'POST', body: { refresh_token: refresh } });
}

export function fetchCurrentUser(): Promise<CurrentUser> {
  return request('/me');
}

/** P-08: the Dashboard tiles, counted in SQL rather than over a 200-row page. */
export function fetchPoliceOverview(day?: { from: string; to: string }): Promise<PoliceOverview> {
  const query = day ? `?${new URLSearchParams({ from: day.from, to: day.to }).toString()}` : '';
  return request(`/police/overview${query}`);
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
  /** 'true' for on duty only, 'false' for off duty only, omitted for both. */
  available?: 'true' | 'false';
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
  if (query.available) params.set('available', query.available);
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

/** V-02: the submitted form behind a queue row, so a decision has evidence. */
export function fetchVerification(id: string): Promise<{ verification: VerificationDetail }> {
  return request(`/verifications/${id}`);
}

/**
 * V-03. `reason` is optional in the API but is what the applicant is told when
 * a registration is turned down, so a rejection without one is a dead end for
 * the person on the other side.
 */
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
): Promise<{ verification: { id: string; status: 'APPROVED' | 'REJECTED'; review_reason: string | null; reviewed_at: string | null } }> {
  return request(`/verifications/${id}`, {
    method: 'PATCH',
    body: { status, ...(reason?.trim() ? { reason: reason.trim() } : {}) },
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