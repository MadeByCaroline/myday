import { BadRequestException, Injectable } from '@nestjs/common';
import { AiService, WorkspaceDateRange } from '../ai/ai.service';
import { CalendarService } from '../calendar/calendar.service';
import { MicrosoftService } from '../integrations/microsoft.service';
import { TasksService } from '../tasks/tasks.service';
import { TimeTrackingService } from '../time-tracking/time-tracking.service';
import { UsersService } from '../users/users.service';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class ChatService {
  // Conversation history is stored in-memory per user (last 20 messages) and resets on server restart.
  private readonly conversationByUser = new Map<string, ConversationMessage[]>();

  constructor(
    private readonly aiService: AiService,
    private readonly usersService: UsersService,
    private readonly calendarService: CalendarService,
    private readonly microsoftService: MicrosoftService,
    private readonly tasksService: TasksService,
    private readonly timeTrackingService: TimeTrackingService,
  ) {}

  async sendMessage(userId: string, prompt: string) {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new BadRequestException('Prompt is required.');
    }

    const history = this.conversationByUser.get(userId) || [];
    const answer = await this.aiService.answerWorkspaceQuestion({
      prompt: trimmedPrompt,
      history,
      tools: {
        getCalendar: (dateRange) => this.getCalendar(userId, dateRange),
        getTasks: (status) => this.getTasks(userId, status),
        getTimeEntries: (dateRange, projectId) =>
          this.getTimeEntries(userId, dateRange, projectId),
      },
    });

    const updatedConversation: ConversationMessage[] = [
      ...history,
      { role: 'user', content: trimmedPrompt },
      { role: 'assistant', content: answer },
    ];
    this.conversationByUser.set(userId, updatedConversation.slice(-20));

    return { message: answer };
  }

  private async getCalendar(userId: string, dateRange: WorkspaceDateRange) {
    const range = this.normalizeDateRange(dateRange);
    const oauthTokens = await this.usersService.getOAuthTokens(userId);
    const eventResults = await Promise.allSettled(
      oauthTokens.map(async (oauthToken) => {
        const provider = oauthToken.provider.toUpperCase();

        if (provider === 'GOOGLE') {
          return this.calendarService.getEventsForRange(
            oauthToken.accessToken,
            oauthToken.refreshToken || undefined,
            range.start,
            range.end,
          );
        }

        if (provider === 'MICROSOFT') {
          const events = await this.microsoftService.getEventsForRange(
            oauthToken.accessToken,
            range.start,
            range.end,
          );
          return events.map((event) => ({
            id: event.id,
            title: event.title,
            start: event.start,
            end: event.end,
            provider: event.provider,
            location: event.location,
            link: event.link,
          }));
        }

        return [];
      }),
    );

    return eventResults
      .filter(
        (result): result is PromiseFulfilledResult<any[]> =>
          result.status === 'fulfilled',
      )
      .flatMap((result) => result.value)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  private async getTasks(userId: string, status?: string) {
    const tasks = await this.tasksService.getUserTasks(userId);
    if (!status) {
      return tasks;
    }

    return tasks.filter((task) => task.status === status.toUpperCase());
  }

  private async getTimeEntries(
    userId: string,
    dateRange?: WorkspaceDateRange,
    projectIdOrTaskId?: string,
  ) {
    const range = this.normalizeDateRange(
      dateRange || this.getDefaultDateRange(),
    );
    return this.timeTrackingService.getTimeEntries(userId, {
      start: range.start,
      end: range.end,
      taskId: projectIdOrTaskId,
    });
  }

  private getDefaultDateRange(): WorkspaceDateRange {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      start: sevenDaysAgo.toISOString(),
      end: now.toISOString(),
    };
  }

  private normalizeDateRange(range: WorkspaceDateRange) {
    const start = new Date(range.start);
    const end = new Date(range.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException(
        'Invalid date range: start and end must be valid ISO date strings.',
      );
    }
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException(
        'Invalid date range: start date must be before end date.',
      );
    }
    return { start, end };
  }
}
