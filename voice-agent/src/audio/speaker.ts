import Speaker from 'speaker';
import { Writable } from 'stream';
import logger from '../utils/logger';

export class SpeakerOutput {
  private speaker: Writable;
  private isPlaying: boolean = false;

  constructor(sampleRate: number = 16000, channels: number = 1, bitDepth: number = 16) {
    this.speaker = new Speaker({
      channels,
      bitDepth,
      sampleRate,
    });

    this.speaker.on('error', (err: Error) => {
      logger.error({ error: err }, 'Speaker error');
    });
  }

  /**
   * Play audio buffer
   */
  async play(audioBuffer: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.isPlaying = true;

      logger.info({ audioSize: audioBuffer.length }, 'Playing audio');

      this.speaker.write(audioBuffer, (err) => {
        this.isPlaying = false;

        if (err) {
          logger.error({ error: err }, 'Failed to play audio');
          reject(err);
        } else {
          logger.info('Audio playback complete');
          resolve();
        }
      });
    });
  }

  /**
   * Check if currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

export default SpeakerOutput;