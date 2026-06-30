import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type {
  WorkspaceChatHistoryMessage,
  WorkspaceChatToolset,
  WorkspaceDateRange,
} from './ai.types';

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  async generateWorkspaceAnswer(
    genAI: GoogleGenerativeAI,
    prompt: string,
    history: WorkspaceChatHistoryMessage[],
    tools: WorkspaceChatToolset,
  ): Promise<string> {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [
        {
          functionDeclarations: [
            {
              name: 'getCalendar',
              description:
                'Get calendar events in a date range using ISO dates { start, end }.',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  dateRange: {
                    type: SchemaType.OBJECT,
                    properties: {
                      start: { type: SchemaType.STRING },
                      end: { type: SchemaType.STRING },
                    },
                    required: ['start', 'end'],
                  },
                },
                required: ['dateRange'],
              },
            },
            {
              name: 'getTasks',
              description:
                'Get user tasks, optionally filtered by status (TODO, IN_PROGRESS, DONE).',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  status: { type: SchemaType.STRING },
                },
              },
            },
            {
              name: 'getTimeEntries',
              description:
                'Get time entries for a date range. Optional projectId can be provided to filter (mapped to taskId in current data model).',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  dateRange: {
                    type: SchemaType.OBJECT,
                    properties: {
                      start: { type: SchemaType.STRING },
                      end: { type: SchemaType.STRING },
                    },
                    required: ['start', 'end'],
                  },
                  projectId: { type: SchemaType.STRING },
                },
              },
            },
          ],
        },
      ],
    });

    const chat = model.startChat({
      history: history.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
    });

    let result = await chat.sendMessage(prompt);
    let remainingTurns = 5;

    while (remainingTurns > 0) {
      const functionCalls = result.response.functionCalls?.() || [];
      if (functionCalls.length === 0) {
        break;
      }

      const responses = await Promise.all(
        functionCalls.map(async (call) => {
          const args = call.args as {
            dateRange?: WorkspaceDateRange;
            status?: string;
            projectId?: string;
          };

          if (call.name === 'getCalendar' && args.dateRange) {
            return {
              functionResponse: {
                name: call.name,
                response: await tools.getCalendar(args.dateRange),
              },
            };
          }

          if (call.name === 'getTasks') {
            return {
              functionResponse: {
                name: call.name,
                response: await tools.getTasks(args.status),
              },
            };
          }

          if (call.name === 'getTimeEntries') {
            return {
              functionResponse: {
                name: call.name,
                response: await tools.getTimeEntries(
                  args.dateRange,
                  args.projectId,
                ),
              },
            };
          }

          return {
            functionResponse: {
              name: call.name,
              response: {
                error: `Unsupported tool call: ${call.name}`,
              },
            },
          };
        }),
      );

      result = await chat.sendMessage(responses as any);
      remainingTurns -= 1;
    }

    return result.response.text().trim();
  }
}
