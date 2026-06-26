import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

const VALID_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'SCHEDULED'] as const;
type TaskStatus = (typeof VALID_STATUSES)[number];
const TASK_INCLUDE = {
  workspace: true,
} as const;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  async createTask(
    userId: string,
    data: {
      title: string;
      description?: string;
      source?: string;
      workspaceId?: string | null;
    },
  ) {
    const workspaceId = await this.workspacesService.resolveWorkspaceId(
      userId,
      data.workspaceId,
    );

    return this.prisma.task.create({
      data: {
        userId,
        workspaceId,
        title: data.title,
        description: data.description,
        source: data.source || 'MANUAL',
        status: VALID_STATUSES[0],
      },
      include: TASK_INCLUDE,
    });
  }

  async getOpenTasks(userId: string, workspaceId?: string) {
    await this.workspacesService.ensureDefaultWorkspace(userId);

    return this.prisma.task.findMany({
      where: {
        userId,
        status: { in: ['TODO', 'IN_PROGRESS'] },
        ...(workspaceId ? { workspaceId } : {}),
      },
      include: TASK_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  async getOpenTasksAcrossWorkspaces(userId: string) {
    return this.getOpenTasks(userId);
  }

  async getUserTasks(userId: string, workspaceId?: string) {
    await this.workspacesService.ensureDefaultWorkspace(userId);

    return this.prisma.task.findMany({
      where: {
        userId,
        ...(workspaceId ? { workspaceId } : {}),
      },
      include: TASK_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteTask(taskId: string, userId: string) {
    return this.prisma.task.deleteMany({
      where: { id: taskId, userId },
    });
  }

  async updateTask(
    taskId: string,
    userId: string,
    data: { status?: string; title?: string },
  ) {
    if (data.status !== undefined) {
      if (!VALID_STATUSES.includes(data.status as TaskStatus)) {
        throw new BadRequestException(
          `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        );
      }
    }

    return this.prisma.task.updateMany({
      where: { id: taskId, userId },
      data,
    });
  }
}
