import logger from '../utils/logger';
import { STTResult } from './types';
import { STTError } from '../utils/errors';
import KannadaSTT from './kannada';
import EnglishSTT from './english';
import TuluSTT from './tulu';

export class STTManager {
  private kannada: KannadaSTT;
  private english: EnglishSTT;
  private tulu: TuluSTT;

  constructor() {
    this.kannada = new KannadaSTT();
    this.english = new EnglishSTT();
    this.tulu = new TuluSTT();

    logger.info('STT Manager initialized with all language models');
  }

  /**
   * Transcribe audio based on preferred language
   */
  async transcribe(
    audioBuffer: Buffer,
    language: 'kannada' | 'english' | 'tulu',
    sampleRate?: number
  ): Promise<STTResult> {
    try {
      logger.debug({ language, bufferSize: audioBuffer.length }, 'Starting transcription');

      let result: STTResult;

      switch (language) {
        case 'kannada':
          result = await this.kannada.transcribe(audioBuffer, sampleRate);
          break;
        case 'english':
          result = await this.english.transcribe(audioBuffer, sampleRate);
          break;
        case 'tulu':
          result = await this.tulu.transcribe(audioBuffer, sampleRate);
          break;
        default:
          throw new STTError(`Unsupported language: ${language}`);
      }

      logger.info(
        { language, textLength: result.text.length, confidence: result.confidence },
        'Transcription complete'
      );

      return result;
    } catch (error) {
      logger.error({ error, language }, 'Transcription failed');
      throw error;
    }
  }

  /**
   * Get model info for all languages
   */
  getModelInfo(): Record<string, any> {
    return {
      kannada: this.kannada.getModelInfo(),
      english: this.english.getModelInfo(),
      tulu: this.tulu.getModelInfo(),
    };
  }
}

export default STTManager;