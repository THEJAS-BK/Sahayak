/**
 * Custom error types for voice-agent
 */

export class VoiceAgentError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'VoiceAgentError';
  }
}

export class AuthenticationError extends VoiceAgentError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'AUTH_ERROR', 401, details);
    this.name = 'AuthenticationError';
  }
}

export class BackendError extends VoiceAgentError {
  constructor(message: string, statusCode: number = 500, details?: Record<string, any>) {
    super(message, 'BACKEND_ERROR', statusCode, details);
    this.name = 'BackendError';
  }
}

export class STTError extends VoiceAgentError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'STT_ERROR', 500, details);
    this.name = 'STTError';
  }
}

export class TTSError extends VoiceAgentError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'TTS_ERROR', 500, details);
    this.name = 'TTSError';
  }
}

export class LLMError extends VoiceAgentError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'LLM_ERROR', 500, details);
    this.name = 'LLMError';
  }
}

export class DistressDetectionError extends VoiceAgentError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'DISTRESS_ERROR', 500, details);
    this.name = 'DistressDetectionError';
  }
}

export class CallTerminatedError extends VoiceAgentError {
  constructor(message: string = 'Call terminated', details?: Record<string, any>) {
    super(message, 'CALL_TERMINATED', 400, details);
    this.name = 'CallTerminatedError';
  }
}