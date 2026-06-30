import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from '../ai/ai.service';
import { CalendarService } from '../calendar/calendar.service';
import { TasksService } from '../tasks/tasks.service';
import { ScheduleService } from './schedule.service';

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
    private readonly calendarService: CalendarService,
    private readonly scheduleService: ScheduleService,
    private readonly tasksService: TasksService,
  ) {}

  @Post('optimize')
  async optimizeDay(@Req() req: ScheduleRequest) {
    const userId = req.user.id;
    const calendarEvents =
      await this.calendarService.getTodayWorkspaceEvents(userId);

    const openTasks =
      await this.tasksService.getOpenTasksAcrossWorkspaces(userId);
    const schedulingTasks = openTasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      workspaceId: task.workspaceId ?? null,
      workspaceName: task.workspace?.name ?? null,
    }));

    const timeBlocks = await this.aiService.generateTimeBlocking(
      schedulingTasks,
      calendarEvents,
    );
    const validatedTimeBlocks = this.scheduleService.validateTimeBlocks(
      timeBlocks,
      schedulingTasks,
    );

    if (validatedTimeBlocks.length > 0) {
      const scheduledTaskIds = validatedTimeBlocks.map((block) => block.taskId);
      await Promise.allSettled(
        scheduledTaskIds.map((taskId) =>
          this.tasksService.updateTask(taskId, userId, { status: 'SCHEDULED' }),
        ),
      );
    }

    return validatedTimeBlocks;
  }
}
