import { Injectable, Logger } from '@nestjs/common';
import type { IAiProvider } from '../ai-provider.interface';
import type { ResolveAIRequestOptions } from '../ai-provider.types';

@Injectable()
export class LocalAiProvider implements IAiProvider {
  readonly name = 'local' as const;
  private readonly logger = new Logger(LocalAiProvider.name);

  async generate(
    prompt: string,
    options: ResolveAIRequestOptions,
  ): Promise<string> {
    const resolvedPrompt = this.buildLocalPrompt(prompt, options);
    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4',
          prompt: resolvedPrompt,
          stream: false,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText}`,
        );
      }
      const data = (await response.json()) as { response?: string };
      if (typeof data.response !== 'string') {
        throw new Error('Unexpected response structure from Ollama API');
      }
      return data.response;
    } catch (error) {
      this.logger.error(
        'Local Ollama generation failed. Is the server running?',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private buildLocalPrompt(
    prompt: string,
    options: ResolveAIRequestOptions,
  ): string {
    if (!options.isJson) {
      return prompt;
    }

    return `${prompt}

IMPORTANT : retourne UNIQUEMENT du JSON brut. N'ajoute ni balises markdown, ni libellé, ni explication, ni texte hors JSON.`;
  }
}
