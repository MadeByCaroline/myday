import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const VALID_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
type TaskStatus = (typeof VALID_STATUSES)[number];

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async createTask(
    userId: string,
    data: { title: string; description?: string; source?: string },
  ) {
    return this.prisma.task.create({
      data: {
        userId,
        title: data.title,
        description: data.description,
        source: data.source || 'MANUAL',
        status: 'TODO',
      },
    });
  }

  async getUserTasks(userId: string) {
    return this.prisma.task.findMany({
      where: { userId },
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
