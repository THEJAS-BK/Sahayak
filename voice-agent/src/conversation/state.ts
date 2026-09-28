import { ConversationState, ConversationTurn, SeniorProfile } from '../types';
import logger from '../utils/logger';

export class ConversationStateManager {
  private state: ConversationState;

  constructor(
    sessionId: string,
    seniorProfile: SeniorProfile
  ) {
    this.state = {
      sessionId,
      seniorProfile,
      turns: [],
      distressDetected: false,
      distressConfirmations: 0,
      callStartTime: Date.now(),
      audioFrameCount: 0,
    };

    logger.info(
      { sessionId, seniorId: seniorProfile.senior_id },
      'Conversation state initialized'
    );
  }

  /**
   * Add a turn to conversation history
   */
  addTurn(role: 'user' | 'assistant', content: string, confidenceScore?: number): void {
    this.state.turns.push({
      role,
      content,
      timestamp: Date.now(),
      confidenceScore,
    });

    logger.debug(
      { role, contentLength: content.length },
      'Conversation turn added'
    );
  }

  /**
   * Get full conversation transcript
   */
  getTranscript(): string {
    return this.state.turns
      .map((turn) => `${turn.role === 'user' ? 'Senior' : 'Sahayak'}: ${turn.content}`)
      .join('\n');
  }

  /**
   * Get last N turns
   */
  getRecentTurns(count: number = 5): ConversationTurn[] {
    return this.state.turns.slice(-count);
  }

  /**
   * Update distress detection state
   * Requires TWO consecutive detections before marking as distressed
   */
  updateDistressDetection(detected: boolean): boolean {
    if (detected) {
      this.state.distressConfirmations++;
      logger.warn(
        { confirmations: this.state.distressConfirmations },
        'Distress signal detected'
      );

      if (this.state.distressConfirmations >= 2) {
        this.state.distressDetected = true;
        logger.error('DISTRESS CONFIRMED - Emergency escalation needed');
        return true;
      }
    } else {
      // Reset counter if no distress detected
      this.state.distressConfirmations = 0;
    }

    return false;
  }

  /**
   * Check if distress has been confirmed
   */
  isDistressConfirmed(): boolean {
    return this.state.distressDetected;
  }

  /**
   * Track audio frame count (for monitoring)
   */
  incrementAudioFrameCount(): void {
    this.state.audioFrameCount++;
  }

  /**
   * Get current state snapshot
   */
  getState(): ConversationState {
    return { ...this.state };
  }

  /**
   * Get senior profile
   */
  getSeniorProfile(): SeniorProfile {
    return this.state.seniorProfile;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.state.sessionId;
  }

  /**
   * Get call duration so far (seconds)
   */
  getCallDuration(): number {
    return Math.floor((Date.now() - this.state.callStartTime) / 1000);
  }

  /**
   * Extract location from conversation
   * Looks for keywords like "home", "market", "temple", etc.
   * Used for both routine requests and emergency events
   */
  extractLocation(): string {
    const transcript = this.getTranscript();
    
    // Common Kannada/rural locations and keywords
    const locationPatterns = [
      /home|house|ಮನೆ/i,
      /market|bazaar|ಬಾಜಾರ/i,
      /temple|ದೇವಾಲಯ/i,
      /hospital|ಆಸ್ಪತ್ರೆ/i,
      /school|ಶಾಲೆ/i,
      /road|street|ರಸ್ತೆ/i,
      /bus stand|ಬಸ್ ನಿಲ್ದಾಣ/i,
      /near|beside|ಬಳಿ|ಪಕ್ಕ/i,
      /village|ಹೊ೦ಬೆ/i,
      /field|ಹೊಲ/i,
      /shop|ಅಂಗಡಿ/i,
      /outside|ಹೊರಗೆ/i,
    ];

    // Search for location keywords in recent turns (last 3)
    const recentText = this.getRecentTurns(3)
      .map((t) => t.content)
      .join(' ');

    for (const pattern of locationPatterns) {
      const match = recentText.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return 'Unknown location'; // Fallback
  }

  /**
   * Build location context for request/emergency submission
   */
  getLocationContext(): { location: string; description: string } {
    const location = this.extractLocation();
    const transcript = this.getTranscript();

    // Extract any other location details from conversation
    const lastUserTurn = this.state.turns
      .reverse()
      .find((t) => t.role === 'user');

    const description = lastUserTurn?.content || 'Senior provided location verbally';

    return {
      location,
      description,
    };
  }
}

export default ConversationStateManager;