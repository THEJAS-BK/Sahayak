import axios from 'axios';
import logger from '../utils/logger';
import { TTSError } from '../utils/errors';

export class KannadaTTS {
  private bhashiniEndpoint: string;
  private fallbackEndpoint: string;

  constructor() {
    // Use Bhashini gateway (government free API)
    this.bhashiniEndpoint =
      process.env.BHASHINI_ENDPOINT ||
      'https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline';

    // Self-hosted fallback
    this.fallbackEndpoint = process.env.INDICF5_ENDPOINT || 'http://localhost:5000';

    logger.info('KannadaTTS initialized (AI4Bharat IndicF5)');
  }

  /**
   * Synthesize Kannada text to speech
   * Returns audio buffer
   */
  async synthesize(text: string): Promise<Buffer> {
    try {
      logger.debug({ textLength: text.length }, 'Synthesizing Kannada speech');

      // Try Bhashini API first (government service)
      try {
        const audioBuffer = await this.synthesizeViaBhashini(text);
        return audioBuffer;
      } catch (bhashiniError) {
        logger.warn({ error: bhashiniError }, 'Bhashini API failed, trying self-hosted');

        // Fallback to self-hosted IndicF5
        return await this.synthesizeViaSelfHosted(text);
      }
    } catch (error) {
      logger.error({ error }, 'Kannada TTS failed');
      throw new TTSError('Failed to synthesize Kannada speech', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Synthesize via Bhashini (free government gateway)
   * Requires registration, but no API key for demo purposes
   */
  private async synthesizeViaBhashini(text: string): Promise<Buffer> {
    try {
      const payload = {
        pipelineRequestConfig: {
          language: {
            sourceLanguage: 'kn', // Kannada
          },
          controlConfig: {
            dataType: 'text',
          },
        },
        taskType: 'tts',
        input: [
          {
            source: text,
            target: 'kn',
          },
        ],
      };

      const response = await axios.post(this.bhashiniEndpoint, payload, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Extract audio from response
      if (response.data?.pipelineResponse?.[0]?.audio) {
        const base64Audio = response.data.pipelineResponse[0].audio[0].audioContent;
        return Buffer.from(base64Audio, 'base64');
      }

      throw new Error('No audio in Bhashini response');
    } catch (error) {
      logger.debug({ error }, 'Bhashini API failed');
      throw error;
    }
  }

  /**
   * Synthesize via self-hosted IndicF5
   * Assumes a local TTS service running (e.g., via FastAPI)
   */
  private async synthesizeViaSelfHosted(text: string): Promise<Buffer> {
    try {
      const response = await axios.post(
        `${this.fallbackEndpoint}/api/tts`,
        {
          text,
          language: 'kannada',
          speaker: 'default',
        },
        {
          responseType: 'arraybuffer',
          timeout: 15000,
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      logger.debug({ error }, 'Self-hosted IndicF5 failed');
      throw error;
    }
  }

  /**
   * Get model info
   */
  getModelInfo(): { name: string; language: string } {
    return {
      name: 'AI4Bharat IndicF5',
      language: 'Kannada',
    };
  }
}

export default KannadaTTS;