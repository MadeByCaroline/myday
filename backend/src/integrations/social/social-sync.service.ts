import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Job, Queue, Worker } from 'bullmq';
import { SocialProvider } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FacebookAdapter } from './adapters/facebook.adapter';
import { InstagramAdapter } from './adapters/instagram.adapter';
import type { SocialAdapter } from './adapters/social.adapter';
import { TikTokAdapter } from './adapters/tiktok.adapter';
import type { SocialTrendMetrics } from './social-metrics.types';

interface SocialSyncJobData {
  socialAccountId: string;
  retryCount?: number;
}

@Injectable()
export class SocialSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SocialSyncService.name);
  private queue: Queue<SocialSyncJobData> | null = null;
  private worker: Worker<SocialSyncJobData> | null = null;
  private readonly adaptersByProvider: Map<SocialProvider, SocialAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    instagramAdapter: InstagramAdapter,
    facebookAdapter: FacebookAdapter,
    tiktokAdapter: TikTokAdapter,
  ) {
    this.adaptersByProvider = new Map<SocialProvider, SocialAdapter>([
      ['INSTAGRAM', instagramAdapter],
      ['FACEBOOK', facebookAdapter],
      ['TIKTOK', tiktokAdapter],
    ]);
  }

  async onModuleInit() {
    const connection = this.getBullConnection();
    if (!connection) {
      this.logger.warn(
        'BullMQ disabled: REDIS_URL is missing. Falling back to direct sync.',
      );
      return;
    }

    const bull = await import('bullmq');

    this.queue = new bull.Queue<SocialSyncJobData>('social-sync', {
      connection,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    });

    this.worker = new bull.Worker<SocialSyncJobData>(
      'social-sync',
      async (job: Job<SocialSyncJobData>) => {
        await this.syncAccountById(job.data.socialAccountId);
      },
      { connection },
    );

    this.worker.on('failed', (job, error) => {
      const id = job?.data?.socialAccountId || 'unknown';
      this.logger.warn(
        `Social sync failed for account ${id}: ${error.message}`,
      );
    });

    await this.ensureRecurringJobs();
  }

  async onModuleDestroy() {
    await Promise.all([
      this.worker?.close() || Promise.resolve(),
      this.queue?.close() || Promise.resolve(),
    ]);
  }

  @Cron('0 */6 * * *')
  async scheduleSixHourSync() {
    const accountIds = await this.prisma.socialAccount.findMany({
      select: { id: true },
    });

    await Promise.all(
      accountIds.map((account) => this.enqueueSync(account.id, false)),
    );
  }

  async enqueueSync(socialAccountId: string, immediate = true) {
    if (this.queue) {
      await this.queue.add(
        'sync-account',
        { socialAccountId },
        {
          jobId: immediate
            ? `social-immediate-${socialAccountId}-${Date.now()}`
            : `social-scheduled-${socialAccountId}-${Date.now()}`,
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 60_000,
          },
        },
      );
      return;
    }

    await this.syncWithFallbackRetries(socialAccountId, 0);
  }

  async syncAccountById(socialAccountId: string) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
    });

    if (!account) {
      return;
    }

    const adapter = this.adaptersByProvider.get(account.provider);
    if (!adapter) {
      return;
    }

    const metrics = await adapter.fetchMetrics(account);

    await this.prisma.$transaction([
      this.prisma.socialMetricSnapshot.create({
        data: {
          socialAccountId: account.id,
          totalViews: metrics.totalViews,
          followerCount: metrics.followerCount,
          engagementRate: metrics.engagementRate,
        },
      }),
      this.prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          lastTotalViews: metrics.totalViews,
          lastFollowerCount: metrics.followerCount,
          lastEngagementRate: metrics.engagementRate,
          lastSyncedAt: new Date(),
        },
      }),
    ]);
  }

  async getStatsForUser(userId: string): Promise<SocialTrendMetrics[]> {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    return Promise.all(
      accounts.map(async (account) => {
        const previous = await this.prisma.socialMetricSnapshot.findFirst({
          where: {
            socialAccountId: account.id,
            recordedAt: { lte: weekAgo },
          },
          orderBy: { recordedAt: 'desc' },
        });

        const changeVsLastWeek =
          previous && previous.totalViews > 0
            ? Number(
                (
                  ((account.lastTotalViews - previous.totalViews) /
                    previous.totalViews) *
                  100
                ).toFixed(2),
              )
            : null;

        return {
          provider: account.provider,
          totalViews: account.lastTotalViews,
          followerCount: account.lastFollowerCount,
          engagementRate: account.lastEngagementRate,
          changeVsLastWeek,
          syncedAt: account.lastSyncedAt,
        };
      }),
    );
  }

  async getAccountNotifications(userId: string) {
    const threshold = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const accounts = await this.prisma.socialAccount.findMany({
      where: {
        userId,
        tokenExpiry: { not: null, lte: threshold },
      },
      orderBy: { tokenExpiry: 'asc' },
    });

    const now = new Date();
    const updatable = accounts
      .filter((account) => !account.tokenExpiringNotifiedAt)
      .map((account) => account.id);

    if (updatable.length > 0) {
      await this.prisma.socialAccount.updateMany({
        where: { id: { in: updatable } },
        data: { tokenExpiringNotifiedAt: now },
      });
    }

    return accounts.map((account) => ({
      accountId: account.id,
      provider: account.provider,
      tokenExpiry: account.tokenExpiry,
      message: `Your ${account.provider.toLowerCase()} token expires soon. Please relink your account.`,
    }));
  }

  private async ensureRecurringJobs() {
    const accounts = await this.prisma.socialAccount.findMany({
      select: { id: true },
    });

    await Promise.all(
      accounts.map((account) => this.enqueueSync(account.id, false)),
    );
  }

  private async syncWithFallbackRetries(
    socialAccountId: string,
    retryCount: number,
  ) {
    try {
      await this.syncAccountById(socialAccountId);
    } catch (error) {
      if (!this.isRateLimited(error) || retryCount >= 4) {
        throw error;
      }

      const delayMs = 2 ** retryCount * 60_000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      await this.syncWithFallbackRetries(socialAccountId, retryCount + 1);
    }
  }

  private isRateLimited(error: unknown) {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const maybe = error as { response?: { status?: number } };
    return maybe.response?.status === 429;
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
      db: parsed.pathname ? Number(parsed.pathname.replace('/', '') || '0') : 0,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  }
}
