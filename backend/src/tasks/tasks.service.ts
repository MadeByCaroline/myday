import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
        status: 'accepted',
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
    data: { isCompleted?: boolean; status?: string; title?: string },
  ) {
    return this.prisma.task.updateMany({
      where: { id: taskId, userId },
      data,
    });
  }
}
