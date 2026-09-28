import Anthropic from '@anthropic-ai/sdk';
import logger from '../../utils/logger';
import { DialogueTurn, LLMStreamChunk } from '../types';

export class ClaudeClient {
  private client: Anthropic;
  private model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set in environment');
    }

    this.client = new Anthropic({ apiKey });
    this.model = process.env.LLM_MODEL || 'claude-opus-4-6';
    logger.info({ model: this.model }, 'Claude client initialized');
  }

  async *generateStream(
    turns: DialogueTurn[],
    systemPrompt: string
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    try {
      const stream = await this.client.messages.stream({
        model: this.model,
        max_tokens: 150,
        system: systemPrompt,
        messages: turns.map((turn) => ({
          role: turn.role,
          content: turn.content,
        })),
      });

      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          yield {
            type: 'text',
            content: chunk.delta.text,
          };
        }
      }

      yield {
        type: 'done',
        content: '',
      };
    } catch (error) {
      logger.error({ error }, 'Claude stream generation failed');
      throw error;
    }
  }

  async generateText(turns: DialogueTurn[], systemPrompt: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 200,
        system: systemPrompt,
        messages: turns.map((turn) => ({
          role: turn.role,
          content: turn.content,
        })),
      });

      return response.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('');
    } catch (error) {
      logger.error({ error }, 'Claude text generation failed');
      throw error;
    }
  }

  getModel(): string {
    return this.model;
  }
}