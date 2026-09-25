/**
 * STT abstraction types
 */

export interface STTResult {
  text: string;
  confidence: number;
  language: 'kannada' | 'english' | 'tulu';
  isFinal: boolean;
  timestamps?: Array<{
    start: number;
    end: number;
    word: string;
  }>;
}

export interface STTConfig {
  language: 'kannada' | 'english' | 'tulu';
  sampleRate: number;
  modelDir?: string;
  device?: 'cpu' | 'cuda';
}

export interface STTResult {
  text: string;
  confidence: number;
  language: 'kannada' | 'english' | 'tulu';
  isFinal: boolean;
  timestamps?: Array<{
    start: number;
    end: number;
    word: string;
  }>;
}

export interface STTConfig {
  language: 'kannada' | 'english' | 'tulu';
  sampleRate: number;
  modelDir?: string;
  device?: 'cpu' | 'cuda';
}