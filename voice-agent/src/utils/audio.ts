import { AudioFrame } from '../types';
import logger from './logger';

/**
 * Converts Twilio's base64 μ-law payload to raw PCM buffer
 * Twilio sends 8kHz, 8-bit μ-law encoded audio
 */
export function decodeTwilioAudio(base64Payload: string): Buffer {
  try {
    const ulawBuffer = Buffer.from(base64Payload, 'base64');
    return ulawToPcm(ulawBuffer);
  } catch (err) {
    logger.error({ err, payload: base64Payload }, 'Failed to decode Twilio audio');
    throw new Error('Audio decode failed');
  }
}

/**
 * μ-law to PCM16 conversion
 * Reference: ITU-T G.711
 */
function ulawToPcm(ulawBuffer: Buffer): Buffer {
  const QUANT_MASK = 0xf;
  const SIGN_BIT = 0x80;
  const SEG_SHIFT = 4;
  const SEG_MASK = 0x70;

  const pcmBuffer = Buffer.alloc(ulawBuffer.length * 2);

  for (let i = 0; i < ulawBuffer.length; i++) {
    const ulawByte = ulawBuffer[i];
    const sign = ulawByte & SIGN_BIT;
    const exponent = (ulawByte & SEG_MASK) >> SEG_SHIFT;
    const mantissa = ulawByte & QUANT_MASK;

    let sample = mantissa << (exponent + 3);
    if (exponent !== 0) {
      sample |= 0x80 << exponent;
    }
    if (!sign) {
      sample = -sample;
    } else if (sample === 0) {
      sample = -0x8000;
    }

    pcmBuffer.writeInt16LE(sample, i * 2);
  }

  return pcmBuffer;
}

/**
 * Converts PCM16 buffer to base64 μ-law (for sending back to Twilio)
 */
export function encodeTwilioAudio(pcmBuffer: Buffer): string {
  const ulawBuffer = pcmToUlaw(pcmBuffer);
  return ulawBuffer.toString('base64');
}

/**
 * PCM16 to μ-law conversion
 */
function pcmToUlaw(pcmBuffer: Buffer): Buffer {
  const BIAS = 0x84;
  const MAX = 0x7fff;
  const CLIP = 32635;

  const ulawBuffer = Buffer.alloc(pcmBuffer.length / 2);

  for (let i = 0; i < pcmBuffer.length; i += 2) {
    let sample = pcmBuffer.readInt16LE(i);
    const sign = sample >> 8;
    let ulawByte: number;

    if (sample < 0) {
      sample = -sample;
    }

    if (sample > CLIP) {
      sample = CLIP;
    }

    sample = sample + BIAS;

    const exponent = Math.clz32(sample) ^ 31;
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    ulawByte = ~(sign | (exponent << 4) | mantissa) & 0xff;

    ulawBuffer[i / 2] = ulawByte;
  }

  return ulawBuffer;
}

/**
 * Creates an AudioFrame object from Twilio payload
 */
export function createAudioFrame(
  base64Payload: string,
  sampleRate: number = 8000
): AudioFrame {
  return {
    payload: decodeTwilioAudio(base64Payload),
    timestamp: Date.now(),
    sampleRate,
  };
}

/**
 * Packs raw PCM16 samples into a Twilio-compatible base64 payload
 */
export function createTwilioPayload(pcmBuffer: Buffer): string {
  return encodeTwilioAudio(pcmBuffer);
}