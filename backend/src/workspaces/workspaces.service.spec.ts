import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';

describe('WorkspacesService', () => {
  function createService() {
    const prisma = {
      workspace: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      task: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      oAuthToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn().mockImplementation(async (operations) => Promise.all(operations)),
    };

    return {
      prisma,
      service: new WorkspacesService(prisma as any),
    };
  }

  it('creates a default workspace and backfills unassigned records on first list', async () => {
    const { prisma, service } = createService();
    const defaultWorkspace = {
      id: 'ws-1',
      userId: 'user-1',
      name: 'Personnel',
      color: '#6366F1',
      icon: 'pi pi-home',
    };

    prisma.workspace.findFirst.mockResolvedValueOnce(null);
    prisma.workspace.create.mockResolvedValue(defaultWorkspace);
    prisma.workspace.findMany.mockResolvedValue([defaultWorkspace]);

    const result = await service.listWorkspaces('user-1');

    expect(prisma.workspace.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        name: 'Personnel',
        color: '#6366F1',
        icon: 'pi pi-home',
      },
    });
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', workspaceId: null },
      data: { workspaceId: 'ws-1' },
    });
    expect(prisma.oAuthToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', workspaceId: null },
      data: { workspaceId: 'ws-1' },
    });
    expect(result).toEqual([defaultWorkspace]);
  });

  it('creates a workspace with normalized values', async () => {
    const { prisma, service } = createService();
    const createdWorkspace = {
      id: 'ws-2',
      userId: 'user-1',
      name: 'Work',
      color: '#123456',
      icon: 'pi pi-briefcase',
    };

    prisma.workspace.create.mockResolvedValue(createdWorkspace);

    const result = await service.createWorkspace('user-1', {
      name: '  Work  ',
      color: '  #123456  ',
      icon: '  pi pi-briefcase  ',
    });

    expect(prisma.workspace.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        name: 'Work',
        color: '#123456',
        icon: 'pi pi-briefcase',
      },
    });
    expect(result).toEqual(createdWorkspace);
  });

  it('resolves an explicit workspace owned by the user', async () => {
    const { prisma, service } = createService();
    prisma.workspace.findFirst.mockResolvedValue({ id: 'ws-2' });

    await expect(service.resolveWorkspaceId('user-1', 'ws-2')).resolves.toBe('ws-2');
  });

  it('rejects unknown workspace ids', async () => {
    const { prisma, service } = createService();
    prisma.workspace.findFirst.mockResolvedValue(null);

    await expect(service.resolveWorkspaceId('user-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reassigns tasks and integrations before deleting a workspace', async () => {
    const { prisma, service } = createService();
    prisma.workspace.findMany.mockResolvedValue([
      { id: 'ws-1', userId: 'user-1' },
      { id: 'ws-2', userId: 'user-1' },
    ]);

    const result = await service.deleteWorkspace('ws-1', 'user-1');

    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', workspaceId: 'ws-1' },
      data: { workspaceId: 'ws-2' },
    });
    expect(prisma.oAuthToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', workspaceId: 'ws-1' },
      data: { workspaceId: 'ws-2' },
    });
    expect(prisma.workspace.delete).toHaveBeenCalledWith({
      where: { id: 'ws-1' },
    });
    expect(result).toEqual({
      deletedWorkspaceId: 'ws-1',
      reassignedToWorkspaceId: 'ws-2',
    });
  });

  it('does not allow deleting the last workspace', async () => {
    const { prisma, service } = createService();
    prisma.workspace.findMany.mockResolvedValue([{ id: 'ws-1', userId: 'user-1' }]);

    await expect(service.deleteWorkspace('ws-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
