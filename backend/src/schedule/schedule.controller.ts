import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from '../ai/ai.service';
import { TasksService } from '../tasks/tasks.service';
import { UsersService } from '../users/users.service';
import { GoogleService } from '../integrations/google.service';
import { MicrosoftService } from '../integrations/microsoft.service';
import type { UnifiedEvent } from '../calendar/unified-event.interface';
import type { CalendarEvent } from '../calendar/calendar.service';

interface ScheduleRequest {
  user: {
    id: string;
  };
}

@Controller('schedule')
@UseGuards(JwtAuthGuard)
export class ScheduleController {
  constructor(
    private readonly aiService: AiService,
    private readonly tasksService: TasksService,
    private readonly usersService: UsersService,
    private readonly googleService: GoogleService,
    private readonly microsoftService: MicrosoftService,
  ) {}

  @Post('optimize')
  async optimizeDay(@Req() req: ScheduleRequest) {
    const userId = req.user.id;

    const oauthTokens = await this.usersService.getOAuthTokens(userId);

    const eventResults = await Promise.allSettled(
      oauthTokens.map(async (oauthToken) => {
        const provider = oauthToken.provider.toUpperCase();

        if (provider === 'GOOGLE') {
          return this.googleService.getTodayEvents(
            oauthToken.accessToken,
            oauthToken.refreshToken || undefined,
          );
        }

        if (provider === 'MICROSOFT') {
          return this.microsoftService.getTodayEvents(oauthToken.accessToken);
        }

        return [] as UnifiedEvent[];
      }),
    );

    const calendarEvents: CalendarEvent[] = eventResults
      .filter(
        (result): result is PromiseFulfilledResult<UnifiedEvent[]> =>
          result.status === 'fulfilled',
      )
      .flatMap((result) => result.value)
      .map((event) => ({
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        location: event.location,
      }));

    const openTasks = await this.tasksService.getOpenTasksAcrossWorkspaces(userId);

    const timeBlocks = await this.aiService.generateTimeBlocking(
      openTasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
      })),
      calendarEvents,
    );

    if (timeBlocks.length > 0) {
      const scheduledTaskIds = timeBlocks.map((block) => block.taskId);
      await Promise.allSettled(
        scheduledTaskIds.map((taskId) =>
          this.tasksService.updateTask(taskId, userId, { status: 'SCHEDULED' }),
        ),
      );
    }

    return timeBlocks;
  }
}
