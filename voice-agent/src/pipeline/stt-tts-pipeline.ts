import { EventEmitter } from 'events';
import logger from '../utils/logger';
import STTManager from '../stt';
import TTSManager from '../tts';
import LLMManager from '../llm/client';
import DistressDetectionManager from '../distress';
import { SeniorProfile, AudioFrame } from '../types';
import { createAudioFrame } from '../utils/audio';

export class VoiceConversationPipeline extends EventEmitter {
  private sttManager: STTManager;
  private ttsManager: TTSManager;
  private llmManager: LLMManager;
  private distressManager: DistressDetectionManager;
  
  private seniorProfile: SeniorProfile;
  private audioBuffer: Buffer = Buffer.alloc(0);
  private isSpeaking: boolean = false;
  private silenceThreshold: number = 0.02; // RMS energy threshold
  private silenceCounter: number = 0;
  private silenceLimitFrames: number = 10; // ~400ms at 8kHz

  constructor(seniorProfile: SeniorProfile) {
    super();

    this.seniorProfile = seniorProfile;
    this.sttManager = new STTManager();
    this.ttsManager = new TTSManager();
    this.llmManager = new LLMManager();
    this.distressManager = new DistressDetectionManager();

    this.setupDistressListeners();

    logger.info(
      { seniorId: seniorProfile.senior_id, language: seniorProfile.preferred_language },
      'Voice conversation pipeline initialized'
    );
  }

  private setupDistressListeners(): void {
    this.distressManager.on('distress-signal', (data) => {
      logger.warn({ data }, 'Distress signal (awaiting confirmation)');
      this.emit('distress-signal', data);
    });

    this.distressManager.on('distress-confirmed', (data) => {
      logger.error({ data }, 'DISTRESS CONFIRMED');
      this.emit('distress-confirmed', data);
    });
  }

  /**
   * Process incoming audio frame
   * This is called for each chunk of audio from Twilio
   */
  async processAudioFrame(frame: AudioFrame): Promise<void> {
    try {
      // Accumulate audio
      this.audioBuffer = Buffer.concat([this.audioBuffer, frame.payload]);

      // Run distress detection in parallel (non-blocking)
      this.distressManager.analyzeFrame(
        frame.payload,
        '', // No transcript yet; will be updated after STT
        frame.sampleRate
      ).catch((err) => {
        logger.debug({ err }, 'Distress detection skipped');
      });

      // Check for end-of-speech (silent frames)
      const isSilent = this.detectSilence(frame.payload);

      if (isSilent) {
        this.silenceCounter++;

        if (this.silenceCounter >= this.silenceLimitFrames && this.isSpeaking) {
          logger.debug('End of speech detected, processing buffered audio');

          // Process the accumulated buffer
          await this.processBufferedAudio();

          // Reset
          this.audioBuffer = Buffer.alloc(0);
          this.silenceCounter = 0;
          this.isSpeaking = false;
        }
      } else {
        this.isSpeaking = true;
        this.silenceCounter = 0;
      }
    } catch (error) {
      logger.error({ error }, 'Failed to process audio frame');
      this.emit('error', error);
    }
  }

  /**
   * Detect silence (simple RMS energy threshold)
   */
  private detectSilence(buffer: Buffer): boolean {
    let sumSquares = 0;

    for (let i = 0; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i) / 32768;
      sumSquares += sample * sample;
    }

    const rmsEnergy = Math.sqrt(sumSquares / (buffer.length / 2));

    return rmsEnergy < this.silenceThreshold;
  }

  /**
   * Core pipeline: STT → LLM → TTS → emit audio for playback
   */
  private async processBufferedAudio(): Promise<void> {
    try {
      if (this.audioBuffer.length === 0) {
        logger.debug('No audio to process');
        return;
      }

      logger.info(
        { bufferSize: this.audioBuffer.length, language: this.seniorProfile.preferred_language },
        'Processing buffered audio through pipeline'
      );

      // STEP 1: STT (Speech → Text)
      logger.debug('STEP 1: Running STT');
      const sttResult = await this.sttManager.transcribe(
        this.audioBuffer,
        this.seniorProfile.preferred_language
      );

      logger.info(
        { text: sttResult.text, confidence: sttResult.confidence },
        'STT complete'
      );

      if (!sttResult.text || sttResult.text.trim().length === 0) {
        logger.warn('STT returned empty text');
        this.emit('stt-empty');
        return;
      }

      // Re-run distress detection with full transcript
      this.distressManager.analyzeFrame(
        this.audioBuffer,
        sttResult.text,
        sttResult.confidence > 0.7 ? 8000 : 8000
      ).catch(() => {
        /* non-critical */
      });

      // STEP 2: Emit STT result upstream (to conversation handler)
      this.emit('transcript', {
        text: sttResult.text,
        confidence: sttResult.confidence,
        language: sttResult.language,
      });

      // STEP 3: LLM will generate response (handled by conversation core)
      // The conversation core will call back with the assistant response
      // For now, we emit it so the conversation handler can process it

      logger.info('Audio processing complete; awaiting LLM response from conversation handler');
    } catch (error) {
      logger.error({ error }, 'Pipeline processing failed');
      this.emit('error', error);
    }
  }

  /**
   * Called by conversation handler to synthesize and play response
   */
  async speakResponse(text: string): Promise<Buffer> {
    try {
      logger.info(
        { textLength: text.length, language: this.seniorProfile.preferred_language },
        'Synthesizing response'
      );

      // STEP 4: TTS (Text → Speech)
      const audioBuffer = await this.ttsManager.synthesize(
        text,
        this.seniorProfile.preferred_language
      );

      logger.info({ audioSize: audioBuffer.length }, 'TTS synthesis complete');

      return audioBuffer;
    } catch (error) {
      logger.error({ error }, 'TTS synthesis failed');
      throw error;
    }
  }

  /**
   * Get pipeline status/info
   */
  getInfo(): Record<string, any> {
    return {
      senior: {
        id: this.seniorProfile.senior_id,
        language: this.seniorProfile.preferred_language,
      },
      models: {
        stt: this.sttManager.getModelInfo(),
        tts: this.ttsManager.getModelInfo(),
        llm: this.llmManager.getProviderInfo(),
        distress: this.distressManager.getInfo(),
      },
      bufferState: {
        audioBufferSize: this.audioBuffer.length,
        isSpeaking: this.isSpeaking,
      },
    };
  }
}

export default VoiceConversationPipeline;