import type {
  ResolveAIRequestOptions,
  AiProviderName,
} from './ai-provider.types';

export const AI_PROVIDERS = 'AI_PROVIDERS';

export interface IAiProvider {
  readonly name: AiProviderName;
  generate(prompt: string, options: ResolveAIRequestOptions): Promise<string>;
}
