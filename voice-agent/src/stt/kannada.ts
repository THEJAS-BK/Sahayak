import { pipeline, AutoModelForSpeechSeq2Seq, AutoProcessor } from '@xenova/transformers';
import logger from '../utils/logger';
import { STTResult } from './types';
import { STTError } from '../utils/errors';

export class KannadaSTT {
  private model: any;
  private processor: any;
  private transcriber: any;
  private isLoading: boolean = false;
  private isReady: boolean = false;

  constructor() {
    logger.info('KannadaSTT initializing (lazy load on first use)');
  }

  /**
   * Lazy load model on first use
   */
  private async ensureLoaded(): Promise<void> {
    if (this.isReady) return;
    if (this.isLoading) {
      // Wait for loading to complete
      while (this.isLoading) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return;
    }

    this.isLoading = true;

    try {
      logger.info('Loading Kannada Whisper model (ARTPARK-IISc/whisper-medium-vaani-kannada)');

      // Use @xenova/transformers for browser-compatible Whisper
      // This automatically handles model download and caching
      this.transcriber = await pipeline(
  'automatic-speech-recognition',
  'ARTPARK-IISc/whisper-medium-vaani-kannada'
);

      this.isReady = true;
      logger.info('Kannada Whisper model loaded successfully');
    } catch (error) {
      this.isLoading = false;
      logger.error({ error }, 'Failed to load Kannada Whisper model');
      throw new STTError('Failed to load Kannada STT model', {
        model: 'ARTPARK-IISc/whisper-medium-vaani-kannada',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.isLoading = false;
  }

  /**
   * Transcribe PCM audio buffer to Kannada text
   */
  async transcribe(
    audioBuffer: Buffer,
    sampleRate: number = 8000
  ): Promise<STTResult> {
    try {
      await this.ensureLoaded();

      // Convert 8kHz to 16kHz if needed (Whisper expects 16kHz)
      const resampledBuffer = this.resampleAudio(audioBuffer, sampleRate, 16000);

      // Convert buffer to Float32Array for model
      const float32Audio = this.bufferToFloat32(resampledBuffer);

      logger.debug({ audioLength: float32Audio.length }, 'Transcribing Kannada audio');

      const result = await this.transcriber(float32Audio, {
        language: 'ka', // Kannada language code
        max_new_tokens: 128,
      });

      return {
        text: result.text || '',
        confidence: result.confidence || 0.8,
        language: 'kannada',
        isFinal: true,
      };
    } catch (error) {
      logger.error({ error }, 'Kannada transcription failed');
      throw new STTError('Kannada transcription failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Resample audio from one sample rate to another
   */
  private resampleAudio(
    buffer: Buffer,
    fromRate: number,
    toRate: number
  ): Buffer {
    if (fromRate === toRate) {
      return buffer;
    }

    const float32 = this.bufferToFloat32(buffer);
    const ratio = toRate / fromRate;
    const newLength = Math.ceil(float32.length * ratio);
    const resampled = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const srcIndex = i / ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexFrac = srcIndex - srcIndexFloor;

      if (srcIndexFloor + 1 < float32.length) {
        resampled[i] =
          float32[srcIndexFloor] * (1 - srcIndexFrac) +
          float32[srcIndexFloor + 1] * srcIndexFrac;
      } else {
        resampled[i] = float32[srcIndexFloor] || 0;
      }
    }

    return Buffer.from(resampled.buffer);
  }

  /**
   * Convert PCM16 buffer to Float32Array
   */
  private bufferToFloat32(buffer: Buffer): Float32Array {
    const float32 = new Float32Array(buffer.length / 2);

    for (let i = 0; i < buffer.length; i += 2) {
      const int16 = buffer.readInt16LE(i);
      float32[i / 2] = int16 / 32768; // Normalize to [-1, 1]
    }

    return float32;
  }

  /**
   * Get model info
   */
  getModelInfo(): { name: string; language: string } {
    return {
      name: 'ARTPARK-IISc/whisper-medium-vaani-kannada',
      language: 'Kannada',
    };
  }
}

export default KannadaSTT;