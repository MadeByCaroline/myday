import { Injectable, Logger } from '@nestjs/common';
import type { TimeBlock, TimeBlockingTaskInput } from '../ai/ai.service';

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  validateTimeBlocks(
    timeBlocks: TimeBlock[],
    tasks: TimeBlockingTaskInput[],
  ): TimeBlock[] {
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const normalizedBlocks = timeBlocks.map((block) => {
      const task = taskById.get(block.taskId);
      const startMinutes = this.parseTime(block.suggestedStartTime);
      const endMinutes = this.parseTime(block.suggestedEndTime);

      if (!task || startMinutes === null || endMinutes === null) {
        return null;
      }

      if (endMinutes <= startMinutes) {
        return null;
      }

      return {
        block,
        startMinutes,
        endMinutes,
        workspaceKey: task.workspaceId ?? null,
      };
    });

    if (normalizedBlocks.some((block) => block === null)) {
      this.logger.warn(
        'Rejecting AI time blocks because at least one block is malformed or references an unknown task.',
      );
      return [];
    }

    const validBlocks = normalizedBlocks as Array<{
      block: TimeBlock;
      startMinutes: number;
      endMinutes: number;
      workspaceKey: string | null;
    }>;

    for (let index = 0; index < validBlocks.length; index += 1) {
      const currentBlock = validBlocks[index];

      for (
        let compareIndex = index + 1;
        compareIndex < validBlocks.length;
        compareIndex += 1
      ) {
        const comparisonBlock = validBlocks[compareIndex];
        const overlaps =
          currentBlock.startMinutes < comparisonBlock.endMinutes &&
          comparisonBlock.startMinutes < currentBlock.endMinutes;

        if (!overlaps) {
          continue;
        }

        if (
          currentBlock.workspaceKey &&
          comparisonBlock.workspaceKey &&
          currentBlock.workspaceKey !== comparisonBlock.workspaceKey
        ) {
          this.logger.warn(
            `Rejecting AI time blocks because ${currentBlock.block.taskId} and ${comparisonBlock.block.taskId} overlap across workspaces.`,
          );
          return [];
        }
      }
    }

    return timeBlocks;
  }

  private parseTime(value: string): number | null {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) {
      return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }

    return hours * 60 + minutes;
  }
}
