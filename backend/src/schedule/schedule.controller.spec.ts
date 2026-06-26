import { ScheduleController } from './schedule.controller';
import type { AiService } from '../ai/ai.service';
import type { CalendarService } from '../calendar/calendar.service';
import type { TasksService } from '../tasks/tasks.service';
import type { ScheduleService } from './schedule.service';

describe('ScheduleController', () => {
  const mockUser = { id: 'user-1' };

  const timeBlocks = [
    {
      taskId: 'task-1',
      suggestedStartTime: '09:30',
      suggestedEndTime: '10:00',
      title: 'Write report',
    },
  ];

  function makeController(overrides: {
    calendarService?: Partial<CalendarService>;
    tasksService?: Partial<TasksService>;
    aiService?: Partial<AiService>;
    scheduleService?: Partial<ScheduleService>;
  }) {
    const calendarService = overrides.calendarService ?? {
      getTodayWorkspaceEvents: jest.fn().mockResolvedValue([]),
    };
    const tasksService = overrides.tasksService ?? {
      getOpenTasksAcrossWorkspaces: jest.fn().mockResolvedValue([]),
      updateTask: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const aiService = overrides.aiService ?? {
      generateTimeBlocking: jest.fn().mockResolvedValue(timeBlocks),
    };
    const scheduleService = overrides.scheduleService ?? {
      validateTimeBlocks: jest.fn().mockReturnValue(timeBlocks),
    };

    return new ScheduleController(
      aiService as AiService,
      calendarService as CalendarService,
      scheduleService as ScheduleService,
      tasksService as TasksService,
    );
  }

  it('fetches unified workspace events and passes workspace metadata to the AI planner', async () => {
    const calendarEvents = [
      {
        id: 'g-1',
        title: 'Standup',
        start: '2026-06-26T09:00:00.000Z',
        end: '2026-06-26T09:15:00.000Z',
        provider: 'GOOGLE' as const,
        workspaceId: 'work',
        workspaceName: 'Work',
      },
    ];
    const openTasks = [
      {
        id: 'task-1',
        title: 'Write report',
        description: 'Q2 report',
        status: 'TODO',
        userId: 'user-1',
        source: 'MANUAL',
        workspaceId: 'work',
        workspace: { id: 'work', name: 'Work' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'task-2',
        title: 'Pick up groceries',
        description: 'After work',
        status: 'IN_PROGRESS',
        userId: 'user-1',
        source: 'MANUAL',
        workspaceId: 'life',
        workspace: { id: 'life', name: 'Family' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const calendarService = {
      getTodayWorkspaceEvents: jest.fn().mockResolvedValue(calendarEvents),
    };
    const tasksService = {
      getOpenTasksAcrossWorkspaces: jest.fn().mockResolvedValue(openTasks),
      updateTask: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const aiService = { generateTimeBlocking: jest.fn().mockResolvedValue(timeBlocks) };
    const scheduleService = {
      validateTimeBlocks: jest.fn().mockReturnValue(timeBlocks),
    };

    const controller = makeController({
      calendarService,
      tasksService,
      aiService,
      scheduleService,
    });
    const result = await controller.optimizeDay({ user: mockUser });

    expect(calendarService.getTodayWorkspaceEvents).toHaveBeenCalledWith('user-1');
    expect(tasksService.getOpenTasksAcrossWorkspaces).toHaveBeenCalledWith(
      'user-1',
    );
    expect(aiService.generateTimeBlocking).toHaveBeenCalledWith(
      [
        {
          id: 'task-1',
          title: 'Write report',
          description: 'Q2 report',
          workspaceId: 'work',
          workspaceName: 'Work',
        },
        {
          id: 'task-2',
          title: 'Pick up groceries',
          description: 'After work',
          workspaceId: 'life',
          workspaceName: 'Family',
        },
      ],
      calendarEvents,
    );
    expect(scheduleService.validateTimeBlocks).toHaveBeenCalledWith(
      timeBlocks,
      [
        {
          id: 'task-1',
          title: 'Write report',
          description: 'Q2 report',
          workspaceId: 'work',
          workspaceName: 'Work',
        },
        {
          id: 'task-2',
          title: 'Pick up groceries',
          description: 'After work',
          workspaceId: 'life',
          workspaceName: 'Family',
        },
      ],
    );
    expect(tasksService.updateTask).toHaveBeenCalledWith('task-1', 'user-1', {
      status: 'SCHEDULED',
    });
    expect(result).toEqual(timeBlocks);
  });

  it('does not call updateTask when the validated time blocks are empty', async () => {
    const tasksService = {
      getOpenTasksAcrossWorkspaces: jest.fn().mockResolvedValue([
        {
          id: 'task-1',
          title: 'Write report',
          description: null,
          status: 'TODO',
          userId: 'user-1',
          source: 'MANUAL',
          workspaceId: 'work',
          workspace: { id: 'work', name: 'Work' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
      updateTask: jest.fn(),
    };
    const aiService = { generateTimeBlocking: jest.fn().mockResolvedValue(timeBlocks) };
    const scheduleService = {
      validateTimeBlocks: jest.fn().mockReturnValue([]),
    };

    const controller = makeController({ tasksService, aiService, scheduleService });
    const result = await controller.optimizeDay({ user: mockUser });

    expect(tasksService.updateTask).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
