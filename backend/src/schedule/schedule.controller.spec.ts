import { ScheduleController } from './schedule.controller';
import type { AiService } from '../ai/ai.service';
import type { TasksService } from '../tasks/tasks.service';
import type { UsersService } from '../users/users.service';
import type { GoogleService } from '../integrations/google.service';
import type { MicrosoftService } from '../integrations/microsoft.service';

describe('ScheduleController', () => {
  const mockUser = { id: 'user-1' };

  const timeBlocks = [
    { taskId: 'task-1', suggestedStartTime: '09:30', suggestedEndTime: '10:00', title: 'Write report' },
  ];

  function makeController(overrides: {
    usersService?: Partial<UsersService>;
    googleService?: Partial<GoogleService>;
    microsoftService?: Partial<MicrosoftService>;
    tasksService?: Partial<TasksService>;
    aiService?: Partial<AiService>;
  }) {
    const usersService = overrides.usersService ?? {
      getOAuthTokens: jest.fn().mockResolvedValue([]),
    };
    const googleService = overrides.googleService ?? {
      getTodayEvents: jest.fn().mockResolvedValue([]),
    };
    const microsoftService = overrides.microsoftService ?? {
      getTodayEvents: jest.fn().mockResolvedValue([]),
    };
    const tasksService = overrides.tasksService ?? {
      getOpenTasks: jest.fn().mockResolvedValue([]),
      updateTask: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const aiService = overrides.aiService ?? {
      generateTimeBlocking: jest.fn().mockResolvedValue(timeBlocks),
    };

    return new ScheduleController(
      aiService as AiService,
      tasksService as TasksService,
      usersService as UsersService,
      googleService as GoogleService,
      microsoftService as MicrosoftService,
    );
  }

  it('fetches Google and Microsoft events, open tasks, and returns AI time blocks', async () => {
    const googleEvents = [
      { id: 'g-1', title: 'Standup', start: '2026-06-26T09:00:00.000Z', end: '2026-06-26T09:15:00.000Z', provider: 'GOOGLE' as const },
    ];
    const openTasks = [
      { id: 'task-1', title: 'Write report', description: 'Q2 report', status: 'TODO', userId: 'user-1', source: 'MANUAL', createdAt: new Date(), updatedAt: new Date() },
    ];

    const usersService = { getOAuthTokens: jest.fn().mockResolvedValue([{ provider: 'google', accessToken: 'g-token', refreshToken: 'g-refresh' }]) };
    const googleService = { getTodayEvents: jest.fn().mockResolvedValue(googleEvents) };
    const microsoftService = { getTodayEvents: jest.fn().mockResolvedValue([]) };
    const tasksService = {
      getOpenTasks: jest.fn().mockResolvedValue(openTasks),
      updateTask: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const aiService = { generateTimeBlocking: jest.fn().mockResolvedValue(timeBlocks) };

    const controller = makeController({ usersService, googleService, microsoftService, tasksService, aiService });
    const result = await controller.optimizeDay({ user: mockUser });

    expect(usersService.getOAuthTokens).toHaveBeenCalledWith('user-1');
    expect(googleService.getTodayEvents).toHaveBeenCalledWith('g-token', 'g-refresh');
    expect(tasksService.getOpenTasks).toHaveBeenCalledWith('user-1');
    expect(aiService.generateTimeBlocking).toHaveBeenCalledWith(
      [{ id: 'task-1', title: 'Write report', description: 'Q2 report' }],
      expect.any(Array),
    );
    expect(tasksService.updateTask).toHaveBeenCalledWith('task-1', 'user-1', { status: 'SCHEDULED' });
    expect(result).toEqual(timeBlocks);
  });

  it('does not call updateTask when AI returns empty time blocks', async () => {
    const tasksService = {
      getOpenTasks: jest.fn().mockResolvedValue([{ id: 'task-1', title: 'Write report', description: null, status: 'TODO', userId: 'user-1', source: 'MANUAL', createdAt: new Date(), updatedAt: new Date() }]),
      updateTask: jest.fn(),
    };
    const aiService = { generateTimeBlocking: jest.fn().mockResolvedValue([]) };

    const controller = makeController({ tasksService, aiService });
    const result = await controller.optimizeDay({ user: mockUser });

    expect(tasksService.updateTask).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('uses Microsoft provider when token provider is MICROSOFT', async () => {
    const microsoftEvents = [
      { id: 'm-1', title: 'Review', start: '2026-06-26T10:00:00.000Z', end: '2026-06-26T10:30:00.000Z', provider: 'MICROSOFT' as const },
    ];
    const usersService = { getOAuthTokens: jest.fn().mockResolvedValue([{ provider: 'MICROSOFT', accessToken: 'ms-token' }]) };
    const googleService = { getTodayEvents: jest.fn() };
    const microsoftService = { getTodayEvents: jest.fn().mockResolvedValue(microsoftEvents) };
    const tasksService = { getOpenTasks: jest.fn().mockResolvedValue([]), updateTask: jest.fn() };
    const aiService = { generateTimeBlocking: jest.fn().mockResolvedValue([]) };

    const controller = makeController({ usersService, googleService, microsoftService, tasksService, aiService });
    await controller.optimizeDay({ user: mockUser });

    expect(microsoftService.getTodayEvents).toHaveBeenCalledWith('ms-token');
    expect(googleService.getTodayEvents).not.toHaveBeenCalled();
  });
});
