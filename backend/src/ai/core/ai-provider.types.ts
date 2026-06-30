import type {
  WorkspaceChatHistoryMessage,
  WorkspaceChatToolset,
} from '../ai.types';

export type AiProviderName = 'local' | 'gemini';

export interface ResolveAIRequestOptions {
  isJson?: boolean;
  history?: WorkspaceChatHistoryMessage[];
  tools?: WorkspaceChatToolset;
}
