import { BadRequestException } from '@nestjs/common';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  function createService() {
    const prisma = {
      task: {
        create: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const workspacesService = {
      resolveWorkspaceId: jest.fn().mockResolvedValue('ws-1'),
      listWorkspaces: jest.fn().mockResolvedValue([{ id: 'ws-1' }]),
      ensureDefaultWorkspace: jest.fn().mockResolvedValue({ id: 'ws-1' }),
    };

    return {
      prisma,
      workspacesService,
      service: new TasksService(prisma as any, workspacesService as any),
    };
  }

  it('creates tasks in the resolved workspace', async () => {
    const { prisma, workspacesService, service } = createService();
    const createdTask = { id: 'task-1', title: 'Write report' };
    prisma.task.create.mockResolvedValue(createdTask);

    const result = await service.createTask('user-1', {
      title: 'Write report',
      description: 'Q2 report',
      workspaceId: 'ws-2',
    });

    expect(workspacesService.resolveWorkspaceId).toHaveBeenCalledWith(
      'user-1',
      'ws-2',
    );
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        workspaceId: 'ws-1',
        title: 'Write report',
        description: 'Q2 report',
        source: 'MANUAL',
        status: 'TODO',
      },
      include: { workspace: true },
    });
    expect(result).toEqual(createdTask);
  });

  it('loads user tasks with workspace details after ensuring workspace coverage', async () => {
    const { prisma, workspacesService, service } = createService();
    const tasks = [{ id: 'task-1', workspace: { id: 'ws-1' } }];
    prisma.task.findMany.mockResolvedValue(tasks);

    const result = await service.getUserTasks('user-1');

    expect(workspacesService.ensureDefaultWorkspace).toHaveBeenCalledWith(
      'user-1',
    );
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      include: { workspace: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual(tasks);
  });

  it('fetches all open tasks across workspaces for scheduling', async () => {
    const { prisma, service } = createService();
    prisma.task.findMany.mockResolvedValue([
      { id: 'task-1' },
      { id: 'task-2' },
    ]);

    await service.getOpenTasksAcrossWorkspaces('user-1');

    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: { in: ['TODO', 'IN_PROGRESS'] },
      },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    });
  });

  describe('bulkUpdateTasks', () => {
    it('updates only the given task IDs owned by the user', async () => {
      const { prisma, service } = createService();
      prisma.task.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.bulkUpdateTasks(
        'user-1',
        ['t1', 't2'],
        'DONE',
      );

      expect(prisma.task.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['t1', 't2'] }, userId: 'user-1' },
        data: { status: 'DONE' },
      });
      expect(result).toEqual({ count: 2 });
    });

    it('throws BadRequestException for an invalid status', async () => {
      const { service } = createService();

      await expect(
        service.bulkUpdateTasks('user-1', ['t1'], 'INVALID'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
