/**
 * Types for Sahayak backend API communication
 */

export interface ServiceCredential {
  role: 'voice-agent-service';
  iat: number;
  exp: number;
}

export interface SeniorLookupResponse {
  senior_id: string;
  name: string;
  preferred_language: 'kannada' | 'english' | 'tulu';
  phone_number: string;
  standing_medications?: string[];
  medical_conditions?: string[];
}

export interface CreateRequestPayload {
  senior_id: string;
  requirement_type: string;
  detail: string;
  priority: 'routine' | 'urgent';
  source: 'app' | 'phone_call';
}

export interface CreateRequestResponse {
  request_id: string;
  senior_id: string;
  status: string;
  created_at: string;
}

export interface CreateEmergencyEventPayload {
  senior_id: string;
  triggered_by: 'distress_detection' | 'llm_classification';
  detail: string;
  source: 'app' | 'phone_call';
}

export interface CreateEmergencyEventResponse {
  emergency_event_id: string;
  senior_id: string;
  status: string;
  police_notified: boolean;
  created_at: string;
}

export interface BackendErrorResponse {
  error: string;
  code: string;
  statusCode: number;
  details?: Record<string, any>;
}