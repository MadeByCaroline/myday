import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Job, Queue, Worker } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TasksService } from '../../tasks/tasks.service';
import { NotionOAuthService, type NotionPage } from './notion-oauth.service';

interface NotionSyncJobData {
  integrationLinkId: string;
}

const STATUS_MAP: Record<string, string> = {
  'not started': 'TODO',
  'todo': 'TODO',
  'to-do': 'TODO',
  'to do': 'TODO',
  'in progress': 'IN_PROGRESS',
  'in-progress': 'IN_PROGRESS',
  'doing': 'IN_PROGRESS',
  'done': 'DONE',
  'complete': 'DONE',
  'completed': 'DONE',
};

@Injectable()
export class NotionSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotionSyncService.name);
  private queue: Queue<NotionSyncJobData> | null = null;
  private worker: Worker<NotionSyncJobData> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly notionOAuth: NotionOAuthService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const connection = this.getBullConnection();
    if (!connection) {
      this.logger.warn(
        'BullMQ disabled: REDIS_URL is missing. Notion sync will run inline.',
      );
      return;
    }

    const bull = await import('bullmq');

    this.queue = new bull.Queue<NotionSyncJobData>('notion-sync', {
      connection,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    });

    this.worker = new bull.Worker<NotionSyncJobData>(
      'notion-sync',
      async (job: Job<NotionSyncJobData>) => {
        await this.syncLinkById(job.data.integrationLinkId);
      },
      { connection },
    );

    this.worker.on('failed', (job, error) => {
      const id = job?.data?.integrationLinkId || 'unknown';
      this.logger.warn(`Notion sync failed for link ${id}: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    await Promise.all([
      this.worker?.close() || Promise.resolve(),
      this.queue?.close() || Promise.resolve(),
    ]);
  }

  @Cron('0 */1 * * *')
  async scheduleHourlySync() {
    const links = await this.prisma.integrationLink.findMany({
      where: { type: 'notion', active: true },
      select: { id: true },
    });

    await Promise.all(links.map((link) => this.enqueueSync(link.id)));
  }

  async enqueueSync(integrationLinkId: string): Promise<void> {
    if (this.queue) {
      await this.queue.add(
        'sync-notion',
        { integrationLinkId },
        {
          jobId: `notion-${integrationLinkId}-${Date.now()}`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 60_000,
          },
        },
      );
      return;
    }

    await this.syncWithRetry(integrationLinkId, 0);
  }

  async syncLinkById(integrationLinkId: string): Promise<void> {
    const link = await this.prisma.integrationLink.findUnique({
      where: { id: integrationLinkId },
    });

    if (!link || !link.active) {
      return;
    }

    const token = await this.prisma.oAuthToken.findFirst({
      where: { userId: link.userId, provider: 'NOTION' },
    });

    if (!token) {
      this.logger.warn(
        `No Notion token found for user ${link.userId} (link ${integrationLinkId})`,
      );
      return;
    }

    let pages: NotionPage[];
    try {
      pages = await this.notionOAuth.queryDatabase(
        token.accessToken,
        link.sourceId,
      );
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response
        ?.status;
      if (status === 429) {
        throw err;
      }
      this.logger.error(
        `Failed to query Notion database ${link.sourceId}: ${String(err)}`,
      );
      return;
    }

    for (const page of pages) {
      await this.upsertPageAsTask(page, link.userId, link.workspaceId, link.id);
    }

    this.logger.log(
      `Synced ${pages.length} pages from Notion database ${link.sourceId}`,
    );
  }

  private async upsertPageAsTask(
    page: NotionPage,
    userId: string,
    workspaceId: string | null,
    linkId: string,
  ): Promise<void> {
    const title = this.extractTitle(page);
    if (!title) {
      return;
    }

    const status = this.extractStatus(page);
    const externalId = `notion_page_${page.id}`;

    try {
      await this.tasksService.upsertTask(userId, {
        externalId,
        title,
        source: 'notion',
        workspaceId,
        status: status || undefined,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to upsert Notion page ${page.id} for link ${linkId}: ${String(err)}`,
      );
    }
  }

  private extractTitle(page: NotionPage): string | null {
    for (const [, prop] of Object.entries(page.properties)) {
      if (prop.type === 'title' && prop.title && prop.title.length > 0) {
        return prop.title.map((t) => t.plain_text).join('');
      }
    }
    return null;
  }

  private extractStatus(page: NotionPage): string | null {
    for (const [, prop] of Object.entries(page.properties)) {
      if (prop.type === 'status' && prop.status?.name) {
        return STATUS_MAP[prop.status.name.toLowerCase()] ?? null;
      }
      if (prop.type === 'select' && prop.select?.name) {
        return STATUS_MAP[prop.select.name.toLowerCase()] ?? null;
      }
    }
    return null;
  }

  private async syncWithRetry(
    integrationLinkId: string,
    retryCount: number,
  ): Promise<void> {
    try {
      await this.syncLinkById(integrationLinkId);
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response
        ?.status;
      if (status !== 429 || retryCount >= 2) {
        throw err;
      }
      const delayMs = 2 ** retryCount * 60_000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      await this.syncWithRetry(integrationLinkId, retryCount + 1);
    }
  }

  private getBullConnection() {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      return null;
    }

    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || '6379'),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      db: parsed.pathname
        ? Number(parsed.pathname.replace('/', '') || '0')
        : 0,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  }
}
