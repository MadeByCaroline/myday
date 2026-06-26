import { BadRequestException } from '@nestjs/common';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  function makeService() {
    const aiService = {
      answerWorkspaceQuestion: jest.fn(),
    };
    const usersService = {
      getOAuthTokens: jest.fn().mockResolvedValue([]),
    };
    const calendarService = {
      getEventsForRange: jest.fn().mockResolvedValue([]),
    };
    const microsoftService = {
      getEventsForRange: jest.fn().mockResolvedValue([]),
    };
    const tasksService = {
      getUserTasks: jest
        .fn()
        .mockResolvedValue([{ id: 'task-1', title: 'Write docs', status: 'TODO' }]),
    };
    const timeTrackingService = {
      getTimeEntries: jest.fn().mockResolvedValue([]),
    };

    const service = new ChatService(
      aiService as any,
      usersService as any,
      calendarService as any,
      microsoftService as any,
      tasksService as any,
      timeTrackingService as any,
    );

    return {
      service,
      aiService,
      tasksService,
      timeTrackingService,
    };
  }

  it('rejects empty prompts', async () => {
    const { service } = makeService();
    await expect(service.sendMessage('user-1', '   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lets AI call internal workspace tools and returns AI answer', async () => {
    const { service, aiService, tasksService, timeTrackingService } = makeService();
    aiService.answerWorkspaceQuestion.mockImplementation(async ({ tools }: any) => {
      const tasks = await tools.getTasks('TODO');
      const entries = await tools.getTimeEntries(
        {
          start: '2026-06-01T00:00:00.000Z',
          end: '2026-06-30T23:59:59.000Z',
        },
        'task-1',
      );
      return `Tasks: ${tasks.length}, entries: ${entries.length}`;
    });

    const result = await service.sendMessage('user-1', 'How much do I have left?');

    expect(result).toEqual({ message: 'Tasks: 1, entries: 0' });
    expect(tasksService.getUserTasks).toHaveBeenCalledWith('user-1');
    expect(timeTrackingService.getTimeEntries).toHaveBeenCalledWith('user-1', {
      start: new Date('2026-06-01T00:00:00.000Z'),
      end: new Date('2026-06-30T23:59:59.000Z'),
      taskId: 'task-1',
    });
  });

  it('keeps conversation history in memory', async () => {
    const { service, aiService } = makeService();
    aiService.answerWorkspaceQuestion.mockResolvedValue('answer');

    await service.sendMessage('user-1', 'First');
    await service.sendMessage('user-1', 'Second');

    expect(aiService.answerWorkspaceQuestion).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        prompt: 'Second',
        history: [
          { role: 'user', content: 'First' },
          { role: 'assistant', content: 'answer' },
        ],
      }),
    );
  });
});
