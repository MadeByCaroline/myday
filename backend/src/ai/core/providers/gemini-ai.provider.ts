import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiChatService } from '../../chat.service';
import type { IAiProvider } from '../ai-provider.interface';
import type { ResolveAIRequestOptions } from '../ai-provider.types';

@Injectable()
export class GeminiAiProvider implements IAiProvider {
  readonly name = 'gemini' as const;
  private readonly genAI: GoogleGenerativeAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly aiChatService: AiChatService,
  ) {
    this.genAI = new GoogleGenerativeAI(
      this.configService.getOrThrow<string>('GEMINI_API_KEY'),
    );
  }

  async generate(
    prompt: string,
    options: ResolveAIRequestOptions,
  ): Promise<string> {
    if (options.tools) {
      return this.aiChatService.generateWorkspaceAnswer(
        this.genAI,
        prompt,
        options.history || [],
        options.tools,
      );
    }

    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      ...(options.isJson
        ? {
            generationConfig: {
              responseMimeType: 'application/json',
            },
          }
        : {}),
    });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  }
}
