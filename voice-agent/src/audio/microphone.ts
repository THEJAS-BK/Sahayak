import mic from 'mic';
import { EventEmitter } from 'events';
import logger from '../utils/logger';

export class MicrophoneInput extends EventEmitter {
  private micInstance: any;
  private audioStream: any;

  constructor() {
    super();

    this.micInstance = mic({
      rate: '16000',
      channels: '1',
      compressed: false,
      encoding: 'LINEAR16',
    });

    this.audioStream = this.micInstance.getAudioStream();

    this.audioStream.on('data', (chunk: Buffer) => {
      this.emit('audio', chunk);
    });

    this.audioStream.on('error', (err: Error) => {
      logger.error({ error: err }, 'Microphone error');
      this.emit('error', err);
    });
  }

  /**
   * Start recording
   */
  start(): void {
    logger.info('Microphone recording started');
    this.micInstance.start();
  }

  /**
   * Stop recording
   */
  stop(): void {
    logger.info('Microphone recording stopped');
    this.micInstance.stop();
  }

  /**
   * Check if recording
   */
  isRecording(): boolean {
    return this.micInstance.isRunning?.() || false;
  }
}

export default MicrophoneInput;