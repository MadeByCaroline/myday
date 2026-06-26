import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const timeEntryInclude = {
  task: {
    select: {
      id: true,
      title: true,
    },
  },
} as const;

@Injectable()
export class TimeTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  async getTimeEntries(
    userId: string,
    filters: { start: Date; end: Date; taskId?: string },
  ) {
    return this.prisma.timeEntry.findMany({
      where: {
        userId,
        taskId: filters.taskId || undefined,
        startTime: {
          gte: filters.start,
          lte: filters.end,
        },
      },
      orderBy: {
        startTime: 'desc',
      },
      include: timeEntryInclude,
      take: 200,
    });
  }

  async getCurrentEntry(userId: string) {
    return this.prisma.timeEntry.findFirst({
      where: {
        userId,
        endTime: null,
      },
      orderBy: {
        startTime: 'desc',
      },
      include: timeEntryInclude,
    });
  }

  async startTimer(userId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        userId,
      },
      select: {
        id: true,
        title: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const activeEntry = await this.getCurrentEntry(userId);

    if (activeEntry) {
      if (activeEntry.taskId === taskId) {
        return activeEntry;
      }

      throw new BadRequestException(
        'A timer is already running. Stop it before starting another one.',
      );
    }

    return this.prisma.timeEntry.create({
      data: {
        userId,
        taskId,
        startTime: new Date(),
      },
      include: timeEntryInclude,
    });
  }

  async stopTimer(userId: string, entryId: string) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: entryId,
        userId,
      },
      include: timeEntryInclude,
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    if (entry.endTime) {
      throw new BadRequestException('This timer has already been stopped.');
    }

    const endTime = new Date();
    const duration = Math.max(
      0,
      Math.floor((endTime.getTime() - entry.startTime.getTime()) / 1000),
    );

    return this.prisma.timeEntry.update({
      where: {
        id: entryId,
      },
      data: {
        endTime,
        duration,
      },
      include: timeEntryInclude,
    });
  }
}
