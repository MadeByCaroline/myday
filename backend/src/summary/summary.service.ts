import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { google } from 'googleapis';
import { AiService } from '../ai/ai.service';
import type { CalendarEvent } from '../calendar/calendar.service';
import { CalendarService } from '../calendar/calendar.service';
import type { UnifiedEvent } from '../calendar/unified-event.interface';
import {
  IntegrationProviderError,
  isIntegrationProviderError,
} from '../integrations/integration-provider.error';
import { MicrosoftService } from '../integrations/microsoft.service';
import type { EmailSummary } from '../mail/mail.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { TokenRefreshQueueService } from './token-refresh.queue.service';

interface RefreshedOAuthToken {
  accessToken: string;
  refreshToken?: string;
}

interface MicrosoftRefreshResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
}

type OAuthTokenRecord = Awaited<
  ReturnType<PrismaService['oAuthToken']['findMany']>
>[number];

interface IntegrationStatus {
  provider: string;
  status: 'ready' | 'error';
  code?: 'needs_reauth' | 'provider_unavailable';
  message?: string;
}

@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);
  private static readonly MICROSOFT_SCOPES = [
    'openid',
    'profile',
    'email',
    'user.read',
    'mail.read',
    'Mail.ReadWrite',
    'Calendars.Read',
    'offline_access',
  ].join(' ');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly calendarService: CalendarService,
    private readonly microsoftService: MicrosoftService,
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly tokenRefreshQueue: TokenRefreshQueueService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async generateDailySummariesForAllUsers() {
    const users = await this.prisma.user.findMany({
      select: { id: true },
    });

    for (const user of users) {
      try {
        await this.generateSummaryForUser(user.id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown summary error';
        this.logger.error(
          `Failed to generate daily summary for user ${user.id}`,
          message,
        );
      }
    }
  }

  async generateSummaryForUser(userId: string) {
    const [oauthTokens, userSettings, user] = await Promise.all([
      this.prisma.oAuthToken.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      }),
      this.settingsService.getSettings(userId),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { dailySummary: true },
      }),
    ]);

    if (oauthTokens.length === 0) {
      return {
        error:
          'No OAuth token found. Please connect a Google or Outlook account.',
        integrations: [],
      };
    }

    this.logger.log(
      'Connected providers for user: ' +
        oauthTokens.map((token) => token.provider).join(', '),
    );

    const accountData = await Promise.allSettled(
      oauthTokens.map((oauthToken) => this.fetchAccountData(oauthToken)),
    );
    const integrations = this.buildIntegrationStatuses(oauthTokens, accountData);

    const successfulData = accountData
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<{
          provider: string;
          emails: EmailSummary[];
          events: CalendarEvent[];
        }> => result.status === 'fulfilled',
      )
      .map((result) => result.value);

    accountData
      .filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      )
      .forEach((result) => {
        const reason = this.normalizeIntegrationError('UNKNOWN', result.reason);
        this.logger.warn(
          `Skipping an OAuth account due to fetch failure: ${reason.provider} ${reason.code}`,
        );
      });

    if (successfulData.length === 0) {
      return {
        summary: user?.dailySummary || '',
        events: [],
        suggested_tasks: [],
        email_summaries: [],
        integrations,
        usedCachedSummary: Boolean(user?.dailySummary),
        error: user?.dailySummary
          ? 'Les données de vos intégrations sont temporairement indisponibles. Affichage du dernier résumé enregistré.'
          : 'Les données de vos intégrations sont temporairement indisponibles. Reconnectez vos comptes puis réessayez.',
      };
    }

    const allEmails = successfulData.flatMap((data) => data.emails);
    const filteredEmails = this.filterExcludedSenders(
      allEmails,
      userSettings.excludedSenders,
    );

    const googleEmailCount = successfulData
      .filter((d) => d.provider === 'GOOGLE')
      .flatMap((d) => d.emails).length;
    const microsoftEmailCount = successfulData
      .filter((d) => d.provider === 'MICROSOFT')
      .flatMap((d) => d.emails).length;

    this.logger.log(
      `Aggregated Data -> Google Emails: ${googleEmailCount} | Microsoft Emails: ${microsoftEmailCount} | After filter: ${filteredEmails.length}`,
    );

    const analysis = await this.aiService.analyzeProductivityData(
      filteredEmails,
      successfulData.flatMap((data) => data.events),
      userSettings.aiSummaryInstructions,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { dailySummary: analysis.summary },
    });

    return {
      ...analysis,
      integrations,
    };
  }

  private filterExcludedSenders(
    emails: EmailSummary[],
    excludedSenders: string[],
  ): EmailSummary[] {
    if (excludedSenders.length === 0) {
      return emails;
    }
    const normalizedExcluded = excludedSenders
      .map((sender) => sender.trim().toLowerCase())
      .filter((sender) => sender.length > 0);
    return emails.filter((email) => {
      const senderEmail = this.extractSenderEmail(email.from);
      return !normalizedExcluded.some((excluded) =>
        this.matchesExcludedSender(senderEmail, excluded),
      );
    });
  }

  private extractSenderEmail(from: string): string {
    const trimmedFrom = from.trim().toLowerCase();
    const match = trimmedFrom.match(/<([^>]+)>/u);
    return match?.[1]?.trim() || trimmedFrom;
  }

  private matchesExcludedSender(
    senderEmail: string,
    excludedSender: string,
  ): boolean {
    if (excludedSender.startsWith('@')) {
      const senderDomain = senderEmail.split('@')[1] || '';
      return senderDomain === excludedSender.slice(1);
    }

    return senderEmail === excludedSender;
  }

  private async fetchAccountData(oauthToken: OAuthTokenRecord) {
    const provider = oauthToken.provider.toUpperCase();

    if (provider === 'GOOGLE') {
      const token = await this.getUsableGoogleToken(oauthToken);
      const [emails, events] = await Promise.all([
        this.mailService.getRecentEmails(token.accessToken, token.refreshToken),
        this.calendarService.getTodayEvents(
          token.accessToken,
          token.refreshToken,
        ),
      ]);
      return { provider, emails, events };
    }

    if (provider === 'MICROSOFT') {
      const token = await this.getUsableMicrosoftToken(oauthToken);
      const [emails, events] = await Promise.all([
        this.microsoftService.getUnreadEmails(token.accessToken),
        this.microsoftService.getTodayEvents(token.accessToken),
      ]);
      return {
        provider,
        emails,
        events: events.map((event) =>
          this.mapUnifiedEventToCalendarEvent(event),
        ),
      };
    }

    this.logger.warn(
      `Skipping unsupported OAuth provider: ${oauthToken.provider}`,
    );
    return { provider, emails: [], events: [] };
  }

  private async getUsableGoogleToken(
    oauthToken: OAuthTokenRecord,
  ): Promise<RefreshedOAuthToken> {
    if (!this.shouldRefreshToken(oauthToken)) {
      return {
        accessToken: oauthToken.accessToken,
        refreshToken: oauthToken.refreshToken || undefined,
      };
    }

    if (!oauthToken.refreshToken || this.isTokenTooOld(oauthToken)) {
      throw IntegrationProviderError.needsReauth('GOOGLE');
    }

    this.tokenRefreshQueue.enqueue(`google:${oauthToken.id}`, async () => {
      await this.refreshGoogleToken(oauthToken);
    });

    return {
      accessToken: oauthToken.accessToken,
      refreshToken: oauthToken.refreshToken || undefined,
    };
  }

  private async getUsableMicrosoftToken(
    oauthToken: OAuthTokenRecord,
  ): Promise<RefreshedOAuthToken> {
    if (!this.shouldRefreshToken(oauthToken)) {
      return {
        accessToken: oauthToken.accessToken,
        refreshToken: oauthToken.refreshToken || undefined,
      };
    }

    if (!oauthToken.refreshToken || this.isTokenTooOld(oauthToken)) {
      throw IntegrationProviderError.needsReauth('MICROSOFT');
    }

    this.tokenRefreshQueue.enqueue(`microsoft:${oauthToken.id}`, async () => {
      await this.refreshMicrosoftToken(oauthToken);
    });

    return {
      accessToken: oauthToken.accessToken,
      refreshToken: oauthToken.refreshToken || undefined,
    };
  }

  private async refreshGoogleToken(oauthToken: OAuthTokenRecord) {
    const oauth2Client = new google.auth.OAuth2(
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
    );

    oauth2Client.setCredentials({
      refresh_token: oauthToken.refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    const accessToken = credentials.access_token || oauthToken.accessToken;
    const refreshToken = credentials.refresh_token || oauthToken.refreshToken;
    const expiresAt = credentials.expiry_date
      ? new Date(credentials.expiry_date)
      : oauthToken.expiresAt;

    await this.prisma.oAuthToken.update({
      where: { id: oauthToken.id },
      data: {
        accessToken,
        refreshToken,
        expiresAt,
      },
    });
  }

  private async refreshMicrosoftToken(oauthToken: OAuthTokenRecord) {
    const response = await axios.post<MicrosoftRefreshResponse>(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      new URLSearchParams({
        client_id: this.configService.getOrThrow<string>('MICROSOFT_CLIENT_ID'),
        client_secret: this.configService.getOrThrow<string>(
          'MICROSOFT_CLIENT_SECRET',
        ),
        grant_type: 'refresh_token',
        refresh_token: oauthToken.refreshToken,
        scope: SummaryService.MICROSOFT_SCOPES,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const accessToken = response.data.access_token || oauthToken.accessToken;
    const refreshToken = response.data.refresh_token || oauthToken.refreshToken;
    const expiresInSeconds = Number(response.data.expires_in);
    const expiresAt = Number.isFinite(expiresInSeconds)
      ? new Date(Date.now() + expiresInSeconds * 1000)
      : oauthToken.expiresAt;

    await this.prisma.oAuthToken.update({
      where: { id: oauthToken.id },
      data: {
        accessToken,
        refreshToken,
        expiresAt,
      },
    });

  }

  private isTokenTooOld(oauthToken: OAuthTokenRecord) {
    if (!oauthToken.expiresAt) {
      return false;
    }

    return oauthToken.expiresAt.getTime() <= Date.now();
  }

  private shouldRefreshToken(oauthToken: OAuthTokenRecord) {
    if (!oauthToken.expiresAt) {
      return false;
    }

    return oauthToken.expiresAt.getTime() <= Date.now() + 60_000;
  }

  private buildIntegrationStatuses(
    oauthTokens: OAuthTokenRecord[],
    accountData: PromiseSettledResult<{
      provider: string;
      emails: EmailSummary[];
      events: CalendarEvent[];
    }>[],
  ): IntegrationStatus[] {
    const statuses = new Map<string, IntegrationStatus>();

    for (const oauthToken of oauthTokens) {
      const provider = oauthToken.provider.toUpperCase();
      if (!statuses.has(provider)) {
        statuses.set(provider, {
          provider,
          status: 'error',
          code: 'provider_unavailable',
          message: IntegrationProviderError.unavailable(provider).message,
        });
      }
    }

    accountData.forEach((result, index) => {
      const provider = oauthTokens[index]?.provider?.toUpperCase() || 'UNKNOWN';
      const currentStatus = statuses.get(provider);
      if (!currentStatus) {
        return;
      }

      if (result.status === 'fulfilled') {
        statuses.set(provider, {
          provider,
          status: 'ready',
        });
        return;
      }

      if (currentStatus.status === 'ready') {
        return;
      }

      const error = this.normalizeIntegrationError(provider, result.reason);
      if (
        error.code === 'needs_reauth' ||
        currentStatus.code !== 'needs_reauth'
      ) {
        statuses.set(provider, {
          provider,
          status: 'error',
          code: error.code,
          message: error.message,
        });
      }
    });

    return [...statuses.values()];
  }

  private normalizeIntegrationError(provider: string, error: unknown) {
    if (isIntegrationProviderError(error)) {
      return error;
    }

    return IntegrationProviderError.unavailable(provider);
  }

  private mapUnifiedEventToCalendarEvent(event: UnifiedEvent): CalendarEvent {
    return {
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      location: event.location,
    };
  }
}
