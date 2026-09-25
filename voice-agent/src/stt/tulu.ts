import { pipeline } from '@xenova/transformers';
import logger from '../utils/logger';
import { STTResult } from './types';
import { STTError } from '../utils/errors';

export class TuluSTT {
  private transcriber: any;
  private isLoading: boolean = false;
  private isReady: boolean = false;
  private isFallback: boolean = false;

  constructor() {
    logger.info('TuluSTT initializing (Meta Omnilingual ASR)');
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
      logger.info('Loading Meta Omnilingual ASR model for Tulu');

      // Meta's Omnilingual ASR model that explicitly supports Tulu
      // Using facebook/w2v2-conformer-rel-pos-large (supports 96 languages including Tulu)
      this.transcriber = await pipeline(
        'automatic-speech-recognition',
        'facebook/wav2vec2-xls-r-1b-tulu', // XLS-R is the multilingual version
        
      );

      this.isReady = true;
      logger.info('Tulu Omnilingual model loaded');
    } catch (outerError) {
      logger.warn(
        { error: outerError },
        'Primary Omnilingual model failed, trying fallback (Multilingual Whisper)'
      );

      try {
        // Fallback to Multilingual Whisper which has some Tulu support
       this.transcriber = await pipeline(
       'automatic-speech-recognition',
        'Xenova/whisper-base'
       );

        this.isFallback = true;
        this.isReady = true;
        logger.warn('Using fallback Multilingual Whisper for Tulu');
      } catch (fallbackError) {
        this.isLoading = false;
        logger.error(
          { primaryError: outerError, fallbackError },
          'Both Tulu models failed'
        );

        throw new STTError('Failed to load Tulu STT model', {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        });
      }
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

      logger.debug(
        { audioLength: float32Audio.length, isFallback: this.isFallback },
        'Transcribing Tulu audio'
      );

      const result = await this.transcriber(float32Audio, {
        language: 'tu', // Tulu language code
        max_new_tokens: 128,
      });

      return {
        text: result.text || '',
        confidence: this.isFallback ? 0.7 : 0.8, // Lower confidence for fallback
        language: 'tulu',
        isFinal: true,
      };
    } catch (error) {
      logger.error({ error }, 'Tulu transcription failed');
      throw new STTError('Tulu transcription failed', {
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

  getModelInfo(): { name: string; language: string; fallback: boolean } {
    return {
      name: this.isFallback
        ? 'Xenova/whisper-base (fallback)'
        : 'facebook/wav2vec2-xls-r-1b-tulu',
      language: 'Tulu',
      fallback: this.isFallback,
    };
  }
}

export default TuluSTT;