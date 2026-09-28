import axios from 'axios';
import logger from '../../utils/logger';
import { DialogueTurn, LLMStreamChunk } from '../types';

export class OllamaClient {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = process.env.LLM_MODEL || 'mistral';
    logger.info({ baseUrl: this.baseUrl, model: this.model }, 'Ollama client initialized');
  }

  async *generateStream(
    turns: DialogueTurn[],
    systemPrompt: string
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    try {
      const prompt = this.formatPrompt(turns, systemPrompt);

      const response = await axios.post(
        `${this.baseUrl}/api/generate`,
        {
          model: this.model,
          prompt,
          stream: true,
          temperature: 0.3,
        },
        {
          responseType: 'stream',
        }
      );

      for await (const line of response.data) {
        const text = line.toString();
        if (text.trim()) {
          try {
            const json = JSON.parse(text);
            if (json.response) {
              yield {
                type: 'text',
                content: json.response,
              };
            }
            if (json.done) {
              yield {
                type: 'done',
                content: '',
              };
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Ollama stream generation failed');
      throw error;
    }
  }

  async generateText(turns: DialogueTurn[], systemPrompt: string): Promise<string> {
    try {
      const prompt = this.formatPrompt(turns, systemPrompt);

      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model: this.model,
        prompt,
        stream: false,
        temperature: 0.3,
      });

      return response.data.response || '';
    } catch (error) {
      logger.error({ error }, 'Ollama text generation failed');
      throw error;
    }
  }

  private formatPrompt(turns: DialogueTurn[], systemPrompt: string): string {
    let prompt = `${systemPrompt}\n\n`;

    for (const turn of turns) {
      if (turn.role === 'user') {
        prompt += `User: ${turn.content}\n`;
      } else {
        prompt += `Assistant: ${turn.content}\n`;
      }
    }

    prompt += `Assistant:`;
    return prompt;
  }

  getModel(): string {
    return this.model;
  }
}