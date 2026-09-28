import logger from '../utils/logger';
import { LLMError } from '../utils/errors';
import {
  DialogueTurn,
  ClassificationResult,
  RequestExtraction,
  LLMStreamChunk,
} from './types';
import { SYSTEM_PROMPTS, buildPrompt } from './prompts';
import { GroqClient } from './providers/groq';
import { OllamaClient } from './providers/ollama';
import { ClaudeClient } from './providers/claude';

type LLMClient = GroqClient | OllamaClient | ClaudeClient;

export class LLMManager {
  private provider: LLMClient;
  private providerName: string;

  constructor() {
    const provider = process.env.LLM_PROVIDER || 'groq';

    switch (provider) {
      case 'groq':
        this.provider = new GroqClient();
        break;
      case 'ollama':
        this.provider = new OllamaClient();
        break;
      case 'claude':
        this.provider = new ClaudeClient();
        break;
      default:
        throw new Error(`Unknown LLM provider: ${provider}`);
    }

    this.providerName = provider;
    logger.info({ provider }, 'LLM provider initialized');
  }

  /**
   * Generate a dialogue response (streaming for fast TTS start)
   */
  async *generateDialogueStream(
    turns: DialogueTurn[],
    systemPrompt: string = SYSTEM_PROMPTS.dialogue
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    try {
      logger.debug({ provider: this.providerName }, 'Starting dialogue generation');
      
      yield* this.provider.generateStream(turns, systemPrompt);
    } catch (error) {
      logger.error({ error, provider: this.providerName }, 'Dialogue generation failed');
      throw new LLMError('Failed to generate dialogue', {
        provider: this.providerName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Classify transcript as urgent or routine
   * Non-streaming; runs parallel to conversation
   */
  async classifyTranscript(transcript: string): Promise<ClassificationResult> {
    try {
      const prompt = buildPrompt(SYSTEM_PROMPTS.classification, { transcript });
      const response = await this.provider.generateText([], prompt);

      // Parse JSON response
      const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned) as ClassificationResult;

      logger.debug(
        { classification: parsed.classification, confidence: parsed.confidence },
        'Transcript classified'
      );

      return parsed;
    } catch (error) {
      logger.error({ error, provider: this.providerName }, 'Classification failed');
      throw new LLMError('Failed to classify transcript', {
        provider: this.providerName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Extract structured request from transcript
   * Runs after enough info is gathered
   */
  async extractRequest(transcript: string): Promise<RequestExtraction> {
    try {
      const prompt = buildPrompt(SYSTEM_PROMPTS.extraction, { transcript });
      const response = await this.provider.generateText([], prompt);

      const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned) as RequestExtraction;

      logger.debug(
        { requirementType: parsed.requirement_type, priority: parsed.priority },
        'Request extracted'
      );

      return parsed;
    } catch (error) {
      logger.error({ error, provider: this.providerName }, 'Extraction failed');
      throw new LLMError('Failed to extract request', {
        provider: this.providerName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Generate a single clarifying question
   */
  async generateClarification(
    context: string,
    userMessage: string
  ): Promise<string> {
    try {
      const prompt = buildPrompt(SYSTEM_PROMPTS.clarification, {
        context,
        userMessage,
      });
      const response = await this.provider.generateText([], prompt);

      return response.trim();
    } catch (error) {
      logger.error({ error }, 'Clarification generation failed');
      throw new LLMError('Failed to generate clarification');
    }
  }

  /**
   * Acknowledge distress and confirm help
   */
  async acknowledgeDistress(situation: string): Promise<string> {
    try {
      const prompt = buildPrompt(SYSTEM_PROMPTS.distressAck, { situation });
      const response = await this.provider.generateText([], prompt);

      return response.trim();
    } catch (error) {
      logger.error({ error }, 'Distress acknowledgment failed');
      throw new LLMError('Failed to acknowledge distress');
    }
  }

  /**
   * Get info about which provider is active
   */
  getProviderInfo(): { name: string; model: string } {
    return {
      name: this.providerName,
      model: this.provider.getModel(),
    };
  }
}

export default LLMManager;