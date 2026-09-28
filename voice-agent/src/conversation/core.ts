import { EventEmitter } from 'events';
import logger from '../utils/logger';
import { LLMError, DistressDetectionError } from '../utils/errors';
import LLMManager from '../llm/client';
import ConversationStateManager from './state';
import { BackendClient, getBackendClient } from '../backend-client';
import {
  ConversationState,
  SeniorProfile,
  DialogueTurn,
  StructuredRequest,
  EmergencyEvent,
} from '../types';
import { buildPrompt, SYSTEM_PROMPTS } from '../llm/prompts';

interface ConversationConfig {
  maxTurns?: number;
  maxCallDuration?: number; // seconds
  locationPromptTrigger?: number; // turn number to ask for location
}

export class ConversationCore extends EventEmitter {
  private state: ConversationStateManager;
  private llm: LLMManager;
  private backend: BackendClient;
  private config: ConversationConfig;
  private ended: boolean = false;

  constructor(
    sessionId: string,
    seniorProfile: SeniorProfile,
    config: ConversationConfig = {}
  ) {
    super();

    this.state = new ConversationStateManager(sessionId, seniorProfile);
    this.llm = new LLMManager();
    this.backend = getBackendClient();

    this.config = {
      maxTurns: config.maxTurns || 20,
      maxCallDuration: config.maxCallDuration || 300, // 5 minutes
      locationPromptTrigger: config.locationPromptTrigger || 3, // Ask for location after turn 3
    };

    logger.info(
      { sessionId, seniorName: seniorProfile.name },
      'Conversation core initialized'
    );
  }

  /**
   * Start the conversation with a greeting
   */
  async startConversation(): Promise<string> {
    const profile = this.state.getSeniorProfile();

    // Build greeting
    const greeting = this.buildGreeting(profile);

    this.state.addTurn('assistant', greeting);

    logger.info(
      { seniorId: profile.senior_id, greeting },
      'Conversation started'
    );

    return greeting;
  }

  private buildGreeting(profile: SeniorProfile): string {
    const name = profile.name.split(' ')[0]; // First name only
    const greeting: Record<string, string> = {
      kannada: `ನಮಸ್ಕಾರ ${name}! ನಾನು ಸಹಾಯಕ. ನಿಮಗೆ ಏನು ಸಹಾಯ ಬೇಕು?`,
      tulu: `ಸ್ವಾಗತ ${name}! ನಾನು ಸಹಾಯಕ. ನಿಮಗೆ ಏನು ಆಗಿದೆ?`,
      english: `Hello ${name}, I'm Sahayak. How can I help you today?`,
    };

    return greeting[profile.preferred_language] || greeting.kannada;
  }

  /**
   * Process user input (from STT transcript)
   * Returns: next assistant response (for TTS)
   */
  async processTurn(userTranscript: string): Promise<string> {
    if (this.ended) {
      logger.warn('Attempted to process turn after conversation ended');
      return 'The call has ended.';
    }

    // Check call duration
    if (this.state.getCallDuration() > (this.config.maxCallDuration || 300)) {
      logger.info('Call duration exceeded, ending conversation');
      await this.endCall('duration_exceeded');
      return 'Your call time has ended. Help is on the way.';
    }

    const turnCount = this.state.getState().turns.length / 2;

    // Add user turn
    this.state.addTurn('user', userTranscript);

    logger.debug(
      { turn: turnCount, transcriptLength: userTranscript.length },
      'Processing user turn'
    );

    try {
      // Run classification in parallel (doesn't block dialogue)
      this.classifyTranscriptAsync(userTranscript);

      // Decide if we need to ask for location
      const shouldAskLocation =
        turnCount === this.config.locationPromptTrigger &&
        !this.hasLocationInfo();

      let assistantResponse: string;

      if (shouldAskLocation) {
        // Ask for location
        assistantResponse = await this.askForLocation(userTranscript);
      } else if (this.hasEnoughInfo()) {
        // We have enough info, extract and submit
        assistantResponse = await this.extractAndSubmit(userTranscript);
      } else {
        // Continue dialogue naturally
        assistantResponse = await this.generateDialogueResponse(userTranscript);
      }

      this.state.addTurn('assistant', assistantResponse);

      return assistantResponse;
    } catch (error) {
      logger.error({ error, userTranscript }, 'Failed to process turn');
      const fallback = 'I apologize, I had trouble understanding. Could you repeat that?';
      this.state.addTurn('assistant', fallback);
      return fallback;
    }
  }

  /**
   * Generate natural dialogue response
   */
  private async generateDialogueResponse(userTranscript: string): Promise<string> {
    const systemPrompt = SYSTEM_PROMPTS.dialogue;
    const turns: DialogueTurn[] = this.state.getRecentTurns(6);

    let fullResponse = '';

    // Stream response for faster TTS start
    for await (const chunk of this.llm.generateDialogueStream(
      turns,
      systemPrompt
    )) {
      if (chunk.type === 'text') {
        fullResponse += chunk.content;
      }
    }

    return fullResponse.trim();
  }

  /**
   * Ask for location (with fallback handling)
   */
  private async askForLocation(userTranscript: string): Promise<string> {
    const context = this.state.getTranscript();
    const clarification = await this.llm.generateClarification(
      context,
      'Where are you right now?'
    );

    return clarification;
  }

  /**
   * Check if we have location info in the conversation
   */
  private hasLocationInfo(): boolean {
    const location = this.state.extractLocation();
    return location !== 'Unknown location';
  }

  /**
   * Check if we have enough info to submit a request
   */
  private hasEnoughInfo(): boolean {
    // Simple heuristic: if we've had at least 4 turns, try to extract
    return this.state.getState().turns.length >= 4;
  }

  /**
   * Extract structured request and submit to backend
   * This is the END of the conversation
   */
  private async extractAndSubmit(userTranscript: string): Promise<string> {
    const profile = this.state.getSeniorProfile();
    const transcript = this.state.getTranscript();
    const locationContext = this.state.getLocationContext();

    try {
      // Extract structured request
      const extraction = await this.llm.extractRequest(transcript);

      logger.info(
        { requirementType: extraction.requirement_type, priority: extraction.priority },
        'Request extracted'
      );

      // Check if it was classified as urgent
      const classification = await this.llm.classifyTranscript(transcript);

      if (classification.isUrgent || this.state.isDistressConfirmed()) {
        // EMERGENCY PATH
        logger.error(
          {
            reason: this.state.isDistressConfirmed()
              ? 'Distress detection'
              : 'LLM classification',
            detail: extraction.detail,
            location: locationContext.location,
          },
          'EMERGENCY ESCALATION'
        );

        const emergencyPayload: EmergencyEvent = {
          senior_id: profile.senior_id,
          triggered_by: this.state.isDistressConfirmed()
            ? 'distress_detection'
            : 'llm_classification',
          detail: extraction.detail,
          source: 'phone_call',
        };

        // Include location in the detail
        emergencyPayload.detail = `${extraction.detail} | Location: ${locationContext.location}`;

        await this.backend.createEmergencyEvent(emergencyPayload);

        // Build response
        const ackResponse = await this.llm.acknowledgeDistress(extraction.detail);
        const location = locationContext.location;

        const finalResponse =
          ackResponse +
          ` Help and police are coming to ${location}. Stay calm.`;

        this.state.addTurn('assistant', finalResponse);
        await this.endCall('emergency_submitted');

        return finalResponse;
      } else {
        // ROUTINE REQUEST PATH
        logger.info(
          {
            requirementType: extraction.requirement_type,
            detail: extraction.detail,
            location: locationContext.location,
          },
          'Routine request extracted'
        );

        const requestPayload: StructuredRequest = {
          senior_id: profile.senior_id,
          requirement_type: extraction.requirement_type,
          detail: extraction.detail,
          priority: extraction.priority,
          source: 'phone_call',
        };

        // Include location in detail
        requestPayload.detail = `${extraction.detail} | Location: ${locationContext.location}`;

        await this.backend.createRequest(requestPayload);

        const confirmResponse = `Thank you. A volunteer will come to ${locationContext.location} shortly. I'm ending the call now.`;

        this.state.addTurn('assistant', confirmResponse);
        await this.endCall('request_submitted');

        return confirmResponse;
      }
    } catch (error) {
      logger.error({ error, transcript }, 'Failed to extract and submit request');

      // Fallback: ask user to confirm they want to end call
      const fallback =
        'I had trouble understanding your request. Can you tell me again what you need?';
      return fallback;
    }
  }

  /**
   * Classify transcript for urgency (runs in parallel, doesn't block)
   */
  private async classifyTranscriptAsync(transcript: string): Promise<void> {
    try {
      const classification = await this.llm.classifyTranscript(transcript);

      if (classification.isUrgent) {
        logger.warn(
          { confidence: classification.confidence },
          'Transcript classified as urgent'
        );

        this.emit('urgency-detected', classification);
      }
    } catch (error) {
      logger.debug({ error }, 'Classification failed (non-blocking)');
    }
  }

  /**
   * Handle distress detection signal
   */
  async handleDistressDetected(severity: 'acoustic' | 'keyword'): Promise<void> {
    const isConfirmed = this.state.updateDistressDetection(true);

    if (isConfirmed) {
      logger.error({ severity }, 'DISTRESS CONFIRMED');
      this.emit('distress-confirmed', { severity });

      // Acknowledge immediately
      const situation = this.state.getRecentTurns(1)[0]?.content || 'distress signal';
      const ack = await this.llm.acknowledgeDistress(situation);

      this.state.addTurn('assistant', ack);
      this.emit('speak', ack);

      // Prepare emergency submission
      await this.handleEmergencyEscalation('distress_detection');
    }
  }

  /**
   * Handle emergency escalation (called from distress detection or urgent classification)
   */
  private async handleEmergencyEscalation(
    triggeredBy: 'distress_detection' | 'llm_classification'
  ): Promise<void> {
    const profile = this.state.getSeniorProfile();
    const transcript = this.state.getTranscript();
    const locationContext = this.state.getLocationContext();

    try {
      // Extract what we know so far
      const extraction = await this.llm.extractRequest(transcript).catch(() => ({
        requirement_type: 'emergency',
        detail: 'Emergency detected during call',
        priority: 'urgent' as const,
        confidence: 0.8,
        needsMoreInfo: true,
      }));

      const emergencyPayload: EmergencyEvent = {
        senior_id: profile.senior_id,
        triggered_by: triggeredBy,
        detail: `${extraction.detail} | Location: ${locationContext.location}`,
        source: 'phone_call',
      };

      await this.backend.createEmergencyEvent(emergencyPayload);

      logger.error(
        {
          emergencyTriggeredBy: triggeredBy,
          location: locationContext.location,
        },
        'Emergency event submitted'
      );

      this.emit('emergency-escalated', {
        triggeredBy,
        location: locationContext.location,
      });

      await this.endCall('emergency_escalation');
    } catch (error) {
      logger.error({ error }, 'Failed to escalate to emergency');
    }
  }

  /**
   * End the call
   */
  async endCall(reason: string): Promise<void> {
    if (this.ended) return;

    this.ended = true;
    const duration = this.state.getCallDuration();

    logger.info(
      {
        sessionId: this.state.getSessionId(),
        seniorId: this.state.getSeniorProfile().senior_id,
        duration,
        reason,
      },
      'Call ended'
    );

    this.emit('call-ended', { reason, duration });
  }

  /**
   * Get current state (for monitoring/debugging)
   */
  getState(): ConversationState {
    return this.state.getState();
  }

  /**
   * Check if call is still active
   */
  isActive(): boolean {
    return !this.ended;
  }
}

export default ConversationCore;