import logger from '../utils/logger';
import { TTSError } from '../utils/errors';
import KannadaTTS from './kannada';
import EnglishTTS from './english';

export class TTSManager {
  private kannada: KannadaTTS;
  private english: EnglishTTS;

  constructor() {
    this.kannada = new KannadaTTS();
    this.english = new EnglishTTS();

    logger.info('TTS Manager initialized');
  }

  /**
   * Synthesize text to speech
   * For Tulu, falls back to Kannada (known scope decision)
   */
  async synthesize(
    text: string,
    language: 'kannada' | 'english' | 'tulu'
  ): Promise<Buffer> {
    try {
      logger.debug({ language, textLength: text.length }, 'Starting TTS synthesis');

      let audioBuffer: Buffer;

      switch (language) {
        case 'kannada':
          audioBuffer = await this.kannada.synthesize(text);
          break;

        case 'english':
          audioBuffer = await this.english.synthesize(text);
          break;

        case 'tulu':
          // KNOWN SCOPE DECISION: Tulu speakers get Kannada TTS output
          // (No open-source Tulu TTS exists yet; most Tulu speakers are Kannada-bilingual)
          logger.info(
            'Tulu requested, using Kannada TTS (no Tulu TTS available)'
          );
          audioBuffer = await this.kannada.synthesize(text);
          break;

        default:
          throw new TTSError(`Unsupported language: ${language}`);
      }

      logger.info(
        { language, audioSize: audioBuffer.length },
        'TTS synthesis complete'
      );

      return audioBuffer;
    } catch (error) {
      logger.error({ error, language }, 'TTS synthesis failed');
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
      tulu: {
        name: 'Kannada (fallback for Tulu)',
        language: 'Kannada',
        note: 'Tulu speakers receive Kannada output (scope decision)',
      },
    };
  }
}

export default TTSManager;