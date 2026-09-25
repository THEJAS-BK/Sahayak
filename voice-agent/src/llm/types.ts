/**
 * LLM abstraction layer - works with any provider
 */

export type LLMProvider = 'groq' | 'claude' | 'ollama';

export interface DialogueTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClassificationResult {
  isUrgent: boolean;
  classification: 'routine' | 'urgent';
  confidence: number;
  reasoning: string;
}

export interface RequestExtraction {
  requirement_type: string; // "medicine", "transport", "check-on", etc.
  detail: string; // free-text user request
  priority: 'routine' | 'urgent';
  confidence: number;
  needsMoreInfo: boolean;
}

export interface LLMStreamChunk {
  type: 'text' | 'done';
  content: string;
}