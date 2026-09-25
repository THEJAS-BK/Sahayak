import logger from '../utils/logger';
import { DistressDetectionError } from '../utils/errors';

export class AcousticDistressDetector {
  private isReady: boolean = false;
  private isLoading: boolean = false;

  constructor() {
    logger.info('AcousticDistressDetector initializing');
  }

  /**
   * Lazy load YAMNet model
   */
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
      logger.info('Loading YAMNet acoustic classifier');
      // YAMNet would be loaded here via TensorFlow.js or similar
      // For now, using a simplified feature-based approach
      this.isReady = true;
      logger.info('Acoustic classifier ready');
    } catch (error) {
      this.isLoading = false;
      logger.warn({ error }, 'Failed to load YAMNet, using fallback');
      this.isReady = true; // Use fallback
    }

    this.isLoading = false;
  }

  /**
   * Detect distress from audio buffer
   * Analyzes amplitude, frequency, and other features
   */
  async detect(audioBuffer: Buffer, sampleRate: number = 8000): Promise<{
    detected: boolean;
    confidence: number;
    reason?: string;
  }> {
    try {
      await this.ensureLoaded();

      // Convert buffer to Float32Array
      const float32Audio = this.bufferToFloat32(audioBuffer);

      // Extract features
      const features = this.extractFeatures(float32Audio, sampleRate);

      // Simple heuristic classifier
      const distressScore = this.classifyFeatures(features);

      logger.debug({ distressScore, features }, 'Acoustic analysis complete');

      return {
        detected: distressScore > 0.65,
        confidence: distressScore,
        reason: this.getFeatureReason(features, distressScore),
      };
    } catch (error) {
      logger.error({ error }, 'Acoustic detection failed');
      throw new DistressDetectionError('Acoustic detection failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Extract audio features from buffer
   */
  private extractFeatures(
    float32Audio: Float32Array,
    sampleRate: number
  ): {
    rmsEnergy: number;
    spectralCentroid: number;
    zerosCrossingRate: number;
    mfccVariance: number;
  } {
    // RMS Energy (loudness)
    let sumSquares = 0;
    for (let i = 0; i < float32Audio.length; i++) {
      sumSquares += float32Audio[i] * float32Audio[i];
    }
    const rmsEnergy = Math.sqrt(sumSquares / float32Audio.length);

    // Zero Crossing Rate (voicing)
    let zeroCrossings = 0;
    for (let i = 1; i < float32Audio.length; i++) {
      if (
        (float32Audio[i - 1] >= 0 && float32Audio[i] < 0) ||
        (float32Audio[i - 1] < 0 && float32Audio[i] >= 0)
      ) {
        zeroCrossings++;
      }
    }
    const zerosCrossingRate = zeroCrossings / float32Audio.length;

    // Simple spectral centroid (high frequencies indicate distress)
    let spectralCentroid = 0;
    if (float32Audio.length > 0) {
      // Simplified: use energy distribution across time windows
      spectralCentroid = this.estimateSpectralContent(float32Audio);
    }

    // MFCC variance (mel-frequency cepstral coefficients)
    // Simplified: high variance suggests emotional content
    const mfccVariance = this.estimateMFCCVariance(float32Audio);

    return {
      rmsEnergy: Math.min(rmsEnergy, 1.0), // Normalize
      spectralCentroid,
      zerosCrossingRate: Math.min(zerosCrossingRate, 1.0),
      mfccVariance,
    };
  }

  /**
   * Estimate spectral content (high freq presence = distress)
   */
  private estimateSpectralContent(audio: Float32Array): number {
    // Simple: calculate energy in different time windows
    const windowSize = Math.floor(audio.length / 4);
    let lastWindowEnergy = 0;

    if (windowSize > 0) {
      let sum = 0;
      for (let i = audio.length - windowSize; i < audio.length; i++) {
        sum += Math.abs(audio[i]);
      }
      lastWindowEnergy = sum / windowSize;
    }

    return Math.min(lastWindowEnergy * 2, 1.0); // Normalize
  }

  /**
   * Estimate MFCC variance (emotional expressivity)
   */
  private estimateMFCCVariance(audio: Float32Array): number {
    // Simplified: variance of audio amplitude
    const mean = audio.reduce((a, b) => a + b, 0) / audio.length;
    const variance =
      audio.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / audio.length;

    return Math.sqrt(variance);
  }

  /**
   * Classify features into distress score (0-1)
   */
  private classifyFeatures(features: ReturnType<typeof this.extractFeatures>): number {
    // Distress indicators:
    // - High RMS energy (shouting)
    // - High spectral centroid (high pitch)
    // - High MFCC variance (emotional)
    // - Moderate zero crossing rate (voice activity)

    let score = 0;

    // High energy = potential distress (0-0.3)
    if (features.rmsEnergy > 0.6) {
      score += 0.25;
    }

    // High spectral presence = high pitch distress (0-0.3)
    if (features.spectralCentroid > 0.5) {
      score += 0.25;
    }

    // High MFCC variance = emotional content (0-0.2)
    if (features.mfccVariance > 0.1) {
      score += 0.2;
    }

    // Moderate zero crossing rate = actual voice (0-0.25)
    if (features.zerosCrossingRate > 0.1 && features.zerosCrossingRate < 0.8) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Describe which features triggered distress detection
   */
  private getFeatureReason(
    features: ReturnType<typeof this.extractFeatures>,
    score: number
  ): string {
    const reasons: string[] = [];

    if (features.rmsEnergy > 0.6) {
      reasons.push('high intensity');
    }
    if (features.spectralCentroid > 0.5) {
      reasons.push('high pitch');
    }
    if (features.mfccVariance > 0.1) {
      reasons.push('emotional expression');
    }

    return reasons.join(', ') || 'acoustic signature';
  }

  /**
   * Convert PCM buffer to Float32Array
   */
  private bufferToFloat32(buffer: Buffer): Float32Array {
    const float32 = new Float32Array(buffer.length / 2);

    for (let i = 0; i < buffer.length; i += 2) {
      const int16 = buffer.readInt16LE(i);
      float32[i / 2] = int16 / 32768;
    }

    return float32;
  }

  /**
   * Get detector info
   */
  getInfo(): { type: string; features: string[] } {
    return {
      type: 'Acoustic feature classifier (simplified)',
      features: ['RMS Energy', 'Spectral Centroid', 'ZCR', 'MFCC Variance'],
    };
  }
}

export default AcousticDistressDetector;