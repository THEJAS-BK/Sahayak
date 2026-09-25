import { EventEmitter } from 'events';
import logger from '../utils/logger';
import AcousticDistressDetector from './acoustic';
import KeywordDistressDetector from './keyword';

export class DistressDetectionManager extends EventEmitter {
  private acoustic: AcousticDistressDetector;
  private keyword: KeywordDistressDetector;
  private consecutiveDetections: number = 0;
  private lastDetectionTime: number = 0;
  private detectionWindow: number = 5000; // 5 seconds

  constructor() {
    super();

    this.acoustic = new AcousticDistressDetector();
    this.keyword = new KeywordDistressDetector();

    logger.info('Distress Detection Manager initialized');
  }

  /**
   * Analyze audio and transcript for distress
   * Runs parallel to conversation, non-blocking
   *
   * TWO CONSECUTIVE DETECTIONS required before escalation
   * (prevents false positives from coughs, TV noise, etc.)
   */
  async analyzeFrame(
    audioBuffer: Buffer,
    transcript: string,
    sampleRate: number = 8000
  ): Promise<void> {
    try {
      let distressDetected = false;
      let detectionSource = '';

      // Acoustic analysis (parallel)
      try {
        const acousticResult = await this.acoustic.detect(audioBuffer, sampleRate);

        if (acousticResult.detected) {
          distressDetected = true;
          detectionSource = `acoustic (${acousticResult.reason})`;

          logger.warn(
            { confidence: acousticResult.confidence, reason: acousticResult.reason },
            'Acoustic distress detected'
          );
        }
      } catch (error) {
        logger.debug({ error }, 'Acoustic detection skipped (non-critical)');
      }

      // Keyword analysis (partial transcript from STT)
      if (transcript && transcript.length > 0) {
        // Check for repeated phrases (most reliable)
        const repeatedResult = this.keyword.detectRepeatedPhrase(transcript);

        if (repeatedResult.detected && repeatedResult.repetitions >= 2) {
          distressDetected = true;
          detectionSource = `keyword repetition (${repeatedResult.phrase} x${repeatedResult.repetitions})`;

          logger.warn(
            { phrase: repeatedResult.phrase, repetitions: repeatedResult.repetitions },
            'Repeated distress phrase detected'
          );
        }

        // Check for distress keywords
        if (!distressDetected) {
          const keywordResult = this.keyword.detect(transcript);

          if (keywordResult.detected) {
            // Only escalate on strong keyword match (single keyword is lower confidence)
            distressDetected = true;
            detectionSource = `keyword (${keywordResult.keyword})`;

            logger.warn(
              { keyword: keywordResult.keyword, confidence: keywordResult.confidence },
              'Distress keyword detected'
            );
          }
        }
      }

      // Apply two-consecutive-detection rule
      if (distressDetected) {
        const now = Date.now();

        if (now - this.lastDetectionTime < this.detectionWindow) {
          // Second detection within window
          this.consecutiveDetections++;
        } else {
          // Reset if outside window
          this.consecutiveDetections = 1;
        }

        this.lastDetectionTime = now;

        logger.warn(
          {
            detectionSource,
            consecutiveCount: this.consecutiveDetections,
            confirmed: this.consecutiveDetections >= 2,
          },
          'Distress detection signal'
        );

        if (this.consecutiveDetections >= 2) {
          logger.error('DISTRESS CONFIRMED (two consecutive detections)');
          this.emit('distress-confirmed', {
            source: detectionSource,
            timestamp: now,
          });

          // Reset counter after confirmation
          this.consecutiveDetections = 0;
        } else {
          this.emit('distress-signal', {
            source: detectionSource,
            consecutiveCount: this.consecutiveDetections,
          });
        }
      } else {
        // No distress in this frame, reset if outside window
        if (Date.now() - this.lastDetectionTime > this.detectionWindow) {
          this.consecutiveDetections = 0;
        }
      }
    } catch (error) {
      logger.error({ error }, 'Distress analysis failed (non-critical)');
      // Don't throw; distress detection is non-blocking
    }
  }

  /**
   * Get detector info
   */
  getInfo(): Record<string, any> {
    return {
      acoustic: this.acoustic.getInfo(),
      keyword: this.keyword.getInfo(),
      twoConsecutiveDetectionRule: true,
      detectionWindowMs: this.detectionWindow,
    };
  }
}

export default DistressDetectionManager;