import Groq from 'groq-sdk';
import logger from '../../utils/logger';
import { DialogueTurn, LLMStreamChunk } from '../types';

export class GroqClient {
  private groq: Groq;
  private model: string;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY not set in environment');
    }

    this.groq = new Groq({ apiKey });
    this.model = process.env.LLM_MODEL || 'mixtral-8x7b-32768';
    logger.info({ model: this.model }, 'Groq client initialized');
  }

  async *generateStream(
    turns: DialogueTurn[],
    systemPrompt: string
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    try {
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...turns.map((turn) => ({
          role: turn.role as 'user' | 'assistant',
          content: turn.content,
        })),
      ];

      const stream = await this.groq.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: 150,
        stream: true,
        temperature: 0.3, // Lower temp for more focused responses
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          yield {
            type: 'text',
            content,
          };
        }
      }

      yield {
        type: 'done',
        content: '',
      };
    } catch (error) {
      logger.error({ error }, 'Groq stream generation failed');
      throw error;
    }
  }

  async generateText(turns: DialogueTurn[], systemPrompt: string): Promise<string> {
    try {
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...turns.map((turn) => ({
          role: turn.role as 'user' | 'assistant',
          content: turn.content,
        })),
      ];

      const response = await this.groq.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: 200,
        temperature: 0.3,
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      logger.error({ error }, 'Groq text generation failed');
      throw error;
    }
  }

  getModel(): string {
    return this.model;
  }
}