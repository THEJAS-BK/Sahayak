// Global type definitions

export interface SeniorProfile {
  senior_id: string;
  phone_number: string;
  name: string;
  preferred_language: 'kannada' | 'english' | 'tulu';
  standing_medications?: string[];
  medical_conditions?: string[];
}
export interface DialogueTurn {
  role: 'user' | 'assistant';
  content: string;
}


export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  transcriptPartial?: string;
  confidenceScore?: number;
}

export interface StructuredRequest {
  senior_id: string;
  requirement_type: string; // e.g., "medicine", "transport", "check-on"
  detail: string;
  priority: 'routine' | 'urgent';
  source: 'app' | 'phone_call';
}

export interface EmergencyEvent {
  senior_id: string;
  triggered_by: 'distress_detection' | 'llm_classification';
  detail: string;
  source: 'app' | 'phone_call';
}

export interface ConversationState {
  sessionId: string;
  seniorProfile: SeniorProfile;
  turns: ConversationTurn[];
  distressDetected: boolean;
  distressConfirmations: number; // two consecutive detections required
  requestExtracted?: StructuredRequest;
  emergencyExtracted?: EmergencyEvent;
  callStartTime: number;
  audioFrameCount: number;
}

export interface TwiMLMediaStreamMessage {
  event: string;
  streamSid: string;
  accountSid?: string;
  sequenceNumber?: number;
  media?: {
    payload: string; // base64-encoded μ-law 8kHz audio
  };
  mark?: {
    name: string;
  };
}

export interface AudioFrame {
  payload: Buffer;
  timestamp: number;
  sampleRate: number; // 8000 for Twilio
}