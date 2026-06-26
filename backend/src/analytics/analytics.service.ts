import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface TaskStat {
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  totalDuration: number;
}

export interface WeeklyStats {
  totalDuration: number;
  taskStats: TaskStat[];
  periodStart: string;
  periodEnd: string;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getWeeklyStats(userId: string): Promise<WeeklyStats> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        userId,
        startTime: {
          gte: sevenDaysAgo,
          lte: now,
        },
        duration: {
          not: null,
        },
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });

    const taskMap = new Map<string, TaskStat>();

    for (const entry of entries) {
      const taskId = entry.task.id;
      const existing = taskMap.get(taskId);

      if (existing) {
        existing.totalDuration += entry.duration ?? 0;
      } else {
        taskMap.set(taskId, {
          taskId,
          taskTitle: entry.task.title,
          taskStatus: entry.task.status,
          totalDuration: entry.duration ?? 0,
        });
      }
    }

    const taskStats = Array.from(taskMap.values()).sort(
      (a, b) => b.totalDuration - a.totalDuration,
    );

    const totalDuration = taskStats.reduce(
      (sum, stat) => sum + stat.totalDuration,
      0,
    );

    return {
      totalDuration,
      taskStats,
      periodStart: sevenDaysAgo.toISOString(),
      periodEnd: now.toISOString(),
    };
  }
}
