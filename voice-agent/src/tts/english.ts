import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import logger from '../utils/logger';
import { TTSError } from '../utils/errors';

const execAsync = promisify(exec);

export class EnglishTTS {
  private piperPath: string;
  private modelPath: string;

  constructor() {
    this.piperPath = process.env.PIPER_PATH || 'piper';
    this.modelPath = process.env.PIPER_MODEL_PATH || '/models/piper/en-us-amy-medium.onnx';

    logger.info({ piperPath: this.piperPath, modelPath: this.modelPath }, 'EnglishTTS initialized');
  }

  /**
   * Synthesize English text to speech using Piper
   */
  async synthesize(text: string): Promise<Buffer> {
    const tempOutputPath = `/tmp/tts_${Date.now()}.wav`;

    try {
      logger.debug({ textLength: text.length }, 'Synthesizing English speech');

      // Escape text for shell
      const escapedText = text.replace(/'/g, "'\\''");

      // Run Piper CLI
      const command = `echo '${escapedText}' | ${this.piperPath} --model ${this.modelPath} --output_file ${tempOutputPath}`;

      await execAsync(command, { timeout: 10000 });

      // Read generated audio file
      const audioBuffer = await fs.readFile(tempOutputPath);

      // Clean up temp file
      await fs.unlink(tempOutputPath).catch(() => {
        /* ignore */
      });

      return audioBuffer;
    } catch (error) {
      logger.error({ error }, 'English TTS synthesis failed');
      throw new TTSError('Failed to synthesize English speech', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get model info
   */
  getModelInfo(): { name: string; language: string } {
    return {
      name: 'Piper (en-us-amy-medium)',
      language: 'English',
    };
  }
}

export default EnglishTTS;