import { pipeline } from '@xenova/transformers';
import logger from '../utils/logger';
import { STTResult } from './types';
import { STTError } from '../utils/errors';

export class EnglishSTT {
  private transcriber: any;
  private isLoading: boolean = false;
  private isReady: boolean = false;

  constructor() {
    logger.info('EnglishSTT initializing (lazy load on first use)');
  }

  private async ensureLoaded(): Promise<void> {
    if (this.isReady) return;
    if (this.isLoading) {
      while (this.isLoading) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return;
    }

    this.isLoading = true;

    try {
      logger.info('Loading English Whisper model (Xenova/whisper-small.en)');

      this.transcriber = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-small.en',
        
      );

      this.isReady = true;
      logger.info('English Whisper model loaded');
    } catch (error) {
      this.isLoading = false;
      logger.error({ error }, 'Failed to load English Whisper');
      throw new STTError('Failed to load English STT model', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.isLoading = false;
  }

  async transcribe(
    audioBuffer: Buffer,
    sampleRate: number = 8000
  ): Promise<STTResult> {
    try {
      await this.ensureLoaded();

      const resampledBuffer = this.resampleAudio(audioBuffer, sampleRate, 16000);
      const float32Audio = this.bufferToFloat32(resampledBuffer);

      logger.debug({ audioLength: float32Audio.length }, 'Transcribing English audio');

      const result = await this.transcriber(float32Audio, {
        language: 'en',
        max_new_tokens: 128,
      });

      return {
        text: result.text || '',
        confidence: result.confidence || 0.85,
        language: 'english',
        isFinal: true,
      };
    } catch (error) {
      logger.error({ error }, 'English transcription failed');
      throw new STTError('English transcription failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private resampleAudio(
    buffer: Buffer,
    fromRate: number,
    toRate: number
  ): Buffer {
    if (fromRate === toRate) return buffer;

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

  private bufferToFloat32(buffer: Buffer): Float32Array {
    const float32 = new Float32Array(buffer.length / 2);

    for (let i = 0; i < buffer.length; i += 2) {
      const int16 = buffer.readInt16LE(i);
      float32[i / 2] = int16 / 32768;
    }

    return float32;
  }

  getModelInfo(): { name: string; language: string } {
    return {
      name: 'Xenova/whisper-small.en',
      language: 'English',
    };
  }
}

export default EnglishSTT;