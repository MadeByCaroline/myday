import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TimeTrackingService } from './time-tracking.service';

describe('TimeTrackingService', () => {
  let prisma: {
    task: { findFirst: jest.Mock };
    timeEntry: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: TimeTrackingService;

  beforeEach(() => {
    prisma = {
      task: {
        findFirst: jest.fn(),
      },
      timeEntry: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new TimeTrackingService(prisma as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a new time entry when no timer is running', async () => {
    const createdEntry = {
      id: 'entry-1',
      taskId: 'task-1',
      userId: 'user-1',
      startTime: new Date('2026-06-26T10:00:00.000Z'),
      endTime: null,
      duration: null,
      task: { id: 'task-1', title: 'Write tests' },
    };

    prisma.task.findFirst.mockResolvedValue({
      id: 'task-1',
      title: 'Write tests',
    });

    prisma.timeEntry.findFirst.mockResolvedValue(null);
    prisma.timeEntry.create.mockResolvedValue(createdEntry);

    const result = await service.startTimer('user-1', 'task-1');

    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'task-1',
        userId: 'user-1',
      },
      select: {
        id: true,
        title: true,
      },
    });
    expect(prisma.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId: 'user-1',
          taskId: 'task-1',
          startTime: expect.any(Date),
        },
      }),
    );
    expect(result).toEqual(createdEntry);
  });

  it('returns time entries filtered by date range and task id', async () => {
    const entries = [{ id: 'entry-1', taskId: 'task-1' }];
    prisma.timeEntry.findMany.mockResolvedValue(entries);

    const result = await service.getTimeEntries('user-1', {
      start: new Date('2026-06-01T00:00:00.000Z'),
      end: new Date('2026-06-30T23:59:59.000Z'),
      taskId: 'task-1',
    });

    expect(prisma.timeEntry.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        taskId: 'task-1',
        startTime: {
          gte: new Date('2026-06-01T00:00:00.000Z'),
          lte: new Date('2026-06-30T23:59:59.000Z'),
        },
      },
      orderBy: {
        startTime: 'desc',
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      take: 200,
    });
    expect(result).toEqual(entries);
  });

  it('returns the active entry when starting the same task twice', async () => {
    const activeEntry = {
      id: 'entry-1',
      taskId: 'task-1',
      userId: 'user-1',
      startTime: new Date('2026-06-26T10:00:00.000Z'),
      endTime: null,
      duration: null,
      task: { id: 'task-1', title: 'Write tests' },
    };

    prisma.task.findFirst.mockResolvedValue({
      id: 'task-1',
      title: 'Write tests',
    });
    prisma.timeEntry.findFirst.mockResolvedValue(activeEntry);

    await expect(service.startTimer('user-1', 'task-1')).resolves.toEqual(
      activeEntry,
    );
    expect(prisma.timeEntry.create).not.toHaveBeenCalled();
  });

  it('rejects starting a second task while another timer is running', async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: 'task-2',
      title: 'Review PR',
    });
    prisma.timeEntry.findFirst.mockResolvedValue({
      id: 'entry-1',
      taskId: 'task-1',
      userId: 'user-1',
      startTime: new Date('2026-06-26T10:00:00.000Z'),
      endTime: null,
      duration: null,
      task: { id: 'task-1', title: 'Write tests' },
    });

    await expect(service.startTimer('user-1', 'task-2')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws when trying to start a timer for another user’s task', async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    await expect(
      service.startTimer('user-1', 'task-404'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stops a running timer and stores the duration in seconds', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-26T10:05:30.000Z'));

    const activeEntry = {
      id: 'entry-1',
      taskId: 'task-1',
      userId: 'user-1',
      startTime: new Date('2026-06-26T10:00:00.000Z'),
      endTime: null,
      duration: null,
      task: { id: 'task-1', title: 'Write tests' },
    };
    const stoppedEntry = {
      ...activeEntry,
      endTime: new Date('2026-06-26T10:05:30.000Z'),
      duration: 330,
    };

    prisma.timeEntry.findFirst.mockResolvedValue(activeEntry);
    prisma.timeEntry.update.mockResolvedValue(stoppedEntry);

    const result = await service.stopTimer('user-1', 'entry-1');

    expect(prisma.timeEntry.update).toHaveBeenCalledWith({
      where: {
        id: 'entry-1',
      },
      data: {
        endTime: new Date('2026-06-26T10:05:30.000Z'),
        duration: 330,
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
    expect(result).toEqual(stoppedEntry);
  });

  it('rejects stopping an already stopped timer', async () => {
    prisma.timeEntry.findFirst.mockResolvedValue({
      id: 'entry-1',
      taskId: 'task-1',
      userId: 'user-1',
      startTime: new Date('2026-06-26T10:00:00.000Z'),
      endTime: new Date('2026-06-26T10:10:00.000Z'),
      duration: 600,
      task: { id: 'task-1', title: 'Write tests' },
    });

    await expect(service.stopTimer('user-1', 'entry-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
