import type {
  AuditLogListResult,
  CurrentUser,
  PoliceRequest,
  RequestListResult,
  VerificationListResult,
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

export function fetchVerifications(params?: Record<string, string>): Promise<VerificationListResult> {
  const query = params && Object.keys(params).length > 0
    ? `?${new URLSearchParams(params).toString()}`
    : '';
  return request(`/verifications${query}`);
}

export function reviewVerification(
  id: string,
  status: 'APPROVED' | 'REJECTED',
): Promise<{ verification: unknown }> {
  return request(`/verifications/${id}`, { method: 'PATCH', body: { status } });
}

export function fetchAuditLogs(limit = 10): Promise<AuditLogListResult> {
  return request(`/audit-logs?limit=${limit}`);
}