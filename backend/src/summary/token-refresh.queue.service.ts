import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TokenRefreshQueueService {
  private readonly logger = new Logger(TokenRefreshQueueService.name);
  private readonly pendingKeys = new Set<string>();
  private readonly tasks: Array<{ key: string; task: () => Promise<void> }> = [];
  private processing = false;
  private scheduled = false;

  enqueue(key: string, task: () => Promise<void>) {
    if (this.pendingKeys.has(key)) {
      return;
    }

    this.pendingKeys.add(key);
    this.tasks.push({ key, task });

    if (!this.scheduled) {
      this.scheduled = true;
      setImmediate(() => {
        this.scheduled = false;
        void this.processQueue();
      });
    }
  }

  private async processQueue() {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.tasks.length > 0) {
      const nextTask = this.tasks.shift()!;

      try {
        await nextTask.task();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown token refresh error';
        this.logger.warn(
          `Background token refresh failed for ${nextTask.key}: ${message}`,
        );
      } finally {
        this.pendingKeys.delete(nextTask.key);
      }
    }

    this.processing = false;
  }
}
